import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import pLimit from 'p-limit';
import { extractErrorMessage } from '@lib/extract-error-message';

export interface ImageRecord {
  id: string;
  url: string;
  altText: string | null;
  sortOrder: number;
  isPrimary: boolean;
}

export type ImageUploadItemStatus = 'queued' | 'uploading' | 'done' | 'error';

export interface ImageUploadItem<TImage extends ImageRecord = ImageRecord> {
  clientId: string;
  status: ImageUploadItemStatus;
  file?: File;
  previewUrl?: string;
  progress?: number;
  errorMessage?: string;
  image?: TImage;
}

interface GroupContext {
  ownerId: string;
  groupId: string;
}

export interface UseImageUploadManagerOptions<
  TImage extends ImageRecord = ImageRecord,
> {
  concurrency?: number;
  uploadFile: (args: {
    ownerId: string;
    groupId: string;
    file: File;
    onProgress: (percent: number) => void;
    signal: AbortSignal;
  }) => Promise<TImage>;
  deleteImage: (args: {
    ownerId: string;
    groupId: string;
    imageId: string;
  }) => Promise<void>;
  reorderImages: (args: {
    ownerId: string;
    groupId: string;
    imageIds: string[];
  }) => Promise<TImage[]>;
  setPrimaryImage: (args: {
    ownerId: string;
    groupId: string;
    imageId: string;
  }) => Promise<TImage>;
}

export interface UseImageUploadManagerResult<
  TImage extends ImageRecord = ImageRecord,
> {
  getItems: (groupKey: string) => ImageUploadItem<TImage>[];
  addFiles: (groupKey: string, files: File[]) => void;
  addRejectedFile: (groupKey: string, file: File, reason: string) => void;
  removeItem: (groupKey: string, clientId: string) => void;
  retryItem: (groupKey: string, clientId: string) => void;
  reorderItems: (groupKey: string, orderedClientIds: string[]) => void;
  setPrimary: (groupKey: string, clientId: string) => void;
  hydrateExisting: (groupKey: string, images: TImage[]) => void;
  setGroupContext: (groupKey: string, ownerId: string, groupId: string) => void;
  waitForIdle: (groupKeys: string[]) => Promise<void>;
}

let clientIdCounter = 0;
function nextClientId(): string {
  clientIdCounter += 1;
  return `local-${clientIdCounter}`;
}

