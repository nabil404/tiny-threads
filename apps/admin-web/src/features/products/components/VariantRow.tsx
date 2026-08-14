import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { FormField, FormItem, FormControl } from '@components/ui/form';
import { Input } from '@components/ui/input';
import { Button } from '@components/ui/button';
import { TableCell, TableRow } from '@components/ui/table';
import { ImageUploadCell } from '@components/image-upload/ImageUploadCell';
import {
  ImageUploadPopup,
  type ImageUploadLabels,
} from '@components/image-upload/ImageUploadPopup';
import type { UseImageUploadManagerResult } from '@components/image-upload/useImageUploadManager';
import type { ProductFormData } from '../schemas/product-form.schema';
import type { ProductVariantImage } from '@store/api/endpoints/productsApi';

export interface VariantRowProps {
  index: number;
  canDelete: boolean;
  onRemove: () => void;
  imageManager: UseImageUploadManagerResult<ProductVariantImage>;
}

export function VariantRow({
  index,
  canDelete,
  onRemove,
  imageManager,
}: VariantRowProps) {
  const { control, watch } = useFormContext<ProductFormData>();
  const { t } = useTranslation();
  const [popupOpen, setPopupOpen] = useState(false);
  const clientKey = watch(`variants.${index}.clientKey`);
  const name = watch(`variants.${index}.name`);
  const sku = watch(`variants.${index}.sku`);
  const items = imageManager.getItems(clientKey);

  const labels: ImageUploadLabels = {
    dropzone: t('products.dropzoneLabel'),
    uploadingSection: (count) => t('products.uploadingCount', { count }),
    imagesSection: (count) => t('products.imagesCount', { count }),
    retry: t('products.retry'),
    removeImage: t('products.removeImage'),
    setPrimaryImage: t('products.setPrimaryImage'),
    dragToReorder: t('products.dragToReorder'),
    fileTooLarge: t('products.imageTooLarge'),
    fileInvalidType: t('products.imageInvalidType'),
  };

  return (
    <TableRow>
      <TableCell className="px-3 py-2">
        <ImageUploadCell items={items} onClick={() => setPopupOpen(true)} />
        <ImageUploadPopup
          open={popupOpen}
          onOpenChange={setPopupOpen}
          title={t('products.manageImagesTitle', {
            variant: name || sku || `#${index + 1}`,
          })}
          labels={labels}
          items={items}
          onAddFiles={(files) => imageManager.addFiles(clientKey, files)}
          onAddRejectedFile={(file, reason) =>
            imageManager.addRejectedFile(clientKey, file, reason)
          }
          onRemoveItem={(clientId) =>
            imageManager.removeItem(clientKey, clientId)
          }
          onRetryItem={(clientId) =>
            imageManager.retryItem(clientKey, clientId)
          }
          onReorder={(orderedClientIds) =>
            imageManager.reorderItems(clientKey, orderedClientIds)
          }
          onSetPrimary={(clientId) =>
            imageManager.setPrimary(clientKey, clientId)
          }
        />
      </TableCell>

      <TableCell className="px-3 py-2">
        <FormField
          control={control}
          name={`variants.${index}.name`}
          render={({ field }) => (
            <FormItem className="space-y-0">
              <FormControl>
                <Input
                  placeholder={t('products.variantNamePlaceholder')}
                  {...field}
                />
              </FormControl>
            </FormItem>
          )}
        />
      </TableCell>

      <TableCell className="px-3 py-2">
        <FormField
          control={control}
          name={`variants.${index}.sku`}
          render={({ field }) => (
            <FormItem className="space-y-0">
              <FormControl>
                <Input placeholder={t('products.skuPlaceholder')} {...field} />
              </FormControl>
            </FormItem>
          )}
        />
      </TableCell>

      <TableCell className="px-3 py-2">
        <FormField
          control={control}
          name={`variants.${index}.priceDollars`}
          render={({ field }) => (
            <FormItem className="space-y-0">
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  {...field}
                />
              </FormControl>
            </FormItem>
          )}
        />
      </TableCell>

      <TableCell className="px-3 py-2">
        <FormField
          control={control}
          name={`variants.${index}.stock`}
          render={({ field }) => (
            <FormItem className="space-y-0">
              <FormControl>
                <Input type="number" min="0" placeholder="0" {...field} />
              </FormControl>
            </FormItem>
          )}
        />
      </TableCell>

      <TableCell className="px-3 py-2 text-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          disabled={!canDelete}
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
