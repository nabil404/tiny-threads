import { useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { X, Star, Info } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@components/ui/dialog';
import { ConfirmDialog } from '@components/ui/confirm-dialog';
import type { ImageUploadItem, ImageRecord } from './useImageUploadManager';

const ACCEPTED_TYPES = {
  'image/jpeg': [],
  'image/png': [],
  'image/webp': [],
  'image/avif': [],
};
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export interface ImageUploadLabels {
  dropzone: string;
  uploadingSection: (count: number) => string;
  imagesSection: (count: number) => string;
  selectedImagesSection?: (count: number) => string;
  uploadOnCreationNotice?: string;
  retry: string;
  removeImage: string;
  setPrimaryImage: string;
  dragToReorder: string;
  fileTooLarge: string;
  fileInvalidType: string;
  deleteTitle?: string;
  deleteConfirm?: string;
  cancel?: string;
  delete?: string;
  deleteSuccess?: string;
}

export interface ImageUploadPopupProps<
  TImage extends ImageRecord = ImageRecord,
> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  labels: ImageUploadLabels;
  items: ImageUploadItem<TImage>[];
  mode?: 'create' | 'edit';
  onAddFiles: (files: File[]) => void;
  onAddRejectedFile: (file: File, reason: string) => void;
  onRemoveItem: (clientId: string) => void;
  onRetryItem: (clientId: string) => void;
  onReorder: (orderedClientIds: string[]) => void;
  onSetPrimary: (clientId: string) => void;
}

