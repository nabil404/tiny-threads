import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { useEffect } from 'react';
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Link as LinkIcon,
} from 'lucide-react';
import { Button } from '@components/ui/button';
import { cn } from '@/lib/utils';

export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Enter product description...',
  className,
}: RichTextEditorProps) {
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
    content: value,
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          'min-h-[120px] px-3.5 py-2.5 text-sm focus:outline-none prose prose-sm max-w-none',
        placeholder,
      },
    },
  });

  // Sync external value changes (e.g. form reset)
  useEffect(() => {
    if (!editor) return;
    const isSame =
      value === editor.getHTML() ||
      (value === '' && editor.getHTML() === '<p></p>');
    if (!isSame) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  if (!editor) return null;

  const toggleLink = () => {
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run();
    } else {
      const url = window.prompt('Enter URL');
      if (url) {
        editor.chain().focus().setLink({ href: url }).run();
      }
    }
  };

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
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            'h-7 w-7',
            editor.isActive('link') && 'bg-accent text-accent-foreground',
          )}
          onClick={toggleLink}
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </Button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
