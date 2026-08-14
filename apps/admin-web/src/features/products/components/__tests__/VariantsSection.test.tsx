import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm, FormProvider } from 'react-hook-form';
import { Provider } from 'react-redux';
import { store } from '@store/index';
import { VariantsSection } from '../VariantsSection';
import type { ProductFormData } from '../../schemas/product-form.schema';
import type { ProductVariantImage } from '@store/api/endpoints/productsApi';
import type { UseImageUploadManagerResult } from '@components/image-upload/useImageUploadManager';

function makeManager(): UseImageUploadManagerResult<ProductVariantImage> {
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
  };
}

function SectionWrapper({ initialCount = 2 }: { initialCount?: number }) {
  const variants = Array.from({ length: initialCount }, (_, i) => ({
    clientKey: `v-key-${i + 1}`,
    name: `Variant ${i + 1}`,
    sku: `SKU-${i + 1}`,
    priceDollars: 10 + i,
    stock: 5 + i,
    isDefault: i === 0,
  }));

  const form = useForm<ProductFormData>({
    defaultValues: {
      title: 'Sample Product',
      status: 'draft',
      categoryIds: [],
      variants,
    },
  });

  return (
    <Provider store={store}>
      <FormProvider {...form}>
        <VariantsSection imageManager={makeManager()} />
      </FormProvider>
    </Provider>
  );
}

describe('VariantsSection', () => {
  it('opens confirmation dialog when delete button is clicked and deletes on confirm', async () => {
    const user = userEvent.setup();
    render(<SectionWrapper initialCount={2} />);

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    expect(deleteButtons).toHaveLength(2);

    await user.click(deleteButtons[0]);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Delete Variant' })).toBeInTheDocument();

    const dialog = screen.getByRole('dialog');
    const confirmButton = within(dialog).getByRole('button', { name: /^delete$/i });
    await user.click(confirmButton);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /delete/i })).toHaveLength(1);
  });

  it('cancels deletion when cancel is clicked in confirmation dialog', async () => {
    const user = userEvent.setup();
    render(<SectionWrapper initialCount={2} />);

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    await user.click(deleteButtons[0]);

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    const dialog = screen.getByRole('dialog');
    const cancelButton = within(dialog).getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /delete/i })).toHaveLength(2);
  });
});
