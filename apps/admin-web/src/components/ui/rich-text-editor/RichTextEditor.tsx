import { useEditor, EditorContent } from '@tiptap/react';
import type { JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Link as LinkIcon,
} from 'lucide-react';
import { Button } from '@components/ui/button';
import { cn } from '@/lib/utils';
import { LinkPopover } from './LinkPopover';
import { LinkBubbleMenu } from './LinkBubbleMenu';

export interface RichTextEditorProps {
  value: JSONContent | null | undefined;
  onChange: (json: JSONContent) => void;
  placeholder?: string;
  className?: string;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  className,
}: RichTextEditorProps) {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t('richTextEditor.placeholder');

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
        blockquote: false,
        horizontalRule: false,
        link: false,
      }),
      Link.configure({ openOnClick: false }),
    ],
    content: value ?? undefined,
    onUpdate: ({ editor: e }) => {
      onChange(e.getJSON());
    },
    editorProps: {
      attributes: {
        class:
          'min-h-[120px] px-3.5 py-2.5 text-sm focus:outline-none prose prose-sm dark:prose-invert max-w-none',
        placeholder: resolvedPlaceholder,
      },
    },
  });

  // Sync external value changes (e.g. form reset)
  useEffect(() => {
    if (!editor) return;
    const isSame =
      value == null
        ? editor.isEmpty
        : JSON.stringify(value) === JSON.stringify(editor.getJSON());
    if (!isSame) {
      editor.commands.setContent(value ?? '');
    }
  }, [value, editor]);

  if (!editor) return null;

  return (
    <div
      className={cn(
        'rounded-lg border border-input overflow-hidden focus-within:ring-2 focus-within:ring-ring/20 focus-within:border-primary transition-all',
        className,
      )}
    >
      <div className="flex items-center gap-0.5 border-b border-input bg-muted/50 px-2 py-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            'h-7 w-7',
            editor.isActive('bold') && 'bg-accent text-accent-foreground',
          )}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            'h-7 w-7',
            editor.isActive('italic') && 'bg-accent text-accent-foreground',
          )}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            'h-7 w-7',
            editor.isActive('bulletList') && 'bg-accent text-accent-foreground',
          )}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            'h-7 w-7',
            editor.isActive('orderedList') && 'bg-accent text-accent-foreground',
          )}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </Button>
        <LinkPopover editor={editor}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              'h-7 w-7',
              editor.isActive('link') && 'bg-accent text-accent-foreground',
            )}
          >
            <LinkIcon className="h-3.5 w-3.5" />
          </Button>
        </LinkPopover>
      </div>
      <EditorContent editor={editor} />
      <LinkBubbleMenu editor={editor} />
    </div>
  );
}
