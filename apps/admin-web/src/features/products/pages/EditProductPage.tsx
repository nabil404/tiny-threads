import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  useGetProductQuery,
  useUpdateProductMutation,
} from '@store/api/endpoints/productsApi';
import type { UpdateProductBody } from '@store/api/endpoints/productsApi';
import { useUploadVariantImageMutation } from '@store/api/endpoints/productVariantImagesApi';
import { extractErrorMessage } from '@lib/extract-error-message';
import { ProductForm } from '../components/ProductForm';
import type { ProductFormData } from '../schemas/product-form.schema';
import {
  priceCentsToDollars,
  priceDollarsToCents,
} from '../schemas/product-form.schema';

export function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const {
    data: product,
    isLoading: isFetching,
    isError: isFetchError,
  } = useGetProductQuery(id!, { skip: !id });
  const [updateProduct, { isLoading: isUpdating }] =
    useUpdateProductMutation();
  const [uploadImage] = useUploadVariantImageMutation();
  const [error, setError] = useState<string | null>(null);

  const initialData: ProductFormData | undefined = useMemo(() => {
    if (!product) return undefined;
    return {
      title: product.title,
      description: product.description ?? undefined,
      status: product.status,
      categoryIds:
        product.productCategories?.map((pc) => pc.categoryId) ?? [],
      variants: (product.variants ?? []).map((v) => ({
        id: v.id,
        name: v.name ?? '',
        sku: v.sku,
        priceDollars: priceCentsToDollars(v.priceCents),
        stock: v.stock,
        isDefault: v.isDefault,
      })),
    };
  }, [product]);

  const existingVariantImages = useMemo(() => {
    if (!product?.variants) return new Map();
    const map = new Map<number, NonNullable<typeof product.variants>[0]['images']>();
    product.variants.forEach((v, idx) => {
      if (v.images && v.images.length > 0) {
        map.set(idx, v.images);
      }
    });
    return map;
  }, [product]);

  const variantIds = useMemo(() => {
    if (!product?.variants) return new Map();
    const map = new Map<number, string>();
    product.variants.forEach((v, idx) => map.set(idx, v.id));
    return map;
  }, [product]);

  const handleSubmit = async (
    data: ProductFormData,
    localImages: Map<number, File[]>,
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
          name: v.name || undefined,
          sku: v.sku,
          priceCents: priceDollarsToCents(v.priceDollars),
          stock: v.stock,
          isDefault: v.isDefault,
        })),
      };

      const result = await updateProduct({ id, body }).unwrap();

      // Newly-added variants have no id until this save resolves, so their
      // queued images couldn't be uploaded until now. Match by sku (unique
      // per tenant) since the response's variant order isn't guaranteed to
      // match the request order.
      for (const [index, files] of localImages) {
        if (files.length === 0) continue;
        const sku = data.variants[index]?.sku;
        const savedVariant = result.variants?.find((v) => v.sku === sku);
        if (!savedVariant) continue;
        for (const file of files) {
          await uploadImage({ productId: id, variantId: savedVariant.id, file });
        }
      }

      toast.success('Product updated successfully');
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Failed to update product'));
    }
  };

  if (isFetching) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading product...</p>
      </div>
    );
  }

  if (isFetchError || !product) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-destructive">
          Product not found or failed to load.
        </p>
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
      productId={id}
      variantIds={variantIds}
    />
  );
}
