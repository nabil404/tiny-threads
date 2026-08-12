import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { VariantImageUploader } from '../VariantImageUploader';
import * as productVariantImagesApiModule from '@store/api/endpoints/productVariantImagesApi';

describe('VariantImageUploader Component', () => {
  vi.spyOn(productVariantImagesApiModule, 'useUploadVariantImageMutation').mockReturnValue([
    vi.fn(),
    {} as any,
  ]);
  vi.spyOn(productVariantImagesApiModule, 'useDeleteVariantImageMutation').mockReturnValue([
    vi.fn(),
    {} as any,
  ]);

  // Mock URL.createObjectURL
  if (!globalThis.URL.createObjectURL) {
    globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:test');
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
});
