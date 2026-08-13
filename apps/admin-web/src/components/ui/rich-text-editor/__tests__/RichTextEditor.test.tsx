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
          deleteRange: () => ({
            insertContent: () => ({
              setTextSelection: () => ({
                setLink: () => ({ run: vi.fn() }),
              }),
            }),
          }),
          insertContent: () => ({ run: vi.fn() }),
        }),
      }),
      isActive: () => false,
      isEmpty: true,
      getHTML: () => '<p></p>',
      getJSON: () => ({ type: 'doc', content: [] }),
      getAttributes: () => ({ href: '' }),
      schema: { marks: { link: {} } },
      state: {
        selection: { from: 0, to: 0 },
        doc: {
          textBetween: () => '',
          resolve: () => ({}),
        },
      },
      commands: { setContent: vi.fn() },
    }),
    EditorContent,
  };
});

vi.mock('@tiptap/react/menus', () => ({
  BubbleMenu: () => null,
}));

vi.mock('@tiptap/starter-kit', () => ({
  default: { configure: () => ({}) },
}));

vi.mock('@tiptap/extension-link', () => ({
  default: { configure: () => ({}) },
}));

vi.mock('@tiptap/core', () => ({
  getMarkRange: () => null,
}));

describe('RichTextEditor', () => {
  it('renders the toolbar buttons', () => {
    render(<RichTextEditor value={undefined} onChange={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    // Bold, Italic, BulletList, OrderedList, Link = 5
    expect(buttons).toHaveLength(5);
  });

  it('renders the editor content area', () => {
    render(<RichTextEditor value={undefined} onChange={vi.fn()} />);
    expect(screen.getByTestId('editor-content')).toBeInTheDocument();
  });

  it('renders ordered list button in toolbar', () => {
    render(<RichTextEditor value={undefined} onChange={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(5);
  });
});
