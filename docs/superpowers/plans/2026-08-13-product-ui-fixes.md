# Product UI Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix breadcrumb navigation, lighten card borders, fix TipTap editor styling, add ordered list support, and build inline link editing UI.

**Architecture:** Four independent fixes in `apps/admin-web`. Breadcrumbs switch to React Router `<Link>`. Card borders are softened via theme variables. The TipTap editor is relocated to a shared UI directory, gets `@tailwindcss/typography` for proper prose styling, gains an ordered list toolbar button, and replaces `window.prompt()` with a `LinkPopover` component and `LinkBubbleMenu` floating menu.

**Tech Stack:** React 19, React Router v7, TipTap v3, Radix Popover, Tailwind CSS v4, `@tailwindcss/typography`, shadcn/ui, Vitest

## Global Constraints

- All new components under `src/components/ui/` must be pure presentational — zero Redux imports.
- Follow existing code style: Tailwind classes via `cn()`, `lucide-react` icons, shadcn/ui primitives.
- Use `pnpm` for all package management commands.
- Tests use Vitest + Testing Library + `@testing-library/jest-dom`.
- Import paths use Vite aliases: `@components/`, `@/lib/`, etc.

---

### Task 1: Fix Breadcrumb Router Links

**Files:**
- Modify: `apps/admin-web/src/features/products/components/ProductForm.tsx:88-98`

**Interfaces:**
- Consumes: `BreadcrumbLink` from `@components/ui/breadcrumb` (existing `asChild` prop), `Link` from `react-router-dom`
- Produces: No new interfaces — this is a bug fix

- [ ] **Step 1: Update ProductForm breadcrumb to use React Router Link**

In `apps/admin-web/src/features/products/components/ProductForm.tsx`, add the `Link` import and update the breadcrumb usage:

```tsx
// Add to existing imports:
import { Link, useNavigate } from 'react-router-dom';
// (useNavigate is already imported — just add Link to the same import)
```

Replace the breadcrumb block (lines 88-98):

```tsx
<Breadcrumb>
  <BreadcrumbList>
    <BreadcrumbItem>
      <BreadcrumbLink asChild>
        <Link to="/products">Products</Link>
      </BreadcrumbLink>
    </BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem>
      <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
    </BreadcrumbItem>
  </BreadcrumbList>
</Breadcrumb>
```

The key change: `<BreadcrumbLink href="/products">` → `<BreadcrumbLink asChild><Link to="/products">`. The `asChild` prop makes `BreadcrumbLink` render the child `<Link>` via Radix `Slot` instead of a plain `<a>` tag, preserving React Router's client-side navigation.

- [ ] **Step 2: Manually verify in browser**

Run: `pnpm dev:admin-web`

1. Navigate to `/products/new` or any product edit page
2. Click the "Products" breadcrumb link
3. Verify: page navigates to `/products` WITHOUT a full page reload (no flash, no spinner reset)

- [ ] **Step 3: Commit**

```bash
git add apps/admin-web/src/features/products/components/ProductForm.tsx
git commit -m "fix(admin-web): use React Router Link in product breadcrumbs"
```

---

### Task 2: Lighten Card Borders

**Files:**
- Modify: `apps/admin-web/src/index.css:56-57,80-81`
- Modify: `apps/admin-web/src/components/ui/card.tsx:11`

**Interfaces:**
- Consumes: CSS custom properties `--border` (global theme variable)
- Produces: No new interfaces — this is a visual adjustment

- [ ] **Step 1: Update border theme variables in index.css**

In `apps/admin-web/src/index.css`, update the `--border` and `--input` values in both light and dark themes.

Light theme (inside `:root, [data-theme="light"]`):

```css
    --border: #e2e0ed;
    --input: #d5d3e2;
```

Dark theme (inside `.dark, [data-theme="dark"]`):

```css
    --border: #2a2a38;
    --input: #3a3a4a;
```

