import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  useGetProductQuery,
  useUpdateProductMutation,
} from '@store/api/endpoints/productsApi';
import type {
  UpdateProductBody,
  ProductVariantImage,
} from '@store/api/endpoints/productsApi';
import { extractErrorMessage } from '@lib/extract-error-message';
import { makeClientKey } from '@lib/make-client-key';
import { ProductForm } from '../components/ProductForm';
import type { ProductFormData } from '../schemas/product-form.schema';
import {
  priceCentsToDollars,
  priceDollarsToCents,
} from '../schemas/product-form.schema';
import type { UseImageUploadManagerResult } from '@components/image-upload/useImageUploadManager';

export function EditProductPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const {
    data: product,
    isLoading: isFetching,
    isError: isFetchError,
  } = useGetProductQuery(id!, { skip: !id });
  const [updateProduct, { isLoading: isUpdating }] = useUpdateProductMutation();
  const [error, setError] = useState<string | null>(null);

  const initialData: ProductFormData | undefined = useMemo(() => {
    if (!product) return undefined;
    return {
      title: product.title,
      description: product.description ?? undefined,
      status: product.status,
      categoryIds: product.productCategories?.map((pc) => pc.categoryId) ?? [],
      variants: (product.variants ?? []).map((v) => ({
        id: v.id,
        clientKey: v.id ?? makeClientKey(),
        name: v.name ?? '',
        sku: v.sku,
        priceDollars: priceCentsToDollars(v.priceCents),
        stock: v.stock,
        isDefault: v.isDefault,
      })),
    };
  }, [product]);

  const existingVariantImages = useMemo(() => {
    const map = new Map<string, ProductVariantImage[]>();
    if (!product?.variants) return map;
    initialData?.variants.forEach((formVariant, idx) => {
      const images = product.variants?.[idx]?.images;
      if (images && images.length > 0) {
        map.set(formVariant.clientKey, images);
      }
    });
    return map;
  }, [product, initialData]);

  const variantContexts = useMemo(() => {
    const map = new Map<string, string>();
    if (!product?.variants) return map;
    initialData?.variants.forEach((formVariant, idx) => {
      const variantId = product.variants?.[idx]?.id;
      if (variantId) map.set(formVariant.clientKey, variantId);
    });
    return map;
  }, [product, initialData]);

  const handleSubmit = async (
    data: ProductFormData,
    imageManager: UseImageUploadManagerResult<ProductVariantImage>,
  ) => {
    if (!id) return;
    setError(null);

    try {
      const body: UpdateProductBody = {
        title: data.title,
        description: data.description ?? undefined,
        status: data.status,
        categoryIds: data.categoryIds,
        variants: data.variants.map((v) => ({
          id: v.id,
          clientKey: v.clientKey,
          name: v.name || undefined,
          sku: v.sku,
          priceCents: priceDollarsToCents(v.priceDollars),
          stock: v.stock,
          isDefault: v.isDefault,
        })),
      };

      const result = await updateProduct({ id, body }).unwrap();

      data.variants.forEach((v) => {
        const saved = result.variants?.find(
          (rv) => rv.clientKey === v.clientKey,
        );
        if (saved) imageManager.setGroupContext(v.clientKey, id, saved.id);
      });

      toast.success(t('products.updateSuccess'));
    } catch (err: unknown) {
      setError(extractErrorMessage(err, t('products.updateError')));
    }
  };

  if (isFetching) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">{t('products.loadingProduct')}</p>
      </div>
    );
  }

  if (isFetchError || !product) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-destructive">{t('products.loadError')}</p>
      </div>
    );
  }

  return (
    <ProductForm
      mode="edit"
      initialData={initialData}
      onSubmit={handleSubmit}
      isSubmitting={isUpdating}
      error={error}
      existingVariantImages={existingVariantImages}
      variantContexts={variantContexts}
      productId={id}
    />
  );
}
