import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useForm, FormProvider } from 'react-hook-form';
import '@testing-library/jest-dom';
import { VariantRow } from '../VariantRow';
import type { ProductFormData } from '../../schemas/product-form.schema';
import type { ProductVariantImage } from '@store/api/endpoints/productsApi';
import type { UseImageUploadManagerResult } from '@components/image-upload/useImageUploadManager';

function Wrapper({
  imageManager,
}: {
  imageManager: UseImageUploadManagerResult<ProductVariantImage>;
}) {
  const form = useForm<ProductFormData>({
    defaultValues: {
      title: 'x',
      status: 'draft',
      categoryIds: [],
      variants: [
        {
          clientKey: 'v-key-1',
          name: 'Red',
          sku: 'SKU-1',
          priceDollars: 10,
          stock: 5,
          isDefault: true,
        },
      ],
    },
  });
  return (
    <FormProvider {...form}>
      <table>
        <tbody>
          <VariantRow
            index={0}
            canDelete={false}
            onRemove={vi.fn()}
            imageManager={imageManager}
          />
        </tbody>
      </table>
    </FormProvider>
  );
}

function makeManager(
  overrides: Partial<UseImageUploadManagerResult<ProductVariantImage>> = {},
): UseImageUploadManagerResult<ProductVariantImage> {
  return {
    getItems: vi.fn().mockReturnValue([]),
    addFiles: vi.fn(),
    addRejectedFile: vi.fn(),
    removeItem: vi.fn(),
    retryItem: vi.fn(),
    reorderItems: vi.fn(),
    setPrimary: vi.fn(),
    hydrateExisting: vi.fn(),
    setGroupContext: vi.fn(),
    waitForIdle: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('VariantRow', () => {
  it("renders the image cell using items from the manager for this row's clientKey", () => {
    const getItems = vi.fn().mockReturnValue([]);
    render(<Wrapper imageManager={makeManager({ getItems })} />);
    expect(getItems).toHaveBeenCalledWith('v-key-1');
    expect(screen.getByRole('row')).toBeInTheDocument();
  });

  it('renders the SKU field with its current value', () => {
    render(<Wrapper imageManager={makeManager()} />);
    expect(screen.getByPlaceholderText('e.g. SKU-123')).toHaveValue('SKU-1');
  });
});
