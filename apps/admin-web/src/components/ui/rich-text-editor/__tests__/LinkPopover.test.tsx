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

interface EditorMockOptions {
  /** What the dispatched chain's `run()` reports. */
  runResult?: boolean;
  /** What the `editor.can().setLink()` dry run reports. */
  canSetLinkResult?: boolean;
  /**
   * Whether `editor.isActive('link')` reports the caret as being inside a link.
   * `false` models a caret at the link's *boundary*: `ResolvedPos.marks()` sees
   * only the preceding plain text, even though `getMarkRange` (which uses
   * `childAfter`) still reports the adjacent link's range.
   */
  isLinkActive?: boolean;
}

function createEditorMock({
  runResult = true,
  canSetLinkResult = true,
  isLinkActive = true,
}: EditorMockOptions = {}) {
  const chain = {
    focus: vi.fn(() => chain),
    setTextSelection: vi.fn(() => chain),
    setLink: vi.fn(() => chain),
    deleteRange: vi.fn(() => chain),
    insertContent: vi.fn(() => chain),
    unsetLink: vi.fn(() => chain),
    run: vi.fn(() => runResult),
  };

  const canSetLink = vi.fn(() => canSetLinkResult);

  const editor = {
    chain: vi.fn(() => chain),
    can: vi.fn(() => ({ setLink: canSetLink })),
    isActive: vi.fn((name: string) => (name === 'link' ? isLinkActive : false)),
    getAttributes: vi.fn(() => ({ href: EXISTING_HREF })),
    schema: { marks: { link: {} } },
    state: {
      selection: { from: CARET_POS, to: CARET_POS },
      doc: {
        resolve: vi.fn(() => ({})),
        // Mirrors the real API: a collapsed range yields no text.
        textBetween: vi.fn((from: number, to: number) =>
          from === to ? '' : LINK_TEXT,
        ),
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

  it('inserts a new link instead of retargeting an adjacent one when the caret sits at a link boundary', async () => {
    // `getMarkRange` still reports the neighbouring link's range here (it reads
    // `childAfter`), but `isActive('link')` is false because the caret is only
    // at the boundary. The component must trust `isActive`.
    const { editor, chain } = createEditorMock({ isLinkActive: false });
    render(
      <LinkPopover editor={editor}>
        <button type="button">Edit link</button>
      </LinkPopover>,
    );

    const user = await openPopover();

    // The popover presents itself as "create a new link", confirming the premise.
    const urlInput = await screen.findByPlaceholderText('https://example.com');
    expect(urlInput).toHaveValue('');
    expect(
      screen.queryByRole('button', { name: /remove link/i }),
    ).not.toBeInTheDocument();
    // Display text is empty — it must not be pre-filled from the adjacent link.
    expect(screen.getByPlaceholderText('Link text (optional)')).toHaveValue('');

    await user.type(urlInput, 'https://new.example.com');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    // The adjacent link's href must be left completely alone.
    expect(chain.setLink).not.toHaveBeenCalled();
    expect(chain.setTextSelection).not.toHaveBeenCalled();
    expect(chain.deleteRange).not.toHaveBeenCalled();
    // A fresh link is inserted at the caret instead.
    expect(chain.insertContent).toHaveBeenCalledWith({
      type: 'text',
      text: 'https://new.example.com',
      marks: [{ type: 'link', attrs: { href: 'https://new.example.com' } }],
    });
  });

  it('does not dispatch a focus-stealing chain when the href fails the dry run', async () => {
    // Editing an existing link (collapsed caret inside it) to an invalid URL.
    const { editor, chain, canSetLink } = createEditorMock({
      canSetLinkResult: false,
    });
    render(
      <LinkPopover editor={editor}>
        <button type="button">Edit link</button>
      </LinkPopover>,
    );

    const user = await openPopover();

    const urlInput = await screen.findByPlaceholderText('https://example.com');
    await user.clear(urlInput);
    await user.type(urlInput, 'example.com:8080/x');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(canSetLink).toHaveBeenCalled();
    // No chain is dispatched at all, so `.focus()` never pulls DOM focus out of
    // the popover — which Radix would treat as an outside interaction and use
    // to dismiss the popover, hiding the error.
    expect(editor.chain).not.toHaveBeenCalled();
    expect(chain.focus).not.toHaveBeenCalled();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "That URL doesn't look valid.",
    );
    expect(screen.getByPlaceholderText('https://example.com')).toBeVisible();
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
