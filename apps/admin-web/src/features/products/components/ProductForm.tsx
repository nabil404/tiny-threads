import { useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Form } from '@components/ui/form';
import { Button } from '@components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@components/ui/breadcrumb';
import { GeneralInfoSection } from './GeneralInfoSection';
import { VariantsSection } from './VariantsSection';
import { OrganizationSidebar } from './OrganizationSidebar';
import {
  productFormSchema,
  type ProductFormData,
} from '../schemas/product-form.schema';
import type { ProductVariantImage } from '@store/api/endpoints/productsApi';

export interface ProductFormProps {
  mode: 'create' | 'edit';
  initialData?: ProductFormData;
  onSubmit: (
    data: ProductFormData,
    localImages: Map<number, File[]>,
  ) => Promise<void>;
  isSubmitting: boolean;
  error?: string | null;
  existingVariantImages?: Map<number, ProductVariantImage[]>;
  productId?: string;
  variantIds?: Map<number, string>;
}

const DEFAULT_FORM_DATA: ProductFormData = {
  title: '',
  description: '',
  status: 'draft',
  categoryIds: [],
  variants: [
    { name: '', sku: '', priceDollars: 0, stock: 0, isDefault: true },
  ],
};

export function ProductForm({
  mode,
  initialData,
  onSubmit,
  isSubmitting,
  error,
  existingVariantImages,
  productId,
  variantIds,
}: ProductFormProps) {
  const navigate = useNavigate();
  const [variantImages, setVariantImages] = useState<Map<number, File[]>>(
    new Map(),
  );

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productFormSchema) as unknown as Resolver<ProductFormData>,
    defaultValues: initialData ?? DEFAULT_FORM_DATA,
  });

  const handleSubmit = async (data: ProductFormData) => {
    await onSubmit(data, variantImages);
  };

  const pageTitle =
    mode === 'create' ? 'Add New Product' : 'Edit Product';
  const pageDescription =
    mode === 'create'
      ? 'Create a new product listing in your catalog.'
      : 'Update your product details, variants, and categories.';

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/products">Products</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{pageTitle}</h1>
          <p className="text-sm text-muted-foreground">{pageDescription}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/products')}
          >
            Discard
          </Button>
          <Button
            type="submit"
            form="product-form"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : 'Save Product'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Form {...form}>
        <form
          id="product-form"
          onSubmit={form.handleSubmit(handleSubmit)}
          noValidate
        >
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-[1200px]">
            <div className="lg:col-span-2 space-y-6">
              <GeneralInfoSection />
              <VariantsSection
                mode={mode}
                variantImages={variantImages}
                onVariantImagesChange={setVariantImages}
                existingVariantImages={existingVariantImages}
                productId={productId}
                variantIds={variantIds}
              />
            </div>
            <div className="space-y-6">
              <OrganizationSidebar />
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
