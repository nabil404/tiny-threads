import { useState } from 'react';
import { type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Button } from '@components/ui/button';
import { ExternalLink, Pencil, Unlink } from 'lucide-react';
import { LinkPopover } from './LinkPopover';

export interface LinkBubbleMenuProps {
  editor: Editor;
}

export function LinkBubbleMenu({ editor }: LinkBubbleMenuProps) {
  const [isEditOpen, setIsEditOpen] = useState(false);

  return (
    <BubbleMenu
      editor={editor}
      options={{
        placement: 'bottom-start',
        onHide: () => setIsEditOpen(false),
      }}
      shouldShow={({ editor: e }) => e.isActive('link') && !isEditOpen}
    >
      <div className="flex items-center gap-1 rounded-lg border bg-popover p-1 shadow-md">
        <a
          href={editor.getAttributes('link').href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 truncate px-2 py-1 text-xs text-primary hover:underline max-w-[200px]"
        >
          <ExternalLink className="h-3 w-3 shrink-0" />
          <span className="truncate">
            {editor.getAttributes('link').href}
          </span>
        </a>

        <div className="h-4 w-px bg-border" />

        <LinkPopover editor={editor}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 cursor-pointer text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-500/10 transition-colors"
            onClick={() => setIsEditOpen(true)}
          >
            <Pencil className="h-3 w-3" />
          </Button>
        </LinkPopover>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 cursor-pointer text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          onClick={() => editor.chain().focus().unsetLink().run()}
        >
          <Unlink className="h-3 w-3" />
        </Button>
      </div>
    </BubbleMenu>
  );
}
