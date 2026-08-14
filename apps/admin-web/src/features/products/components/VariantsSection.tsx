import { useState } from 'react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button } from '@components/ui/button';
import { ConfirmDialog } from '@components/ui/confirm-dialog';
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
import { useGetTenantSettingsQuery } from '@store/api/endpoints/settingsApi';
import { makeClientKey } from '@lib/make-client-key';
import type { UseImageUploadManagerResult } from '@components/image-upload/useImageUploadManager';

const DEFAULT_CURRENCY_SYMBOL = '$';

export interface VariantsSectionProps {
  imageManager: UseImageUploadManagerResult<ProductVariantImage>;
}

export function VariantsSection({ imageManager }: VariantsSectionProps) {
  const { control, formState } = useFormContext<ProductFormData>();
  const { t } = useTranslation();
  const { data: settings } = useGetTenantSettingsQuery();
  const currencySymbol =
    settings?.defaultCurrencySymbol ?? DEFAULT_CURRENCY_SYMBOL;
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'variants',
  });
  const [variantIndexToDelete, setVariantIndexToDelete] = useState<number | null>(
    null,
  );

  const handleAddVariant = () => {
    append({
      clientKey: makeClientKey(),
      name: '',
      sku: '',
      priceDollars: 0,
      stock: 0,
      isDefault: false,
    });
  };

  const handleConfirmDelete = () => {
    if (variantIndexToDelete !== null) {
      remove(variantIndexToDelete);
      setVariantIndexToDelete(null);
    }
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
        <CardDescription>{t('products.variantsDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="border border-border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[130px]">
                  {t('products.variantImageHeader')}
                </TableHead>
                <TableHead>{t('products.variantNameHeader')}</TableHead>
                <TableHead>{t('products.variantSkuHeader')}</TableHead>
                <TableHead className="w-[120px]">
                  {t('products.variantPriceHeader', { symbol: currencySymbol })}
                </TableHead>
                <TableHead className="w-[100px]">
                  {t('products.variantStockHeader')}
                </TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {fields.map((field, index) => (
                <VariantRow
                  key={field.id}
                  index={index}
                  canDelete={fields.length > 1}
                  onRemove={() => setVariantIndexToDelete(index)}
                  imageManager={imageManager}
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

        <ConfirmDialog
          open={variantIndexToDelete !== null}
          onOpenChange={(open) => {
            if (!open) setVariantIndexToDelete(null);
          }}
          title={t('products.deleteVariantTitle')}
          description={t('products.deleteVariantConfirm')}
          confirmText={t('products.delete')}
          cancelText={t('common.cancel')}
          onConfirm={handleConfirmDelete}
        />
      </CardContent>
    </Card>
  );
}
