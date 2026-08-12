import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import type { Editor } from '@tiptap/react';
import { LinkPopover } from '../LinkPopover';

/**
 * The full extent of the existing link mark. `getMarkRange` is mocked to return
 * it so the component sees the same shape TipTap would produce for a caret
 * sitting inside a link.
 */
const LINK_RANGE = { from: 5, to: 17 };
/** A collapsed caret in the middle of that link — no text is selected. */
const CARET_POS = 9;
const EXISTING_HREF = 'https://old.example.com';
const LINK_TEXT = 'Example Link';

vi.mock('@tiptap/core', () => ({
  getMarkRange: vi.fn(() => LINK_RANGE),
}));

function createEditorMock({ runResult = true }: { runResult?: boolean } = {}) {
  const chain = {
    focus: vi.fn(() => chain),
    setTextSelection: vi.fn(() => chain),
    setLink: vi.fn(() => chain),
    deleteRange: vi.fn(() => chain),
    insertContent: vi.fn(() => chain),
    unsetLink: vi.fn(() => chain),
    run: vi.fn(() => runResult),
  };

  const canSetLink = vi.fn(() => true);

  const editor = {
    chain: vi.fn(() => chain),
    can: vi.fn(() => ({ setLink: canSetLink })),
    // Caret is inside a link, so the Link mark is active.
    isActive: vi.fn((name: string) => name === 'link'),
    getAttributes: vi.fn(() => ({ href: EXISTING_HREF })),
    schema: { marks: { link: {} } },
    state: {
      selection: { from: CARET_POS, to: CARET_POS },
      doc: {
        resolve: vi.fn(() => ({})),
        textBetween: vi.fn(() => LINK_TEXT),
      },
    },
  } as unknown as Editor;

  return { editor, chain, canSetLink };
}

async function openPopover() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Edit link' }));
  return user;
}

describe('LinkPopover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates the existing link in place when the caret is inside it', async () => {
    const { editor, chain } = createEditorMock();
    render(
      <LinkPopover editor={editor}>
        <button type="button">Edit link</button>
      </LinkPopover>,
    );

    const user = await openPopover();

    // Pre-fill comes from the full link-mark range, not the collapsed caret.
    const urlInput = await screen.findByPlaceholderText('https://example.com');
    expect(urlInput).toHaveValue(EXISTING_HREF);
    expect(screen.getByPlaceholderText('Link text (optional)')).toHaveValue(
      LINK_TEXT,
    );

    await user.clear(urlInput);
    await user.type(urlInput, 'https://new.example.com');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    // The regression: a collapsed caret used to fall through to
    // `insertContent('<a ...>')`, nesting a duplicate link inside the original.
    expect(chain.insertContent).not.toHaveBeenCalled();
    expect(chain.deleteRange).not.toHaveBeenCalled();
    // Instead the href is re-applied across the whole link-mark range.
    expect(chain.setTextSelection).toHaveBeenCalledWith(LINK_RANGE);
    expect(chain.setLink).toHaveBeenCalledWith({
      href: 'https://new.example.com',
    });
  });

  it('keeps the popover open and reports an error when setLink is rejected', async () => {
    const { editor } = createEditorMock({ runResult: false });
    render(
      <LinkPopover editor={editor}>
        <button type="button">Edit link</button>
      </LinkPopover>,
    );

    const user = await openPopover();

    const urlInput = await screen.findByPlaceholderText('https://example.com');
    await user.clear(urlInput);
    await user.type(urlInput, 'not a real url');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "That URL doesn't look valid.",
    );
    // Popover stays open so the user can correct the URL.
    expect(screen.getByPlaceholderText('https://example.com')).toBeVisible();

    // Editing the URL again clears the error.
    await user.type(screen.getByPlaceholderText('https://example.com'), 'x');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
