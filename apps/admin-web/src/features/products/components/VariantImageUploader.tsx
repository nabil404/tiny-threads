import { useRef } from 'react';
import { Plus, Image as ImageIcon, X } from 'lucide-react';
import {
  useUploadVariantImageMutation,
  useDeleteVariantImageMutation,
} from '@store/api/endpoints/productVariantImagesApi';
import type { ProductVariantImage } from '@store/api/endpoints/productsApi';

export interface VariantImageUploaderProps {
  mode: 'create' | 'edit';
  /** Existing images from the server (edit mode) */
  existingImages?: ProductVariantImage[];
  /** Locally queued files (create mode) */
  localFiles: File[];
  onLocalFilesChange: (files: File[]) => void;
  /** Required for edit mode API calls */
  productId?: string;
  variantId?: string;
}

export function VariantImageUploader({
  mode,
  existingImages = [],
  localFiles,
  onLocalFilesChange,
  productId,
  variantId,
}: VariantImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadImage] = useUploadVariantImageMutation();
  const [deleteImage] = useDeleteVariantImageMutation();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    if (mode === 'create') {
      onLocalFilesChange([...localFiles, ...files]);
    } else if (productId && variantId) {
      for (const file of files) {
        await uploadImage({ productId, variantId, file });
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveLocal = (index: number) => {
    onLocalFilesChange(localFiles.filter((_, i) => i !== index));
  };

  const handleRemoveExisting = async (imageId: string) => {
    if (productId && variantId) {
      await deleteImage({ productId, variantId, imageId });
    }
  };

  return (
    <div className="flex items-center gap-1 overflow-x-auto py-1 max-w-[120px]">
      {existingImages.map((img) => (
        <div
          key={img.id}
          className="relative w-10 h-10 shrink-0 border border-border rounded bg-muted group"
        >
          <img
            src={img.url}
            alt={img.altText ?? ''}
            className="w-full h-full object-cover rounded"
          />
          {mode === 'edit' && (
            <button
              type="button"
              className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => handleRemoveExisting(img.id)}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
      ))}

      {localFiles.map((file, idx) => (
        <div
          key={`local-${idx}`}
          className="relative w-10 h-10 shrink-0 border border-border rounded bg-muted group"
        >
          <img
            src={URL.createObjectURL(file)}
            alt={file.name}
            className="w-full h-full object-cover rounded"
          />
          <button
            type="button"
            className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => handleRemoveLocal(idx)}
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      ))}

      {existingImages.length === 0 && localFiles.length === 0 && (
        <div className="w-10 h-10 shrink-0 border border-border rounded bg-muted flex items-center justify-center">
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
        </div>
      )}

      <button
        type="button"
        className="w-10 h-10 shrink-0 border border-dashed border-border rounded bg-muted flex items-center justify-center cursor-pointer hover:bg-accent transition-colors"
        onClick={() => fileInputRef.current?.click()}
      >
        <Plus className="h-4 w-4 text-muted-foreground" />
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  );
}
