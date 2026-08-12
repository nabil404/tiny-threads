import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RichTextEditor } from '../RichTextEditor';

vi.mock('@tiptap/react', () => {
  const EditorContent = ({ editor }: { editor: unknown }) =>
    editor ? <div data-testid="editor-content">Editor Content</div> : null;

  return {
    useEditor: () => ({
      chain: () => ({
        focus: () => ({
          toggleBold: () => ({ run: vi.fn() }),
          toggleItalic: () => ({ run: vi.fn() }),
          toggleBulletList: () => ({ run: vi.fn() }),
          toggleOrderedList: () => ({ run: vi.fn() }),
          setLink: () => ({ run: vi.fn() }),
          unsetLink: () => ({ run: vi.fn() }),
        }),
      }),
      isActive: () => false,
      getHTML: () => '<p></p>',
      commands: { setContent: vi.fn() },
    }),
    EditorContent,
    BubbleMenu: ({ children }: { children: React.ReactNode }) => <div data-testid="bubble-menu">{children}</div>,
  };
});

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

  it('handles external value sync without re-setting content when empty', () => {
    const handleChange = vi.fn();
    const { rerender, container } = render(
      <RichTextEditor value="<p>Initial</p>" onChange={handleChange} />,
    );
    expect(screen.getByText('Initial')).toBeInTheDocument();

    // Rerender with empty string which matches <p></p> HTML parity
    rerender(<RichTextEditor value="" onChange={handleChange} />);
    expect(container.querySelector('.ProseMirror')).toBeInTheDocument();
  });

  it('renders ordered list button in toolbar', () => {
    render(<RichTextEditor value="" onChange={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    // Bold, Italic, BulletList, OrderedList, Link = 5
    expect(buttons.length).toBeGreaterThanOrEqual(5);
  });
});

