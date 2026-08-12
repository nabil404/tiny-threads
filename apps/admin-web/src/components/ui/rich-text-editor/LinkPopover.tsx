import { useState, useEffect, useCallback } from 'react';
import type { Editor } from '@tiptap/react';
import { getMarkRange } from '@tiptap/core';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@components/ui/popover';
import { Input } from '@components/ui/input';
import { Button } from '@components/ui/button';
import { Trash2 } from 'lucide-react';

export interface LinkPopoverProps {
  editor: Editor;
  children: React.ReactNode;
}

const URL_ERROR_MESSAGE = "That URL doesn't look valid.";

/**
 * Schemes the Link extension allows that carry no `//` authority. Anything else
 * without `//` is treated as a bare host, so `example.com:8080` gets an
 * `https://` prefix rather than being mistaken for an `example.com:` scheme.
 */
const AUTHORITYLESS_SCHEME_RE = /^(?:mailto|tel|callto|sms|cid|xmpp):/i;

export function LinkPopover({ editor, children }: LinkPopoverProps) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [displayText, setDisplayText] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);

  const isEditing = editor.isActive('link');

  /**
   * The document range any mutation should target.
   *
   * A real text selection is used as-is. When the caret is merely placed inside
   * an existing link (a collapsed selection), it is expanded to the full extent
   * of that link's mark so edits replace the link instead of nesting inside it.
   */
  const getTargetRange = useCallback((): { from: number; to: number } => {
    const { from, to } = editor.state.selection;
    if (from !== to) return { from, to };

    const range = getMarkRange(
      editor.state.doc.resolve(from),
      editor.schema.marks.link,
    );
    return range ? { from: range.from, to: range.to } : { from, to };
  }, [editor]);

  // Sync form fields when popover opens
  useEffect(() => {
    if (!open) return;

    setUrlError(null);
    const { from, to } = getTargetRange();
    setDisplayText(editor.state.doc.textBetween(from, to, ''));
    setUrl(isEditing ? editor.getAttributes('link').href || '' : '');
  }, [open, isEditing, editor, getTargetRange]);

  const normalizeUrl = (input: string): string => {
    const trimmed = input.trim();
    if (!trimmed) return '';
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed; // explicit scheme with authority
    if (AUTHORITYLESS_SCHEME_RE.test(trimmed)) return trimmed; // mailto:, tel:, ...
    if (trimmed.startsWith('/') || trimmed.startsWith('#')) return trimmed; // relative path / anchor
    return `https://${trimmed}`;
  };

  const handleApply = useCallback(() => {
    const normalizedUrl = normalizeUrl(url);
    if (!normalizedUrl) return;

    const { from, to } = getTargetRange();
    const hasRange = from !== to;
    const currentText = hasRange
      ? editor.state.doc.textBetween(from, to, '')
      : '';
    const textUnchanged = !displayText || displayText === currentText;

    let applied: boolean;

    if (hasRange && textUnchanged) {
      // Text is untouched — only (re)apply the href across the target range.
      // Keeping the existing text nodes avoids a needless delete/reinsert.
      applied = editor
        .chain()
        .focus()
        .setTextSelection({ from, to })
        .setLink({ href: normalizedUrl })
        .run();
    } else {
      // Every remaining path inserts brand new linked text. `insertContent`
      // builds the link mark from JSON, which bypasses the Link extension's
      // href allowlist, so validate the href up front via a dry run.
      const text = displayText || normalizedUrl;
      applied = editor.can().setLink({ href: normalizedUrl });

      if (applied) {
        const chain = editor.chain().focus();
        if (hasRange) chain.deleteRange({ from, to });
        applied = chain
          .insertContent({
            type: 'text',
            text,
            marks: [{ type: 'link', attrs: { href: normalizedUrl } }],
          })
          .run();
      }
    }

    if (!applied) {
      setUrlError(URL_ERROR_MESSAGE);
      return;
    }

    setUrlError(null);
    setOpen(false);
  }, [editor, url, displayText, getTargetRange]);

  const handleRemove = useCallback(() => {
    editor.chain().focus().unsetLink().run();
    setUrlError(null);
    setOpen(false);
  }, [editor]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleApply();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        className="w-80 p-3"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="space-y-2.5">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              URL
            </label>
            <Input
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setUrlError(null);
              }}
              onKeyDown={handleKeyDown}
              placeholder="https://example.com"
              className="h-8 text-sm"
              aria-invalid={urlError ? true : undefined}
              autoFocus
            />
            {urlError && (
              <p role="alert" className="text-xs text-destructive">
                {urlError}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Display text
            </label>
            <Input
              value={displayText}
              onChange={(e) => setDisplayText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Link text (optional)"
              className="h-8 text-sm"
            />
          </div>
          <div className="flex items-center justify-between pt-1">
            {isEditing ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-destructive hover:text-destructive"
                onClick={handleRemove}
              >
                <Trash2 className="mr-1 h-3 w-3" />
                Remove link
              </Button>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-7 text-xs"
                onClick={handleApply}
                disabled={!url.trim()}
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
