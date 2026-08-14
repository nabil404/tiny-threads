import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ImageUploadCell } from '../ImageUploadCell';
import type { ImageUploadItem, ImageRecord } from '../useImageUploadManager';

function image(overrides: Partial<ImageRecord> = {}): ImageRecord {
  return {
    id: '1',
    url: 'https://cdn/primary.webp',
    altText: null,
    sortOrder: 0,
    isPrimary: true,
    ...overrides,
  };
}

describe('ImageUploadCell', () => {
  it('renders a placeholder when there are no items', () => {
    render(<ImageUploadCell items={[]} onClick={vi.fn()} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows the primary image when one exists', () => {
    const items: ImageUploadItem[] = [
      { clientId: 'image-1', status: 'done', image: image() },
    ];
    render(<ImageUploadCell items={items} onClick={vi.fn()} />);
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://cdn/primary.webp',
    );
  });

  it('shows a +N badge on hover when there is more than one item', async () => {
    const user = userEvent.setup();
    const items: ImageUploadItem[] = [
      { clientId: 'image-1', status: 'done', image: image({ id: '1' }) },
      {
        clientId: 'image-2',
        status: 'done',
        image: image({
          id: '2',
          url: 'https://cdn/b.webp',
          isPrimary: false,
          sortOrder: 1,
        }),
      },
    ];
    render(<ImageUploadCell items={items} onClick={vi.fn()} />);
    expect(screen.queryByText('+1')).not.toBeInTheDocument();

    await user.hover(screen.getByRole('button'));
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<ImageUploadCell items={[]} onClick={onClick} />);
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalled();
  });
});