Note: `--input` is updated slightly differently from `--border` so that form inputs remain a touch more visible than card/divider borders, maintaining affordance.

- [ ] **Step 2: Soften card shadow in card.tsx**

In `apps/admin-web/src/components/ui/card.tsx`, change the Card's default class from `shadow` to `shadow-sm`:

```tsx
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'rounded-xl border bg-card text-card-foreground shadow-sm',
      className,
    )}
    {...props}
  />
));
```

- [ ] **Step 3: Manually verify in browser**

Run: `pnpm dev:admin-web`

1. Check cards on Products page, Dashboard, Settings — borders should be noticeably lighter
2. Toggle dark mode — verify dark borders are subtle but still visible
3. Check form inputs (text fields, selects) — they should still have a visible border

- [ ] **Step 4: Commit**

```bash
git add apps/admin-web/src/index.css apps/admin-web/src/components/ui/card.tsx
git commit -m "style(admin-web): lighten card borders and soften shadow"
```

---

### Task 3: Relocate RichTextEditor to Shared UI & Install Typography Plugin

**Files:**
- Move: `apps/admin-web/src/features/products/components/RichTextEditor.tsx` → `apps/admin-web/src/components/ui/rich-text-editor/RichTextEditor.tsx`
- Move: `apps/admin-web/src/features/products/components/__tests__/RichTextEditor.test.tsx` → `apps/admin-web/src/components/ui/rich-text-editor/__tests__/RichTextEditor.test.tsx`
- Create: `apps/admin-web/src/components/ui/rich-text-editor/index.ts`
- Modify: `apps/admin-web/src/features/products/components/GeneralInfoSection.tsx:13`
- Modify: `apps/admin-web/src/features/products/index.ts`
- Modify: `apps/admin-web/package.json` (add `@tailwindcss/typography`)

**Interfaces:**
- Consumes: TipTap `useEditor`, `EditorContent`, `StarterKit`, `Link` extension
- Produces: `RichTextEditor` component and `RichTextEditorProps` type exported from `@components/ui/rich-text-editor`

- [ ] **Step 1: Install @tailwindcss/typography**

```bash
cd apps/admin-web
pnpm add -D @tailwindcss/typography
```

- [ ] **Step 2: Create the rich-text-editor directory and move the component**

```bash
mkdir -p apps/admin-web/src/components/ui/rich-text-editor/__tests__
mv apps/admin-web/src/features/products/components/RichTextEditor.tsx apps/admin-web/src/components/ui/rich-text-editor/RichTextEditor.tsx
mv apps/admin-web/src/features/products/components/__tests__/RichTextEditor.test.tsx apps/admin-web/src/components/ui/rich-text-editor/__tests__/RichTextEditor.test.tsx
```

- [ ] **Step 3: Create barrel export**

Create `apps/admin-web/src/components/ui/rich-text-editor/index.ts`:

```ts
export { RichTextEditor } from './RichTextEditor';
export type { RichTextEditorProps } from './RichTextEditor';
```

- [ ] **Step 4: Update the import path in RichTextEditor.test.tsx**

In `apps/admin-web/src/components/ui/rich-text-editor/__tests__/RichTextEditor.test.tsx`, update the import:

```tsx
import { RichTextEditor } from '../RichTextEditor';
```

This is already the correct relative path after the move — verify it matches.

- [ ] **Step 5: Update GeneralInfoSection import**

In `apps/admin-web/src/features/products/components/GeneralInfoSection.tsx`, change:

```tsx
// Before:
import { RichTextEditor } from './RichTextEditor';

// After:
import { RichTextEditor } from '@components/ui/rich-text-editor';
```

- [ ] **Step 6: Update products barrel export**

In `apps/admin-web/src/features/products/index.ts`, remove the RichTextEditor re-export line:

```tsx
// Remove this line:
export { RichTextEditor, type RichTextEditorProps } from './components/RichTextEditor';
```

