import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useCreateProductMutation } from '@store/api/endpoints/productsApi';
import { extractErrorMessage } from '@lib/extract-error-message';
import { ProductForm } from '../components/ProductForm';
import type { ProductFormData } from '../schemas/product-form.schema';
import { priceDollarsToCents } from '../schemas/product-form.schema';

export function CreateProductPage() {
  const navigate = useNavigate();
  const [createProduct, { isLoading }] = useCreateProductMutation();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (
    data: ProductFormData,
    localImages: Map<number, File[]>,
  ) => {
    setError(null);

    try {
      const payload = {
        title: data.title,
        description: data.description ?? undefined,
        status: data.status,
        categoryIds: data.categoryIds.length > 0 ? data.categoryIds : undefined,
        variants: data.variants.map((v) => ({
          name: v.name || undefined,
          sku: v.sku,
          priceCents: priceDollarsToCents(v.priceDollars),
          stock: v.stock,
          isDefault: v.isDefault,
        })),
      };

      const formData = new FormData();
      formData.append('data', JSON.stringify(payload));

      for (const [variantIndex, files] of localImages) {
        files.forEach((file, imgIndex) => {
          formData.append(
            `variants[${variantIndex}].images[${imgIndex}]`,
            file,
          );
        });
      }

      const result = await createProduct(formData).unwrap();
      toast.success('Product created successfully');
      navigate(`/products/${result.id}/edit`);
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Failed to create product'));
    }
  };

  return (
    <ProductForm
      mode="create"
      onSubmit={handleSubmit}
      isSubmitting={isLoading}
      error={error}
    />
  );
}
