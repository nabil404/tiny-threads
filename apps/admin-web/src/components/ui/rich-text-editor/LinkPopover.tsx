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

export function LinkPopover({ editor, children }: LinkPopoverProps) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [displayText, setDisplayText] = useState('');

  const isEditing = editor.isActive('link');

  // Sync form fields when popover opens
  useEffect(() => {
    if (!open) return;

    if (isEditing) {
      const attrs = editor.getAttributes('link');
      setUrl(attrs.href || '');
      // Expand from/to to the full extent of the link mark
      const { from } = editor.state.selection;
      const linkType = editor.schema.marks.link;
      const range = getMarkRange(editor.state.doc.resolve(from), linkType);
      const [rangeFrom, rangeTo] = range ? [range.from, range.to] : [from, from];
      const text = editor.state.doc.textBetween(rangeFrom, rangeTo, '');
      setDisplayText(text);
    } else {
      setUrl('');
      const { from, to } = editor.state.selection;
      const selectedText = editor.state.doc.textBetween(from, to, '');
      setDisplayText(selectedText);
    }
  }, [open, isEditing, editor]);

  const normalizeUrl = (input: string): string => {
    const trimmed = input.trim();
    if (!trimmed) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed; // already has an explicit scheme
    if (trimmed.startsWith('/') || trimmed.startsWith('#')) return trimmed; // relative path / anchor
    return `https://${trimmed}`;
  };

  const handleApply = useCallback(() => {
    const normalizedUrl = normalizeUrl(url);
    if (!normalizedUrl) return;

    const { from, to } = editor.state.selection;
    const hasSelection = from !== to;

    if (hasSelection) {
      // If display text was changed, replace the selected text first
      const currentText = editor.state.doc.textBetween(from, to, '');
      if (displayText && displayText !== currentText) {
        editor
          .chain()
          .focus()
          .deleteRange({ from, to })
          .insertContent(displayText)
          .setTextSelection({ from, to: from + displayText.length })
          .setLink({ href: normalizedUrl })
          .run();
      } else {
        editor.chain().focus().setLink({ href: normalizedUrl }).run();
      }
    } else if (displayText) {
      // No selection — insert new text with link
      editor
        .chain()
        .focus()
        .insertContent(`<a href="${normalizedUrl}">${displayText}</a>`)
        .run();
    } else {
      // No selection, no display text — insert URL as both text and link
      editor
        .chain()
        .focus()
        .insertContent(`<a href="${normalizedUrl}">${normalizedUrl}</a>`)
        .run();
    }

    setOpen(false);
  }, [editor, url, displayText]);

  const handleRemove = useCallback(() => {
    editor.chain().focus().unsetLink().run();
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
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="https://example.com"
              className="h-8 text-sm"
              autoFocus
            />
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