export function ImageUploadPopup<TImage extends ImageRecord = ImageRecord>({
  open,
  onOpenChange,
  title,
  labels,
  items,
  mode = 'edit',
  onAddFiles,
  onAddRejectedFile,
  onRemoveItem,
  onRetryItem,
  onReorder,
  onSetPrimary,
}: ImageUploadPopupProps<TImage>) {
  const sensors = useSensors(useSensor(PointerSensor));
  const [imageToDelete, setImageToDelete] = useState<string | null>(null);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ACCEPTED_TYPES,
    maxSize: MAX_FILE_SIZE,
    multiple: true,
    onDrop: (acceptedFiles: File[], rejections: FileRejection[]) => {
      if (acceptedFiles.length > 0) onAddFiles(acceptedFiles);
      rejections.forEach(({ file, errors }) => {
        const reason =
          errors[0]?.code === 'file-too-large'
            ? labels.fileTooLarge
            : labels.fileInvalidType;
        onAddRejectedFile(file, reason);
      });
    },
  });

  const isCreateMode = mode === 'create';
  const displayItems = isCreateMode
    ? items.filter((item) => item.status !== 'error')
    : items.filter((item) => item.status === 'done');
  const uploadingItems = items.filter((item) => item.status !== 'done');
  const errorItems = items.filter((item) => item.status === 'error');

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = displayItems.findIndex(
      (item) => item.clientId === active.id,
    );
    const newIndex = displayItems.findIndex(
      (item) => item.clientId === over.id,
    );
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(displayItems, oldIndex, newIndex);
    onReorder(reordered.map((item) => item.clientId));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-5 text-center text-sm cursor-pointer transition-colors ${
            isDragActive
              ? 'border-primary bg-primary/5 text-primary'
              : 'border-border text-muted-foreground hover:border-primary/50'
          }`}
        >
          <input {...getInputProps()} />
          <p>{labels.dropzone}</p>
        </div>

        {isCreateMode && (
          <div className="flex items-center gap-2 p-2.5 text-xs text-muted-foreground bg-muted/50 rounded-lg border border-border">
            <Info className="h-4 w-4 shrink-0 text-primary" />
            <span>
              {labels.uploadOnCreationNotice ??
                'Photos will be uploaded on product creation.'}
            </span>
          </div>
        )}

        {isCreateMode && errorItems.length > 0 && (
          <div className="space-y-1">
            {errorItems.map((item) => (
              <div
                key={item.clientId}
                className="flex items-center justify-between gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/20 text-xs text-destructive"
              >
                <span className="truncate">
                  {item.file?.name
                    ? `${item.file.name}: ${item.errorMessage}`
                    : item.errorMessage}
                </span>
                <button
                  type="button"
                  aria-label={labels.removeImage}
                  className="cursor-pointer hover:opacity-80 p-0.5"
                  onClick={() => onRemoveItem(item.clientId)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {!isCreateMode && uploadingItems.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">
              {labels.uploadingSection(uploadingItems.length)}
            </p>
            <div className="max-h-[150px] overflow-y-auto border border-border rounded-lg divide-y divide-border">
              {uploadingItems.map((item) => (
                <div
                  key={item.clientId}
                  className="flex items-center gap-2 px-2 py-1.5"
                >
                  <div className="w-8 h-8 shrink-0 rounded bg-muted overflow-hidden">
                    {item.previewUrl && (
                      <img
                        src={item.previewUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs truncate text-foreground font-medium">
                      {item.file?.name}
                    </p>
                    {item.status === 'error' ? (
                      <p className="text-xs text-destructive">
                        {item.errorMessage}
                      </p>
                    ) : (
                      <div className="h-1 rounded bg-muted overflow-hidden mt-0.5">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${item.progress ?? 0}%` }}
                        />
                      </div>
                    )}
                  </div>
                  {item.status === 'error' && (
                    <button
                      type="button"
                      className="text-xs text-primary underline cursor-pointer"
                      onClick={() => onRetryItem(item.clientId)}
                    >
                      {labels.retry}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={labels.removeImage}
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 p-0.5 rounded transition-colors cursor-pointer"
                    onClick={() => onRemoveItem(item.clientId)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {displayItems.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-1.5">
              {isCreateMode && labels.selectedImagesSection
                ? labels.selectedImagesSection(displayItems.length)
                : labels.imagesSection(displayItems.length)}
            </p>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={displayItems.map((item) => item.clientId)}
                strategy={rectSortingStrategy}
              >
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                  {displayItems.map((item) => (
                    <SortableImageTile
                      key={item.clientId}
                      item={item}
                      labels={labels}
                      onRemove={() => {
                        if (isCreateMode) {
                          onRemoveItem(item.clientId);
                        } else {
                          setImageToDelete(item.clientId);
                        }
                      }}
                      onSetPrimary={() => onSetPrimary(item.clientId)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}

        <ConfirmDialog
          open={imageToDelete !== null}
          onOpenChange={(open) => {
            if (!open) setImageToDelete(null);
          }}
          title={labels.deleteTitle ?? 'Delete Image'}
          description={
            labels.deleteConfirm ??
            'Are you sure you want to delete this image? This action cannot be undone.'
          }
          confirmText={labels.delete ?? 'Delete'}
          cancelText={labels.cancel ?? 'Cancel'}
          onConfirm={() => {
            if (imageToDelete) {
              onRemoveItem(imageToDelete);
              setImageToDelete(null);
              toast.success(
                labels.deleteSuccess ?? 'Image deleted successfully',
              );
            }
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

interface SortableImageTileProps<TImage extends ImageRecord = ImageRecord> {
  item: ImageUploadItem<TImage>;
  labels: ImageUploadLabels;
  onRemove: () => void;
  onSetPrimary: () => void;
}

function SortableImageTile<TImage extends ImageRecord = ImageRecord>({
  item,
  labels,
  onRemove,
  onSetPrimary,
}: SortableImageTileProps<TImage>) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id: item.clientId,
    });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isPrimary = Boolean(item.image?.isPrimary || item.isPrimary);
  const imageSrc = item.image?.url ?? item.previewUrl;
  const imageAlt = item.image?.altText ?? item.file?.name ?? '';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted"
    >
      {imageSrc && (
        <img
          src={imageSrc}
          alt={imageAlt}
          className="w-full h-full object-cover"
        />
      )}
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={labels.dragToReorder}
        className="absolute top-1 left-1 bg-black/55 text-white rounded px-1 text-xs cursor-grab"
      >
        ⠿
      </button>
      <button
        type="button"
        aria-label={labels.removeImage}
        className="absolute top-1 right-1 bg-black/55 text-white rounded-full w-4 h-4 flex items-center justify-center cursor-pointer hover:bg-destructive hover:text-destructive-foreground transition-colors"
        onClick={onRemove}
      >
        <X className="h-2.5 w-2.5" />
      </button>
      <button
        type="button"
        aria-label={labels.setPrimaryImage}
        onClick={onSetPrimary}
        className={`absolute bottom-1 left-1 rounded px-1 text-xs flex items-center gap-0.5 cursor-pointer ${
          isPrimary
            ? 'bg-yellow-400 text-black'
            : 'bg-black/55 text-white hover:bg-black/75'
        }`}
      >
        <Star className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}
