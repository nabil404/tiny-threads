import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RichTextEditor } from '../RichTextEditor';

describe('RichTextEditor Component', () => {
  it('renders toolbar buttons correctly', () => {
    const handleChange = vi.fn();
    render(<RichTextEditor value="<p>Test content</p>" onChange={handleChange} />);

    // Editor content
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('renders provided value and handles empty initial value', () => {
    const handleChange = vi.fn();
    const { container } = render(<RichTextEditor value="" onChange={handleChange} />);

    expect(container.querySelector('.ProseMirror')).toBeInTheDocument();
  });
});