export function useImageUploadManager<TImage extends ImageRecord = ImageRecord>(
  options: UseImageUploadManagerOptions<TImage>,
): UseImageUploadManagerResult<TImage> {
  const itemsRef = useRef<Map<string, ImageUploadItem<TImage>[]>>(new Map());
  const contextRef = useRef<Map<string, GroupContext>>(new Map());
  const controllersRef = useRef<Map<string, AbortController>>(new Map());
  const pendingUploadsRef = useRef<Map<string, Promise<void>>>(new Map());
  const scheduledRef = useRef<Set<string>>(new Set());
  const limiterRef = useRef(pLimit(options.concurrency ?? 5));
  const [, forceRender] = useState(0);
  const rerender = useCallback(() => forceRender((n) => n + 1), []);

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((items) => {
        items.forEach((item) => {
          if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        });
      });
    };
  }, []);

  const getItems = useCallback(
    (groupKey: string) => itemsRef.current.get(groupKey) ?? [],
    [],
  );

  const setItems = useCallback(
    (groupKey: string, items: ImageUploadItem<TImage>[]) => {
      itemsRef.current.set(groupKey, items);
      rerender();
    },
    [rerender],
  );

  const updateItem = useCallback(
    (
      groupKey: string,
      clientId: string,
      patch: Partial<ImageUploadItem<TImage>>,
    ) => {
      const items = itemsRef.current.get(groupKey) ?? [];
      setItems(
        groupKey,
        items.map((item) =>
          item.clientId === clientId ? { ...item, ...patch } : item,
        ),
      );
    },
    [setItems],
  );

  const runUpload = useCallback(
    (groupKey: string, clientId: string) => {
      if (scheduledRef.current.has(clientId)) return;
      const context = contextRef.current.get(groupKey);
      const item = (itemsRef.current.get(groupKey) ?? []).find(
        (i) => i.clientId === clientId,
      );
      if (!context || !item || !item.file) return;
      const file = item.file;

      scheduledRef.current.add(clientId);

      const task = limiterRef.current(async () => {
        const currentItem = (itemsRef.current.get(groupKey) ?? []).find(
          (i) => i.clientId === clientId,
        );
        if (!currentItem || currentItem.status !== 'queued') return;

        const controller = new AbortController();
        controllersRef.current.set(clientId, controller);
        const previousPreviewUrl = currentItem.previewUrl;
        updateItem(groupKey, clientId, { status: 'uploading', progress: 0 });

        try {
          const image = await options.uploadFile({
            ownerId: context.ownerId,
            groupId: context.groupId,
            file,
            onProgress: (percent) =>
              updateItem(groupKey, clientId, { progress: percent }),
            signal: controller.signal,
          });
          if (previousPreviewUrl) URL.revokeObjectURL(previousPreviewUrl);
          updateItem(groupKey, clientId, {
            status: 'done',
            image,
            progress: undefined,
            previewUrl: undefined,
          });
        } catch (err: unknown) {
          if (controller.signal.aborted) return;
          updateItem(groupKey, clientId, {
            status: 'error',
            errorMessage: extractErrorMessage(err, 'Upload failed'),
          });
        } finally {
          controllersRef.current.delete(clientId);
          scheduledRef.current.delete(clientId);
        }
      });
      pendingUploadsRef.current.set(clientId, task);
    },
    [options, updateItem],
  );

  const scheduleUploads = useCallback(
    (groupKey: string) => {
      const items = itemsRef.current.get(groupKey) ?? [];
      items
        .filter((item) => item.status === 'queued' && item.file)
        .forEach((item) => runUpload(groupKey, item.clientId));
    },
    [runUpload],
  );

  const addFiles = useCallback(
    (groupKey: string, files: File[]) => {
      const existing = itemsRef.current.get(groupKey) ?? [];
      const newItems: ImageUploadItem<TImage>[] = files.map((file) => ({
        clientId: nextClientId(),
        status: 'queued',
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      setItems(groupKey, [...existing, ...newItems]);
      if (contextRef.current.has(groupKey)) {
        scheduleUploads(groupKey);
      }
    },
    [setItems, scheduleUploads],
  );

  const addRejectedFile = useCallback(
    (groupKey: string, file: File, reason: string) => {
      const existing = itemsRef.current.get(groupKey) ?? [];
      setItems(groupKey, [
        ...existing,
        {
          clientId: nextClientId(),
          status: 'error',
          file,
          errorMessage: reason,
        },
      ]);
    },
    [setItems],
  );

  const removeItem = useCallback(
    (groupKey: string, clientId: string) => {
      const items = itemsRef.current.get(groupKey) ?? [];
      const item = items.find((i) => i.clientId === clientId);
      if (!item) return;

      if (item.status === 'queued' || item.status === 'uploading') {
        controllersRef.current.get(clientId)?.abort();
        controllersRef.current.delete(clientId);
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        setItems(
          groupKey,
          items.filter((i) => i.clientId !== clientId),
        );
        return;
      }

      if (item.status === 'error') {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        setItems(
          groupKey,
          items.filter((i) => i.clientId !== clientId),
        );
        return;
      }

      const context = contextRef.current.get(groupKey);
      if (!context || !item.image) return;
      const imageId = item.image.id;
      const remaining = items.filter((i) => i.clientId !== clientId);
      // The backend promotes the first remaining image when the primary one is
      // deleted; mirror that locally (optimistically, like the removal itself)
      // so the grid never shows zero primaries while waiting for a refetch.
      const promotedClientId =
        item.image.isPrimary === true
          ? remaining.find((i) => i.status === 'done' && i.image)?.clientId
          : undefined;
      const withPromotion = (
        list: ImageUploadItem<TImage>[],
        isPrimary: boolean,
      ) =>
        promotedClientId === undefined
          ? list
          : list.map((i) =>
              i.clientId === promotedClientId && i.image
                ? { ...i, image: { ...i.image, isPrimary } }
                : i,
            );
      setItems(groupKey, withPromotion(remaining, true));
      options
        .deleteImage({
          ownerId: context.ownerId,
          groupId: context.groupId,
          imageId,
        })
        .catch(() => {
          const current = itemsRef.current.get(groupKey) ?? [];
          setItems(groupKey, [...withPromotion(current, false), item]);
        });
    },
    [setItems, options],
  );

  const retryItem = useCallback(
    (groupKey: string, clientId: string) => {
      updateItem(groupKey, clientId, {
        status: 'queued',
        errorMessage: undefined,
      });
      scheduleUploads(groupKey);
    },
    [updateItem, scheduleUploads],
  );

  const reorderItems = useCallback(
    (groupKey: string, orderedClientIds: string[]) => {
      const items = itemsRef.current.get(groupKey) ?? [];
      const byId = new Map(items.map((item) => [item.clientId, item]));
      const reordered = orderedClientIds
        .map((id) => byId.get(id))
        .filter((item): item is ImageUploadItem<TImage> => item !== undefined);
      // Callers reorder only the subset they render (the drag grid shows just
      // finished uploads), so anything not referenced — queued/uploading/error
      // items — must be preserved in its existing relative order rather than
      // dropped from state.
      const referencedIds = new Set(orderedClientIds);
      const untouched = items.filter(
        (item) => !referencedIds.has(item.clientId),
      );
      const nextItems = [...reordered, ...untouched];
      setItems(groupKey, nextItems);

      const previousOrder = items.map((item) => item.clientId);

      const context = contextRef.current.get(groupKey);
      if (!context) return;
      const persistedIds = nextItems
        .filter((item) => item.status === 'done' && item.image)
        .map((item) => item.image!.id);
      if (persistedIds.length === 0) return;

      options
        .reorderImages({
          ownerId: context.ownerId,
          groupId: context.groupId,
          imageIds: persistedIds,
        })
        .catch(() => {
          const current = itemsRef.current.get(groupKey) ?? [];
          const currentById = new Map(
            current.map((item) => [item.clientId, item]),
          );
          const restoredIds = previousOrder.filter((id) => currentById.has(id));
          const newArrivals = current
            .map((item) => item.clientId)
            .filter((id) => !previousOrder.includes(id));
          const restored = [...restoredIds, ...newArrivals]
            .map((id) => currentById.get(id))
            .filter(
              (item): item is ImageUploadItem<TImage> => item !== undefined,
            );
          setItems(groupKey, restored);
        });
    },
    [setItems, options],
  );

  const setPrimary = useCallback(
    (groupKey: string, clientId: string) => {
      const items = itemsRef.current.get(groupKey) ?? [];
      const target = items.find((i) => i.clientId === clientId);
      const context = contextRef.current.get(groupKey);
      if (!target || !target.image || !context) return;

      const previousPrimaryId = items.find((i) => i.image?.isPrimary)?.image
        ?.id;
      const optimistic = items.map((item) =>
        item.image
          ? {
              ...item,
              image: { ...item.image, isPrimary: item.clientId === clientId },
            }
          : item,
      );
      setItems(groupKey, optimistic);

      options
        .setPrimaryImage({
          ownerId: context.ownerId,
          groupId: context.groupId,
          imageId: target.image.id,
        })
        .catch(() => {
          const current = itemsRef.current.get(groupKey) ?? [];
          const reverted = current.map((item) =>
            item.image
              ? {
                  ...item,
                  image: {
                    ...item.image,
                    isPrimary: item.image.id === previousPrimaryId,
                  },
                }
              : item,
          );
          setItems(groupKey, reverted);
        });
    },
    [setItems, options],
  );

  const hydrateExisting = useCallback(
    (groupKey: string, images: TImage[]) => {
      const existing = itemsRef.current.get(groupKey) ?? [];
      const localOnly = existing.filter((item) => item.status !== 'done');
      const persistedItems: ImageUploadItem<TImage>[] = images
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((image) => ({
          clientId: `image-${image.id}`,
          status: 'done',
          image,
        }));
      setItems(groupKey, [...persistedItems, ...localOnly]);
    },
    [setItems],
  );

  const setGroupContext = useCallback(
    (groupKey: string, ownerId: string, groupId: string) => {
      contextRef.current.set(groupKey, { ownerId, groupId });
      scheduleUploads(groupKey);
    },
    [scheduleUploads],
  );

  const waitForIdle = useCallback(async (groupKeys: string[]) => {
    const relevantClientIds = groupKeys.flatMap((gk) =>
      (itemsRef.current.get(gk) ?? [])
        .filter(
          (item) => item.status === 'queued' || item.status === 'uploading',
        )
        .map((item) => item.clientId),
    );
    const pending = relevantClientIds
      .map((id) => pendingUploadsRef.current.get(id))
      .filter((p): p is Promise<void> => p !== undefined);
    await Promise.allSettled(pending);
  }, []);

  return useMemo(
    () => ({
      getItems,
      addFiles,
      addRejectedFile,
      removeItem,
      retryItem,
      reorderItems,
      setPrimary,
      hydrateExisting,
      setGroupContext,
      waitForIdle,
    }),
    [
      getItems,
      addFiles,
      addRejectedFile,
      removeItem,
      retryItem,
      reorderItems,
      setPrimary,
      hydrateExisting,
      setGroupContext,
      waitForIdle,
    ],
  );
}
