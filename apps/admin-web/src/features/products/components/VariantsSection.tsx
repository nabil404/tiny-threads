import { useFieldArray, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button } from '@components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@components/ui/card';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@components/ui/table';
import { VariantRow } from './VariantRow';
import type { ProductFormData } from '../schemas/product-form.schema';
import type { ProductVariantImage } from '@store/api/endpoints/productsApi';

export interface VariantsSectionProps {
  mode: 'create' | 'edit';
  variantImages: Map<number, File[]>;
  onVariantImagesChange: (images: Map<number, File[]>) => void;
  existingVariantImages?: Map<number, ProductVariantImage[]>;
  productId?: string;
  variantIds?: Map<number, string>;
}

export function VariantsSection({
  mode,
  variantImages,
  onVariantImagesChange,
  existingVariantImages = new Map(),
  productId,
  variantIds = new Map(),
}: VariantsSectionProps) {
  const { control, formState } = useFormContext<ProductFormData>();
  const { t } = useTranslation();
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'variants',
  });

  const handleAddVariant = () => {
    append({
      name: '',
      sku: '',
      priceDollars: 0,
      stock: 0,
      isDefault: false,
    });
  };

  const handleRemoveVariant = (index: number) => {
    remove(index);
    const newImages = new Map<number, File[]>();
    for (const [idx, files] of variantImages) {
      if (idx < index) newImages.set(idx, files);
      else if (idx > index) newImages.set(idx - 1, files);
    }
    onVariantImagesChange(newImages);
  };

  const handleLocalFilesChange = (index: number, files: File[]) => {
    const newImages = new Map(variantImages);
    newImages.set(index, files);
    onVariantImagesChange(newImages);
  };

  const variantsError = formState.errors.variants;
  const rootError =
    variantsError && 'root' in variantsError
      ? variantsError.root
      : variantsError && 'message' in variantsError
        ? variantsError
        : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('products.variantsTitle')}</CardTitle>
        <CardDescription>
          {t('products.variantsDescription')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="border border-border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[130px]">{t('products.variantImageHeader')}</TableHead>
                <TableHead>{t('products.variantNameHeader')}</TableHead>
                <TableHead>{t('products.variantSkuHeader')}</TableHead>
                <TableHead className="w-[120px]">{t('products.variantPriceHeader')}</TableHead>
                <TableHead className="w-[100px]">{t('products.variantStockHeader')}</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((field, index) => (
                <VariantRow
                  key={field.id}
                  index={index}
                  mode={mode}
                  canDelete={fields.length > 1}
                  onRemove={() => handleRemoveVariant(index)}
                  localFiles={variantImages.get(index) ?? []}
                  onLocalFilesChange={(files) =>
                    handleLocalFilesChange(index, files)
                  }
                  existingImages={existingVariantImages.get(index)}
                  productId={productId}
                  variantId={variantIds.get(index)}
                />
              ))}
            </TableBody>
          </Table>
        </div>

        <Button
          type="button"
          variant="ghost"
          className="mt-3 text-primary"
          onClick={handleAddVariant}
        >
          <Plus className="h-4 w-4 mr-1" />
          {t('products.addVariant')}
        </Button>

        {rootError && (
          <p className="mt-1 text-xs font-medium text-destructive">
            {rootError.message as string}
          </p>
        )}

        <p className="mt-2 text-xs text-muted-foreground">
          {t('products.variantMinNotice')}
        </p>
      </CardContent>
    </Card>
  );
}
