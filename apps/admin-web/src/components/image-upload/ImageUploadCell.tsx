import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { ImageUploadItem, ImageRecord } from './useImageUploadManager';

export interface ImageUploadCellProps<
  TImage extends ImageRecord = ImageRecord,
> {
  items: ImageUploadItem<TImage>[];
  onClick: () => void;
}

export function ImageUploadCell<TImage extends ImageRecord = ImageRecord>({
  items,
  onClick,
}: ImageUploadCellProps<TImage>) {
  const [hovered, setHovered] = useState(false);
  const primary =
    items.find((item) => item.image?.isPrimary) ??
    items.find((item) => item.status === 'done') ??
    items[0];
  const extraCount = items.length > 0 ? items.length - 1 : 0;
  const previewSrc = primary?.image?.url ?? primary?.previewUrl;

  return (
    <button
      type="button"
      aria-label="Manage images"
      className="relative w-14 h-14 shrink-0 rounded-lg border border-border bg-muted overflow-hidden cursor-pointer"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {previewSrc ? (
        <img
          src={previewSrc}
          alt="Image"
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="w-full h-full flex items-center justify-center text-muted-foreground">
          <Plus className="h-5 w-5" />
        </span>
      )}
      {hovered && extraCount > 0 && (
        <span className="absolute inset-0 bg-black/60 text-white text-sm font-semibold flex items-center justify-center">
          +{extraCount}
        </span>
      )}
    </button>
  );
}
