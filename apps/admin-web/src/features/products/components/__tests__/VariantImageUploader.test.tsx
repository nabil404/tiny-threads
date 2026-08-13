import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { VariantImageUploader } from '../VariantImageUploader';
import * as productVariantImagesApiModule from '@store/api/endpoints/productVariantImagesApi';

describe('VariantImageUploader Component', () => {
  const uploadImageMock = vi.fn().mockResolvedValue({});
  vi.spyOn(productVariantImagesApiModule, 'useUploadVariantImageMutation').mockReturnValue([
    uploadImageMock,
    {} as any,
  ]);
  vi.spyOn(productVariantImagesApiModule, 'useDeleteVariantImageMutation').mockReturnValue([
    vi.fn(),
    {} as any,
  ]);

  // Mock URL.createObjectURL and URL.revokeObjectURL
  if (!globalThis.URL.createObjectURL) {
    globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:test');
  }
  if (!globalThis.URL.revokeObjectURL) {
    globalThis.URL.revokeObjectURL = vi.fn();
  }

  it('renders placeholder icon when no existing or local images', () => {
    render(
      <VariantImageUploader
        mode="create"
        localFiles={[]}
        onLocalFilesChange={vi.fn()}
      />,
    );

    // Should render empty placeholder and add button
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('renders local file previews in create mode', () => {
    const file = new File(['dummy'], 'test.png', { type: 'image/png' });
    render(
      <VariantImageUploader
        mode="create"
        localFiles={[file]}
        onLocalFilesChange={vi.fn()}
      />,
    );

    const img = screen.getByAltText('test.png');
    expect(img).toBeInTheDocument();
  });

  it('cleans up object URLs on unmount', () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const file = new File(['dummy'], 'test.png', { type: 'image/png' });
    const expectedUrl = URL.createObjectURL(file);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue(expectedUrl);

    const { unmount } = render(
      <VariantImageUploader
        mode="create"
        localFiles={[file]}
        onLocalFilesChange={vi.fn()}
      />,
    );

    unmount();
    expect(revokeSpy).toHaveBeenCalledWith(expectedUrl);
    revokeSpy.mockRestore();
  });

  it('renders existing server images in edit mode', () => {
    const existingImages = [
      {
        id: 'img-1',
        variantId: 'v-1',
        storageKey: 'key-1',
        url: 'https://example.com/img1.jpg',
        altText: 'Sample Image',
        sortOrder: 0,
        isPrimary: true,
      },
    ];

    render(
      <VariantImageUploader
        mode="edit"
        existingImages={existingImages}
        localFiles={[]}
        onLocalFilesChange={vi.fn()}
        productId="p-1"
        variantId="v-1"
      />,
    );

    const img = screen.getByAltText('Sample Image');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/img1.jpg');
  });

  it('queues files locally instead of dropping them when a variant has no id yet in edit mode', async () => {
    uploadImageMock.mockClear();
    const onLocalFilesChange = vi.fn();
    const file = new File(['dummy'], 'new-variant.png', { type: 'image/png' });

    const { container } = render(
      <VariantImageUploader
        mode="edit"
        localFiles={[]}
        onLocalFilesChange={onLocalFilesChange}
        productId="p-1"
        variantId={undefined}
      />,
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);

    expect(onLocalFilesChange).toHaveBeenCalledWith([file]);
    expect(uploadImageMock).not.toHaveBeenCalled();
  });

  it('uploads immediately in edit mode when the variant already has an id', async () => {
    uploadImageMock.mockClear();
    const onLocalFilesChange = vi.fn();
    const file = new File(['dummy'], 'existing-variant.png', { type: 'image/png' });

    const { container } = render(
      <VariantImageUploader
        mode="edit"
        localFiles={[]}
        onLocalFilesChange={onLocalFilesChange}
        productId="p-1"
        variantId="v-1"
      />,
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, file);

    expect(uploadImageMock).toHaveBeenCalledWith({
      productId: 'p-1',
      variantId: 'v-1',
      file,
    });
    expect(onLocalFilesChange).not.toHaveBeenCalled();
  });
});
