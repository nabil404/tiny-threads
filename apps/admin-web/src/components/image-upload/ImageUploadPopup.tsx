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
import { X, Star } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@components/ui/dialog';
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
  retry: string;
  removeImage: string;
  setPrimaryImage: string;
  dragToReorder: string;
  fileTooLarge: string;
  fileInvalidType: string;
}

export interface ImageUploadPopupProps<TImage extends ImageRecord = ImageRecord> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  labels: ImageUploadLabels;
  items: ImageUploadItem<TImage>[];
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
  onAddFiles,
  onAddRejectedFile,
  onRemoveItem,
  onRetryItem,
  onReorder,
  onSetPrimary,
}: ImageUploadPopupProps<TImage>) {
  const sensors = useSensors(useSensor(PointerSensor));

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

  const uploadingItems = items.filter((item) => item.status !== 'done');
  const doneItems = items.filter((item) => item.status === 'done');

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = doneItems.findIndex((item) => item.clientId === active.id);
    const newIndex = doneItems.findIndex((item) => item.clientId === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(doneItems, oldIndex, newIndex);
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
              ? 'border-primary bg-primary/5'
              : 'border-border text-muted-foreground'
          }`}
        >
          <input {...getInputProps()} />
          <p>{labels.dropzone}</p>
        </div>

        {uploadingItems.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">
              {labels.uploadingSection(uploadingItems.length)}
            </p>
            <div className="max-h-[150px] overflow-y-auto border border-border rounded-lg divide-y divide-border">
              {uploadingItems.map((item) => (
                <div key={item.clientId} className="flex items-center gap-2 px-2 py-1.5">
                  <div className="w-8 h-8 shrink-0 rounded bg-muted overflow-hidden">
                    {item.previewUrl && (
                      <img src={item.previewUrl} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs truncate">{item.file?.name}</p>
                    {item.status === 'error' ? (
                      <p className="text-xs text-destructive">{item.errorMessage}</p>
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
                      className="text-xs text-primary underline"
                      onClick={() => onRetryItem(item.clientId)}
                    >
                      {labels.retry}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={labels.removeImage}
                    onClick={() => onRemoveItem(item.clientId)}
                  >
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {doneItems.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">
              {labels.imagesSection(doneItems.length)}
            </p>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={doneItems.map((item) => item.clientId)}
                strategy={rectSortingStrategy}
              >
                <div className="grid grid-cols-4 gap-2">
                  {doneItems.map((item) => (
                    <SortableImageTile
                      key={item.clientId}
                      item={item}
                      labels={labels}
                      onRemove={() => onRemoveItem(item.clientId)}
                      onSetPrimary={() => onSetPrimary(item.clientId)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        )}
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
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: item.clientId,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative aspect-square rounded-lg overflow-hidden border border-border bg-muted"
    >
      <img src={item.image?.url} alt={item.image?.altText ?? ''} className="w-full h-full object-cover" />
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
        className="absolute top-1 right-1 bg-black/55 text-white rounded-full w-4 h-4 flex items-center justify-center"
        onClick={onRemove}
      >
        <X className="h-2.5 w-2.5" />
      </button>
      <button
        type="button"
        aria-label={labels.setPrimaryImage}
        onClick={onSetPrimary}
        className={`absolute bottom-1 left-1 rounded px-1 text-xs flex items-center gap-0.5 ${
          item.image?.isPrimary ? 'bg-yellow-400 text-black' : 'bg-black/55 text-white'
        }`}
      >
        <Star className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}
