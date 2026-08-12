import { useFormContext } from 'react-hook-form';
import { Trash2 } from 'lucide-react';
import {
  FormField,
  FormItem,
  FormControl,
} from '@components/ui/form';
import { Input } from '@components/ui/input';
import { Button } from '@components/ui/button';
import { TableCell, TableRow } from '@components/ui/table';
import { VariantImageUploader } from './VariantImageUploader';
import type { ProductFormData } from '../schemas/product-form.schema';
import type { ProductVariantImage } from '@store/api/endpoints/productsApi';

export interface VariantRowProps {
  index: number;
  mode: 'create' | 'edit';
  canDelete: boolean;
  onRemove: () => void;
  localFiles: File[];
  onLocalFilesChange: (files: File[]) => void;
  existingImages?: ProductVariantImage[];
  productId?: string;
  variantId?: string;
}

export function VariantRow({
  index,
  mode,
  canDelete,
  onRemove,
  localFiles,
  onLocalFilesChange,
  existingImages = [],
  productId,
  variantId,
}: VariantRowProps) {
  const { control } = useFormContext<ProductFormData>();

  return (
    <TableRow>
      <TableCell className="px-3 py-2">
        <VariantImageUploader
          mode={mode}
          existingImages={existingImages}
          localFiles={localFiles}
          onLocalFilesChange={onLocalFilesChange}
          productId={productId}
          variantId={variantId}
        />
      </TableCell>

      <TableCell className="px-3 py-2">
        <FormField
          control={control}
          name={`variants.${index}.name`}
          render={({ field }) => (
            <FormItem className="space-y-0">
              <FormControl>
                <Input placeholder="Variant name" {...field} />
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
                <Input placeholder="e.g. SKU-123" {...field} />
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
                <Input
                  type="number"
                  min="0"
                  placeholder="0"
                  {...field}
                />
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