- [ ] **Step 7: Add typography plugin import to index.css**

In `apps/admin-web/src/index.css`, add the typography plugin import after the tailwindcss import:

```css
@import "tailwindcss";
@import "@tailwindcss/typography";
```

- [ ] **Step 8: Run tests**

```bash
cd apps/admin-web
pnpm vitest run src/components/ui/rich-text-editor/__tests__/RichTextEditor.test.tsx
```

Expected: All existing tests pass with the new file location.

- [ ] **Step 9: Run lint**

```bash
pnpm lint
```

Expected: No new lint errors. The old import path in GeneralInfoSection should resolve correctly via the alias.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor(admin-web): relocate RichTextEditor to shared UI and add typography plugin"
```

---

### Task 4: Add Ordered List Toolbar Button

**Files:**
- Modify: `apps/admin-web/src/components/ui/rich-text-editor/RichTextEditor.tsx`
- Modify: `apps/admin-web/src/components/ui/rich-text-editor/__tests__/RichTextEditor.test.tsx`

**Interfaces:**
- Consumes: TipTap `editor.chain().focus().toggleOrderedList().run()`, `editor.isActive('orderedList')`, `ListOrdered` from `lucide-react`
- Produces: Updated `RichTextEditor` with 5 toolbar buttons (was 4)

- [ ] **Step 1: Update the test to expect 5 toolbar buttons**

In `apps/admin-web/src/components/ui/rich-text-editor/__tests__/RichTextEditor.test.tsx`, add a test for the ordered list button. First, update the mock to include `toggleOrderedList`:

Update the `useEditor` mock's `focus()` return to include:

```tsx
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
```

Add a test:

```tsx
it('renders ordered list button in toolbar', () => {
  render(<RichTextEditor value="" onChange={vi.fn()} />);
  const buttons = screen.getAllByRole('button');
  // Bold, Italic, BulletList, OrderedList, Link = 5
  expect(buttons.length).toBeGreaterThanOrEqual(5);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/admin-web
pnpm vitest run src/components/ui/rich-text-editor/__tests__/RichTextEditor.test.tsx
```

Expected: FAIL — only 4 buttons rendered.

- [ ] **Step 3: Add the ordered list button to RichTextEditor**

In `apps/admin-web/src/components/ui/rich-text-editor/RichTextEditor.tsx`:

Add `ListOrdered` to the lucide-react import:

```tsx
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Link as LinkIcon,
} from 'lucide-react';
```

Add the ordered list button immediately after the bullet list button (after the `</Button>` for bullet list):

```tsx
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
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd apps/admin-web
pnpm vitest run src/components/ui/rich-text-editor/__tests__/RichTextEditor.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/src/components/ui/rich-text-editor/
git commit -m "feat(admin-web): add ordered list button to rich text editor toolbar"
```

---

### Task 5: Build LinkPopover Component

**Files:**
- Create: `apps/admin-web/src/components/ui/rich-text-editor/LinkPopover.tsx`

**Interfaces:**
- Consumes: TipTap `Editor` type from `@tiptap/react`, `Popover`/`PopoverTrigger`/`PopoverContent` from `@components/ui/popover`, `Button` from `@components/ui/button`, `Input` from `@components/ui/input`
- Produces: `LinkPopover` component with props: `{ editor: Editor; children: React.ReactNode }`. The `children` prop is the trigger element (toolbar button). Exports `LinkPopover` and `LinkPopoverProps`.

- [ ] **Step 1: Create LinkPopover component**

Create `apps/admin-web/src/components/ui/rich-text-editor/LinkPopover.tsx`:

```tsx
import { useState, useEffect, useCallback } from 'react';
import type { Editor } from '@tiptap/react';
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
      // Get the selected/link text
      const { from, to } = editor.state.selection;
      const text = editor.state.doc.textBetween(from, to, '');
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
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (/^mailto:/i.test(trimmed)) return trimmed;
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
```

- [ ] **Step 2: Run lint to verify no errors**

```bash
pnpm lint
```

Expected: No lint errors on the new file.

- [ ] **Step 3: Commit**

```bash
git add apps/admin-web/src/components/ui/rich-text-editor/LinkPopover.tsx
git commit -m "feat(admin-web): add LinkPopover component for inline link editing"
```

---

### Task 6: Build LinkBubbleMenu Component

**Files:**
- Create: `apps/admin-web/src/components/ui/rich-text-editor/LinkBubbleMenu.tsx`

**Interfaces:**
- Consumes: `BubbleMenu` from `@tiptap/react`, `Editor` type from `@tiptap/react`, `LinkPopover` from `./LinkPopover`
- Produces: `LinkBubbleMenu` component with props: `{ editor: Editor }`. Exports `LinkBubbleMenu`.

- [ ] **Step 1: Create LinkBubbleMenu component**

Create `apps/admin-web/src/components/ui/rich-text-editor/LinkBubbleMenu.tsx`:

```tsx
import { useState } from 'react';
import { BubbleMenu, type Editor } from '@tiptap/react';
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
      tippyOptions={{
        placement: 'bottom-start',
        onHidden: () => setIsEditOpen(false),
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
            className="h-7 w-7"
            onClick={() => setIsEditOpen(true)}
          >
            <Pencil className="h-3 w-3" />
          </Button>
        </LinkPopover>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={() => editor.chain().focus().unsetLink().run()}
        >
          <Unlink className="h-3 w-3" />
        </Button>
      </div>
    </BubbleMenu>
  );
}
```

- [ ] **Step 2: Run lint to verify no errors**

```bash
pnpm lint
```

Expected: No lint errors on the new file.

- [ ] **Step 3: Commit**

```bash
git add apps/admin-web/src/components/ui/rich-text-editor/LinkBubbleMenu.tsx
git commit -m "feat(admin-web): add LinkBubbleMenu for floating link editing"
```

---

### Task 7: Integrate LinkPopover and LinkBubbleMenu into RichTextEditor

**Files:**
- Modify: `apps/admin-web/src/components/ui/rich-text-editor/RichTextEditor.tsx`
- Modify: `apps/admin-web/src/components/ui/rich-text-editor/index.ts`
- Modify: `apps/admin-web/src/components/ui/rich-text-editor/__tests__/RichTextEditor.test.tsx`

**Interfaces:**
- Consumes: `LinkPopover` from `./LinkPopover`, `LinkBubbleMenu` from `./LinkBubbleMenu`
- Produces: Updated `RichTextEditor` with inline link editing. No API changes — same `RichTextEditorProps`.

- [ ] **Step 1: Update RichTextEditor to use LinkPopover and LinkBubbleMenu**

Replace the entire `apps/admin-web/src/components/ui/rich-text-editor/RichTextEditor.tsx` with:

```tsx
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
import { LinkPopover } from './LinkPopover';
import { LinkBubbleMenu } from './LinkBubbleMenu';

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
```

Key changes from the original:
- Removed `toggleLink` function (was using `window.prompt`)
- Wrapped the link toolbar button in `<LinkPopover>` — it becomes the popover trigger
- Added `<LinkBubbleMenu>` after `<EditorContent>` — shows floating UI when clicking existing links
- Added `ListOrdered` button (from Task 4 — repeated here since this replaces the full file)

- [ ] **Step 2: Update barrel export to include new components**

In `apps/admin-web/src/components/ui/rich-text-editor/index.ts`:

```ts
export { RichTextEditor } from './RichTextEditor';
export type { RichTextEditorProps } from './RichTextEditor';
export { LinkPopover } from './LinkPopover';
export type { LinkPopoverProps } from './LinkPopover';
export { LinkBubbleMenu } from './LinkBubbleMenu';
export type { LinkBubbleMenuProps } from './LinkBubbleMenu';
```

- [ ] **Step 3: Update test mock to include BubbleMenu**

In `apps/admin-web/src/components/ui/rich-text-editor/__tests__/RichTextEditor.test.tsx`, ensure the `@tiptap/react` mock includes `BubbleMenu`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RichTextEditor } from '../RichTextEditor';

vi.mock('@tiptap/react', () => {
  const EditorContent = ({ editor }: { editor: unknown }) =>
    editor ? <div data-testid="editor-content">Editor Content</div> : null;

  const BubbleMenu = () => null;

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
      getHTML: () => '<p></p>',
      getAttributes: () => ({ href: '' }),
      state: {
        selection: { from: 0, to: 0 },
        doc: { textBetween: () => '' },
      },
      commands: { setContent: vi.fn() },
    }),
    EditorContent,
    BubbleMenu,
  };
});

vi.mock('@tiptap/starter-kit', () => ({
  default: { configure: () => ({}) },
}));

vi.mock('@tiptap/extension-link', () => ({
  default: { configure: () => ({}) },
}));

describe('RichTextEditor', () => {
  it('renders the toolbar buttons', () => {
    render(<RichTextEditor value="" onChange={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    // Bold, Italic, BulletList, OrderedList, Link = 5
    expect(buttons).toHaveLength(5);
  });

  it('renders the editor content area', () => {
    render(<RichTextEditor value="" onChange={vi.fn()} />);
    expect(screen.getByTestId('editor-content')).toBeInTheDocument();
  });

  it('renders ordered list button in toolbar', () => {
    render(<RichTextEditor value="" onChange={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(5);
  });
});
```

- [ ] **Step 4: Run tests**

```bash
cd apps/admin-web
pnpm vitest run src/components/ui/rich-text-editor/__tests__/RichTextEditor.test.tsx
```

Expected: All tests pass.

- [ ] **Step 5: Run lint**

```bash
pnpm lint
```

Expected: No lint errors.

- [ ] **Step 6: Manually verify in browser**

Run: `pnpm dev:admin-web`

Navigate to the product create/edit page and test:

1. **Bullet list**: Click the bullet list button → bullets with disc markers appear
2. **Ordered list**: Click the ordered list button → numbered list appears
3. **Link via toolbar**: Select text → click link button → popover appears with URL and display text fields → enter URL → click Apply → text becomes a link with primary color
4. **Link bubble menu**: Click on an existing link in the editor → bubble menu appears showing the URL, edit, and unlink buttons
5. **Edit existing link**: Click Edit in bubble menu → popover opens pre-filled → change URL → Apply → link updates
6. **Remove link**: Click Unlink in bubble menu → link is removed, text preserved
7. **Remove link from popover**: Open link popover on existing link → click "Remove link" → link removed

- [ ] **Step 7: Commit**

```bash
git add apps/admin-web/src/components/ui/rich-text-editor/
git commit -m "feat(admin-web): integrate LinkPopover and LinkBubbleMenu into rich text editor"
```

---

### Task 8: Final Verification

**Files:** None — verification only

- [ ] **Step 1: Run full test suite**

```bash
pnpm --filter @tiny-threads/admin-web vitest run
```

Expected: All tests pass.

- [ ] **Step 2: Run lint across the workspace**

```bash
pnpm lint
```

Expected: No errors.

- [ ] **Step 3: Build the app**

```bash
pnpm --filter @tiny-threads/admin-web build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 4: Full manual smoke test**

Run: `pnpm dev:admin-web`

Verify all four fixes:
1. Breadcrumb "Products" link navigates without page reload
2. Cards have lighter, subtler borders in both light and dark themes
3. Editor content shows proper bullet/list/link styling (prose typography working)
4. Link popover works for add/edit/remove, bubble menu appears on link click
