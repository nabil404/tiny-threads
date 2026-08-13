import { useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
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
import {
  useUploadVariantImageMutation,
  useDeleteVariantImageMutation,
  useReorderVariantImagesMutation,
  useSetPrimaryVariantImageMutation,
} from '@store/api/endpoints/productVariantImagesApi';
import {
  useImageUploadManager,
  type UseImageUploadManagerResult,
} from '@components/image-upload/useImageUploadManager';

export interface ProductFormProps {
  mode: 'create' | 'edit';
  initialData?: ProductFormData;
  onSubmit: (
    data: ProductFormData,
    imageManager: UseImageUploadManagerResult<ProductVariantImage>,
  ) => Promise<void>;
  isSubmitting: boolean;
  error?: string | null;
  existingVariantImages?: Map<string, ProductVariantImage[]>;
  variantContexts?: Map<string, string>;
  productId?: string;
}

function createDefaultFormData(): ProductFormData {
  return {
    title: '',
    description: undefined,
    status: 'draft',
    categoryIds: [],
    variants: [
      {
        clientKey: crypto.randomUUID(),
        name: '',
        sku: '',
        priceDollars: 0,
        stock: 0,
        isDefault: true,
      },
    ],
  };
}

export function ProductForm({
  mode,
  initialData,
  onSubmit,
  isSubmitting,
  error,
  existingVariantImages,
  variantContexts,
  productId,
}: ProductFormProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [uploadImage] = useUploadVariantImageMutation();
  const [deleteImage] = useDeleteVariantImageMutation();
  const [reorderImages] = useReorderVariantImagesMutation();
  const [setPrimaryImage] = useSetPrimaryVariantImageMutation();

  // RTK Query's mutation trigger functions are reference-stable across
  // renders, so memoizing on them keeps `imageManagerOptions` (and in turn
  // `imageManager`, since the hook's own return value is itself memoized)
  // stable too — the hydration effect below can then safely depend on
  // `imageManager` without re-running on every render.
  // The shared hook speaks generically ("ownerId"/"groupId"); this is where
  // that maps onto the product-variant domain's actual "productId"/"variantId".
  const imageManagerOptions = useMemo(
    () => ({
      uploadFile: ({ ownerId, groupId, file, onProgress, signal }: {
        ownerId: string;
        groupId: string;
        file: File;
        onProgress: (percent: number) => void;
        signal: AbortSignal;
      }) =>
        uploadImage({
          productId: ownerId,
          variantId: groupId,
          file,
          onProgress,
          signal,
        }).unwrap(),
      deleteImage: ({ ownerId, groupId, imageId }: {
        ownerId: string;
        groupId: string;
        imageId: string;
      }) => deleteImage({ productId: ownerId, variantId: groupId, imageId }).unwrap(),
      reorderImages: ({ ownerId, groupId, imageIds }: {
        ownerId: string;
        groupId: string;
        imageIds: string[];
      }) => reorderImages({ productId: ownerId, variantId: groupId, imageIds }).unwrap(),
      setPrimaryImage: ({ ownerId, groupId, imageId }: {
        ownerId: string;
        groupId: string;
        imageId: string;
      }) => setPrimaryImage({ productId: ownerId, variantId: groupId, imageId }).unwrap(),
    }),
    [uploadImage, deleteImage, reorderImages, setPrimaryImage],
  );

  const imageManager = useImageUploadManager<ProductVariantImage>(imageManagerOptions);

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productFormSchema) as unknown as Resolver<ProductFormData>,
    defaultValues: initialData ?? createDefaultFormData(),
  });

  useEffect(() => {
    if (initialData) {
      form.reset(initialData);
    }
  }, [initialData, form]);

  useEffect(() => {
    if (!existingVariantImages || !variantContexts || !productId) return;
    existingVariantImages.forEach((images, clientKey) => {
      imageManager.hydrateExisting(clientKey, images);
    });
    variantContexts.forEach((variantId, clientKey) => {
      imageManager.setGroupContext(clientKey, productId, variantId);
    });
  }, [existingVariantImages, variantContexts, productId, imageManager]);

  const reportFailedUploads = useCallback(
    (clientKeys: string[]) => {
      // Count anything that isn't 'done' — not just explicit 'error' items.
      // An item can also get silently stuck in 'queued'/'uploading' forever
      // if it never received a setGroupContext call (e.g. a clientKey
      // correlation miss against the create/update response), in which case
      // it never gets registered in the manager's pendingUploadsRef and
      // waitForIdle resolves without ever having awaited it. Treating any
      // non-done item as failed ensures the merchant is warned instead of
      // silently losing the image.
      const failedCount = clientKeys.reduce(
        (total, key) =>
          total +
          imageManager
            .getItems(key)
            .filter((item) => item.status !== 'done').length,
        0,
      );
      if (failedCount > 0) {
        toast.error(
          t('products.someImagesFailedToUpload', { count: failedCount }),
        );
      }
    },
    [imageManager, t],
  );

  const handleSubmit = async (data: ProductFormData) => {
    await onSubmit(data, imageManager);
    reportFailedUploads(data.variants.map((v) => v.clientKey));
  };

  const pageTitle =
    mode === 'create' ? t('products.addNewProduct') : t('products.editProduct');
  const pageDescription =
    mode === 'create'
      ? t('products.createDescription')
      : t('products.editDescription');

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/products">{t('products.breadcrumbProducts')}</Link>
            </BreadcrumbLink>
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
          <Button type="button" variant="outline" onClick={() => navigate('/products')}>
            {t('products.discard')}
          </Button>
          <Button type="submit" form="product-form" disabled={isSubmitting}>
            {isSubmitting ? t('products.saving') : t('products.saveProduct')}
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
        <form id="product-form" onSubmit={form.handleSubmit(handleSubmit)} noValidate>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-[1200px]">
            <div className="lg:col-span-2 space-y-6">
              <GeneralInfoSection />
              <VariantsSection imageManager={imageManager} />
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
