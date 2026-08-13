import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  useCreateProductMutation,
  type ProductVariantImage,
} from '@store/api/endpoints/productsApi';
import { extractErrorMessage } from '@lib/extract-error-message';
import { ProductForm } from '../components/ProductForm';
import type { ProductFormData } from '../schemas/product-form.schema';
import { priceDollarsToCents } from '../schemas/product-form.schema';
import type { UseImageUploadManagerResult } from '@components/image-upload/useImageUploadManager';

export function CreateProductPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [createProduct, { isLoading }] = useCreateProductMutation();
  const [error, setError] = useState<string | null>(null);
  const [isFinalizingImages, setIsFinalizingImages] = useState(false);

  const handleSubmit = async (
    data: ProductFormData,
    imageManager: UseImageUploadManagerResult<ProductVariantImage>,
  ) => {
    setError(null);

    try {
      const payload = {
        title: data.title,
        description: data.description ?? undefined,
        status: data.status,
        categoryIds: data.categoryIds.length > 0 ? data.categoryIds : undefined,
        variants: data.variants.map((v) => ({
          clientKey: v.clientKey,
          name: v.name || undefined,
          sku: v.sku,
          priceCents: priceDollarsToCents(v.priceDollars),
          stock: v.stock,
          isDefault: v.isDefault,
        })),
      };

      const result = await createProduct(payload).unwrap();

      setIsFinalizingImages(true);
      const clientKeys = data.variants.map((v) => v.clientKey);
      for (const v of data.variants) {
        const saved = result.variants?.find(
          (rv) => rv.clientKey === v.clientKey,
        );
        if (saved) {
          imageManager.setGroupContext(v.clientKey, result.id, saved.id);
        }
      }
      await imageManager.waitForIdle(clientKeys);
      setIsFinalizingImages(false);

      toast.success(t('products.createSuccess'));
      navigate(`/products/${result.id}/edit`);
    } catch (err: unknown) {
      setIsFinalizingImages(false);
      setError(extractErrorMessage(err, t('products.createError')));
    }
  };

  return (
    <ProductForm
      mode="create"
      onSubmit={handleSubmit}
      isSubmitting={isLoading || isFinalizingImages}
      error={error}
    />
  );
}
