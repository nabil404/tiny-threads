import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { toast } from 'sonner';
import { ImageUploadPopup, type ImageUploadLabels } from '../ImageUploadPopup';
import type { ImageUploadItem } from '../useImageUploadManager';

const doneItem: ImageUploadItem = {
  clientId: 'image-1',
  status: 'done',
  image: {
    id: '1',
    url: 'https://cdn/a.webp',
    isPrimary: false,
    sortOrder: 0,
    altText: null,
  },
};

const errorItem: ImageUploadItem = {
  clientId: 'local-1',
  status: 'error',
  errorMessage: 'File exceeds 10MB',
};

const labels: ImageUploadLabels = {
  dropzone: 'Drag & drop images here, or click to browse',
  uploadingSection: (count) => `Uploading (${count})`,
  imagesSection: (count) => `Images (${count})`,
  retry: 'Retry',
  removeImage: 'Remove image',
  setPrimaryImage: 'Set as primary image',
  dragToReorder: 'Drag to reorder',
  fileTooLarge: 'File exceeds 10MB',
  fileInvalidType: 'Unsupported file type — use JPEG, PNG, WebP, or AVIF',
  deleteSuccess: 'Image deleted successfully',
};

function renderPopup(
  overrides: Partial<React.ComponentProps<typeof ImageUploadPopup>> = {},
) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    title: 'Images — Red / Medium',
    labels,
    items: [doneItem, errorItem],
    onAddFiles: vi.fn(),
    onAddRejectedFile: vi.fn(),
    onRemoveItem: vi.fn(),
    onRetryItem: vi.fn(),
    onReorder: vi.fn(),
    onSetPrimary: vi.fn(),
    ...overrides,
  };
  render(<ImageUploadPopup {...props} />);
  return props;
}

describe('ImageUploadPopup', () => {
  it('renders the finished-images grid and the uploading queue separately', () => {
    renderPopup();
    expect(screen.getByText('Images (1)')).toBeInTheDocument();
    expect(screen.getByText('Uploading (1)')).toBeInTheDocument();
    expect(screen.getByText('File exceeds 10MB')).toBeInTheDocument();
  });

  it('calls onRetryItem when Retry is clicked on a failed row', async () => {
    const user = userEvent.setup();
    const props = renderPopup();
    await user.click(screen.getByText('Retry'));
    expect(props.onRetryItem).toHaveBeenCalledWith('local-1');
  });

  it('calls onRemoveItem when a queue row remove button is clicked', async () => {
    const user = userEvent.setup();
    const props = renderPopup();
    const removeButtons = screen.getAllByLabelText('Remove image');
    // The first remove button is on the queue row
    await user.click(removeButtons[0]);
    expect(props.onRemoveItem).toHaveBeenCalledWith('local-1');
  });

  it('opens confirmation dialog when removing an uploaded image tile and removes upon confirmation', async () => {
    const toastSpy = vi.spyOn(toast, 'success');
    const user = userEvent.setup();
    const props = renderPopup();
    const removeButtons = screen.getAllByLabelText('Remove image');
    // The second remove button is on the uploaded grid tile
    await user.click(removeButtons[1]);

    expect(screen.getByRole('heading', { name: 'Delete Image' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(props.onRemoveItem).toHaveBeenCalledWith('image-1');
    expect(toastSpy).toHaveBeenCalledWith('Image deleted successfully');
  });

  it('cancels removal of an uploaded image tile when Cancel is clicked in dialog', async () => {
    const user = userEvent.setup();
    const props = renderPopup();
    const removeButtons = screen.getAllByLabelText('Remove image');
    await user.click(removeButtons[1]);

    expect(screen.getByRole('heading', { name: 'Delete Image' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(props.onRemoveItem).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Delete Image' })).not.toBeInTheDocument();
  });

  it('calls onSetPrimary when the primary star on a grid tile is clicked', async () => {
    const user = userEvent.setup();
    const props = renderPopup();
    await user.click(screen.getByLabelText('Set as primary image'));
    expect(props.onSetPrimary).toHaveBeenCalledWith('image-1');
  });

  it('calls onAddFiles when a valid file is dropped via the hidden input', async () => {
    const props = renderPopup();
    const file = new File(['x'], 'good.png', { type: 'image/png' });
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await userEvent.upload(input, file);
    expect(props.onAddFiles).toHaveBeenCalledWith([file]);
  });

  it('calls onAddRejectedFile with a reason for an oversized file', async () => {
    const props = renderPopup();
    const big = new File([new Uint8Array(11 * 1024 * 1024)], 'big.png', {
      type: 'image/png',
    });
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await userEvent.upload(input, big);
    expect(props.onAddRejectedFile).toHaveBeenCalledWith(
      big,
      'File exceeds 10MB',
    );
  });
});
