# Admin Web Multi-Theme Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `apps/admin-web` theme management from a binary light/dark switch into an extensible multi-theme architecture supporting dynamic themes (`light`, `dark`, `midnight`, `emerald`).

**Architecture:** Create a central Theme Registry in `src/theme/themes.ts`, scope CSS color tokens to `[data-theme="<id>"]` attributes in `src/index.css`, persist chosen theme in `localStorage` via Redux `appSlice`, replace binary `AuthCard` hex styling with semantic token utilities, and introduce a `ThemeSelect` dropdown component.

**Tech Stack:** React 19, Redux Toolkit, Tailwind CSS v4, Lucide React, Vitest/Jest / React Testing Library.

## Global Constraints
- Target package: `apps/admin-web`
- CSS attribute selector: `[data-theme="<themeId>"]` on `document.documentElement`
- Storage Key: `tiny_threads_admin_theme`
- Supported themes: `light`, `dark`, `midnight`, `emerald`

---

### Task 1: Central Theme Registry (`src/theme/themes.ts`)

**Files:**
- Create: `apps/admin-web/src/theme/themes.ts`
- Create: `apps/admin-web/src/theme/themes.test.ts`

**Interfaces:**
- Consumes: None
- Produces: `ThemeId`, `ThemeConfig`, `THEMES`, `DEFAULT_THEME`, `THEME_STORAGE_KEY`, `getSavedTheme()`, `applyThemeToDocument()`

- [ ] **Step 1: Write the failing unit test for Theme Registry**

Create `apps/admin-web/src/theme/themes.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  THEMES,
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  getSavedTheme,
  applyThemeToDocument,
} from './themes';

describe('Theme Registry', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.className = '';
  });

  it('should export registered themes list with light, dark, midnight, emerald', () => {
    const ids = THEMES.map((t) => t.id);
    expect(ids).toEqual(['light', 'dark', 'midnight', 'emerald']);
  });

  it('should fallback to DEFAULT_THEME when localStorage is empty', () => {
    expect(getSavedTheme()).toBe(DEFAULT_THEME);
  });

  it('should retrieve saved theme from localStorage if valid', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'midnight');
    expect(getSavedTheme()).toBe('midnight');
  });

  it('should fallback to DEFAULT_THEME if stored theme is invalid', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'invalid-theme');
    expect(getSavedTheme()).toBe(DEFAULT_THEME);
  });

  it('should set data-theme attribute on document root', () => {
    applyThemeToDocument('emerald');
    expect(document.documentElement.getAttribute('data-theme')).toBe('emerald');
  });

  it('should add dark class for dark/midnight theme for backward compatibility', () => {
    applyThemeToDocument('midnight');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    applyThemeToDocument('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/admin-web test src/theme/themes.test.ts`
Expected: FAIL due to missing `themes.ts` module.

- [ ] **Step 3: Write implementation for Theme Registry**

Create `apps/admin-web/src/theme/themes.ts`:
```ts
export type ThemeId = 'light' | 'dark' | 'midnight' | 'emerald' | string;

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  description: string;
  iconName: 'Sun' | 'Moon' | 'Sparkles' | 'Trees';
}

export const THEMES: ThemeConfig[] = [
  {
    id: 'light',
    name: 'Light',
    description: 'Clean light palette',
    iconName: 'Sun',
  },
  {
    id: 'dark',
    name: 'Dark',
    description: 'Classic dark mode',
    iconName: 'Moon',
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Deep navy & purple night theme',
    iconName: 'Sparkles',
  },
  {
    id: 'emerald',
    name: 'Emerald',
    description: 'Rich dark slate & mint theme',
    iconName: 'Trees',
  },
];

export const DEFAULT_THEME: ThemeId = 'dark';
export const THEME_STORAGE_KEY = 'tiny_threads_admin_theme';

export function getSavedTheme(): ThemeId {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved && THEMES.some((t) => t.id === saved)) {
    return saved;
  }
  return DEFAULT_THEME;
}

export function applyThemeToDocument(themeId: ThemeId): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', themeId);

  if (themeId === 'dark' || themeId === 'midnight') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/admin-web test src/theme/themes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/src/theme/themes.ts apps/admin-web/src/theme/themes.test.ts
git commit -m "feat(admin-web): add central theme registry and DOM helpers"
```

---

### Task 2: Refactor Redux App Slice (`src/store/slices/appSlice.ts`)

**Files:**
- Modify: `apps/admin-web/src/store/slices/appSlice.ts`

**Interfaces:**
- Consumes: `ThemeId`, `getSavedTheme()`, `applyThemeToDocument()`, `THEME_STORAGE_KEY` from `src/theme/themes.ts`
- Produces: `AppState.theme`, `setTheme(themeId: ThemeId)` action reducer

- [ ] **Step 1: Update `appSlice.ts` implementation**

Update `apps/admin-web/src/store/slices/appSlice.ts`:
```ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import {
  ThemeId,
  getSavedTheme,
  applyThemeToDocument,
  THEME_STORAGE_KEY,
} from '../../theme/themes';

export interface AppState {
  tenantId: string | null;
  tenantName: string;
  theme: ThemeId;
}

const initialState: AppState = {
  tenantId: null,
  tenantName: 'Tiny Threads Admin',
  theme: getSavedTheme(),
};

export const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setTenant: (state, action: PayloadAction<{ id: string; name: string }>) => {
      state.tenantId = action.payload.id;
      state.tenantName = action.payload.name;
    },
    setTheme: (state, action: PayloadAction<ThemeId>) => {
      state.theme = action.payload;
      if (typeof window !== 'undefined') {
        localStorage.setItem(THEME_STORAGE_KEY, action.payload);
      }
      applyThemeToDocument(action.payload);
    },
  },
});

export const { setTenant, setTheme } = appSlice.actions;
export const selectApp = (state: { app: AppState }) => state.app;
export default appSlice.reducer;
```

- [ ] **Step 2: Verify TypeScript compilation & tests**

Run: `pnpm --filter @tiny-threads/admin-web build`
Expected: Clean build without errors.

- [ ] **Step 3: Commit**

```bash
git add apps/admin-web/src/store/slices/appSlice.ts
git commit -m "feat(admin-web): update appSlice with dynamic theme selection and persistence"
```

---

### Task 3: Multi-Theme CSS Custom Properties (`src/index.css`)

**Files:**
- Modify: `apps/admin-web/src/index.css`

**Interfaces:**
- Consumes: Theme selectors `:root, [data-theme="light"]`, `[data-theme="dark"]`, `[data-theme="midnight"]`, `[data-theme="emerald"]`
- Produces: CSS custom properties mapped to `@theme` and shadcn variables

- [ ] **Step 1: Update `src/index.css` with scoped data-theme selectors**

Update `apps/admin-web/src/index.css`:
```css
@import "tailwindcss";

@theme {
  --color-surface: var(--color-surface);
  --color-surface-dim: var(--color-surface-dim);
  --color-surface-bright: var(--color-surface-bright);
  --color-surface-container-lowest: var(--color-surface-container-lowest);
  --color-surface-container-low: var(--color-surface-container-low);
  --color-surface-container: var(--color-surface-container);
  --color-surface-container-high: var(--color-surface-container-high);
  --color-surface-container-highest: var(--color-surface-container-highest);
  --color-on-surface: var(--color-on-surface);
  --color-on-surface-variant: var(--color-on-surface-variant);
  --color-inverse-surface: var(--color-inverse-surface);
  --color-inverse-on-surface: var(--color-inverse-on-surface);
  --color-outline: var(--color-outline);
  --color-outline-variant: var(--color-outline-variant);
  --color-surface-tint: var(--color-surface-tint);

  --color-primary: var(--color-primary-val);
  --color-on-primary: var(--color-on-primary);
  --color-primary-container: var(--color-primary-container);
  --color-on-primary-container: var(--color-on-primary-container);
  --color-inverse-primary: var(--color-inverse-primary);

  --color-secondary: var(--color-secondary-val);
  --color-on-secondary: var(--color-on-secondary);
  --color-secondary-container: var(--color-secondary-container);
  --color-on-secondary-container: var(--color-on-secondary-container);

  --color-tertiary: var(--color-tertiary-val);
  --color-on-tertiary: var(--color-on-tertiary);
  --color-tertiary-container: var(--color-tertiary-container);
  --color-on-tertiary-container: var(--color-on-tertiary-container);

  --color-success: var(--color-success);
  --color-on-success: var(--color-on-success);
  --color-success-container: var(--color-success-container);
  --color-on-success-container: var(--color-on-success-container);

  --color-warning: var(--color-warning);
  --color-on-warning: var(--color-on-warning);
  --color-warning-container: var(--color-warning-container);
  --color-on-warning-container: var(--color-on-warning-container);

  --color-info: var(--color-info);
  --color-on-info: var(--color-on-info);
  --color-info-container: var(--color-info-container);
  --color-on-info-container: var(--color-on-info-container);

  --color-error: var(--color-error);
  --color-on-error: var(--color-on-error);
  --color-error-container: var(--color-error-container);
  --color-on-error-container: var(--color-on-error-container);

  --font-sans: 'Inter', system-ui, sans-serif;
  --font-headline-light: 'Plus Jakarta Sans', sans-serif;
  --font-headline-dark: 'Hanken Grotesk', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  --radius-sm: 0.125rem;
  --radius-default: 0.25rem;
  --radius-md: 0.375rem;
  --radius-lg: 0.5rem;
  --radius-xl: 0.75rem;
  --radius-full: 9999px;
}

@layer base {
  :root,
  [data-theme="light"] {
    --color-surface: #f9f9ff;
    --color-surface-dim: #d3daea;
    --color-surface-bright: #f9f9ff;
    --color-surface-container-lowest: #ffffff;
    --color-surface-container-low: #f0f3ff;
    --color-surface-container: #e7eefe;
    --color-surface-container-high: #e2e8f8;
    --color-surface-container-highest: #dce2f3;
    --color-on-surface: #151c27;
    --color-on-surface-variant: #464555;
    --color-inverse-surface: #2a313d;
    --color-inverse-on-surface: #ebf1ff;
    --color-outline: #777587;
    --color-outline-variant: #c7c4d8;
    --color-surface-tint: #4d44e3;

    --color-primary-val: #3525cd;
    --color-on-primary: #ffffff;
    --color-primary-container: #4f46e5;
    --color-on-primary-container: #dad7ff;
    --color-inverse-primary: #c3c0ff;

    --color-secondary-val: #575e70;
    --color-on-secondary: #ffffff;
    --color-secondary-container: #d9dff5;
    --color-on-secondary-container: #5c6274;

    --color-tertiary-val: #7e3000;
    --color-on-tertiary: #ffffff;
    --color-tertiary-container: #a44100;
    --color-on-tertiary-container: #ffd2be;

    --color-success: #006e3a;
    --color-on-success: #ffffff;
    --color-success-container: #22ca71;
    --color-on-success-container: #00210e;

    --color-warning: #835500;
    --color-on-warning: #ffffff;
    --color-warning-container: #ffb95c;
    --color-on-warning-container: #2a1700;

    --color-info: #006399;
    --color-on-info: #ffffff;
    --color-info-container: #00a3f5;
    --color-on-info-container: #001d32;

    --color-error: #ba1a1a;
    --color-on-error: #ffffff;
    --color-error-container: #ffdad6;
    --color-on-error-container: #93000a;

    --spacing-margin-desktop-val: 32px;

    /* shadcn/ui mapping */
    --background: #f9f9ff;
    --foreground: #151c27;
    --card: #ffffff;
    --card-foreground: #151c27;
    --popover: #ffffff;
    --popover-foreground: #151c27;
    --primary: #3525cd;
    --primary-foreground: #ffffff;
    --secondary: #575e70;
    --secondary-foreground: #ffffff;
    --muted: #e7eefe;
    --muted-foreground: #464555;
    --accent: #e2e8f8;
    --accent-foreground: #151c27;
    --destructive: #ba1a1a;
    --destructive-foreground: #ffffff;
    --border: #c7c4d8;
    --input: #c7c4d8;
    --ring: #4d44e3;
    --radius: 0.375rem;
  }

  .dark,
  [data-theme="dark"] {
    --color-surface: #0b1326;
    --color-surface-dim: #0b1326;
    --color-surface-bright: #31394d;
    --color-surface-container-lowest: #060e20;
    --color-surface-container-low: #131b2e;
    --color-surface-container: #171f33;
    --color-surface-container-high: #222a3d;
    --color-surface-container-highest: #2d3449;
    --color-on-surface: #dae2fd;
    --color-on-surface-variant: #c7c4d7;
    --color-inverse-surface: #dae2fd;
    --color-inverse-on-surface: #283044;
    --color-outline: #908fa0;
    --color-outline-variant: #464554;
    --color-surface-tint: #c0c1ff;

    --color-primary-val: #c0c1ff;
    --color-on-primary: #1000a9;
    --color-primary-container: #8083ff;
    --color-on-primary-container: #0d0096;
    --color-inverse-primary: #494bd6;

    --color-secondary-val: #b9c8de;
    --color-on-secondary: #233143;
    --color-secondary-container: #39485a;
    --color-on-secondary-container: #a7b6cc;

    --color-tertiary-val: #4edea3;
    --color-on-tertiary: #003824;
    --color-tertiary-container: #00885d;
    --color-on-tertiary-container: #000703;

    --color-success: #4edea3;
    --color-on-success: #003824;
    --color-success-container: #005236;
    --color-on-success-container: #6ffbbe;

    --color-warning: #ffb95c;
    --color-on-warning: #452b00;
    --color-warning-container: #633f00;
    --color-on-warning-container: #ffddb6;

    --color-info: #8fcdff;
    --color-on-info: #003454;
    --color-info-container: #004b75;
    --color-on-info-container: #cbe6ff;

    --color-error: #ffb4ab;
    --color-on-error: #690005;
    --color-error-container: #93000a;
    --color-on-error-container: #ffdad6;

    --spacing-margin-desktop-val: 40px;

    /* shadcn/ui mapping */
    --background: #0b1326;
    --foreground: #dae2fd;
    --card: #060e20;
    --card-foreground: #dae2fd;
    --popover: #060e20;
    --popover-foreground: #dae2fd;
    --primary: #c0c1ff;
    --primary-foreground: #1000a9;
    --secondary: #b9c8de;
    --secondary-foreground: #233143;
    --muted: #171f33;
    --muted-foreground: #c7c4d7;
    --accent: #222a3d;
    --accent-foreground: #dae2fd;
    --destructive: #ffb4ab;
    --destructive-foreground: #690005;
    --border: #464554;
    --input: #464554;
    --ring: #c0c1ff;
  }

  [data-theme="midnight"] {
    --color-surface: #0f172a;
    --color-surface-dim: #0b1120;
    --color-surface-bright: #1e293b;
    --color-surface-container-lowest: #020617;
    --color-surface-container-low: #0f172a;
    --color-surface-container: #1e293b;
    --color-surface-container-high: #334155;
    --color-surface-container-highest: #475569;
    --color-on-surface: #f8fafc;
    --color-on-surface-variant: #94a3b8;
    --color-inverse-surface: #f8fafc;
    --color-inverse-on-surface: #0f172a;
    --color-outline: #64748b;
    --color-outline-variant: #334155;
    --color-surface-tint: #818cf8;

    --color-primary-val: #818cf8;
    --color-on-primary: #1e1b4b;
    --color-primary-container: #4338ca;
    --color-on-primary-container: #e0e7ff;
    --color-inverse-primary: #3730a3;

    --color-secondary-val: #cbd5e1;
    --color-on-secondary: #0f172a;
    --color-secondary-container: #334155;
    --color-on-secondary-container: #e2e8f0;

    --color-tertiary-val: #c084fc;
    --color-on-tertiary: #3b0764;
    --color-tertiary-container: #7e22ce;
    --color-on-tertiary-container: #f3e8ff;

    --color-success: #34d399;
    --color-on-success: #064e3b;
    --color-success-container: #047857;
    --color-on-success-container: #d1fae5;

    --color-warning: #fbbf24;
    --color-on-warning: #78350f;
    --color-warning-container: #b45309;
    --color-on-warning-container: #fef3c7;

    --color-info: #38bdf8;
    --color-on-info: #075985;
    --color-info-container: #0284c7;
    --color-on-info-container: #e0f2fe;

    --color-error: #f87171;
    --color-on-error: #7f1d1d;
    --color-error-container: #b91c1c;
    --color-on-error-container: #fee2e2;

    --spacing-margin-desktop-val: 40px;

    /* shadcn/ui mapping */
    --background: #0f172a;
    --foreground: #f8fafc;
    --card: #020617;
    --card-foreground: #f8fafc;
    --popover: #020617;
    --popover-foreground: #f8fafc;
    --primary: #818cf8;
    --primary-foreground: #1e1b4b;
    --secondary: #cbd5e1;
    --secondary-foreground: #0f172a;
    --muted: #1e293b;
    --muted-foreground: #94a3b8;
    --accent: #334155;
    --accent-foreground: #f8fafc;
    --destructive: #f87171;
    --destructive-foreground: #7f1d1d;
    --border: #334155;
    --input: #334155;
    --ring: #818cf8;
  }

  [data-theme="emerald"] {
    --color-surface: #064e3b;
    --color-surface-dim: #022c22;
    --color-surface-bright: #047857;
    --color-surface-container-lowest: #022c22;
    --color-surface-container-low: #064e3b;
    --color-surface-container: #047857;
    --color-surface-container-high: #059669;
    --color-surface-container-highest: #10b981;
    --color-on-surface: #ecfdf5;
    --color-on-surface-variant: #a7f3d0;
    --color-inverse-surface: #ecfdf5;
    --color-inverse-on-surface: #022c22;
    --color-outline: #34d399;
    --color-outline-variant: #065f46;
    --color-surface-tint: #10b981;

    --color-primary-val: #34d399;
    --color-on-primary: #022c22;
    --color-primary-container: #059669;
    --color-on-primary-container: #d1fae5;
    --color-inverse-primary: #047857;

    --color-secondary-val: #a7f3d0;
    --color-on-secondary: #064e3b;
    --color-secondary-container: #065f46;
    --color-on-secondary-container: #ecfdf5;

    --color-tertiary-val: #fde047;
    --color-on-tertiary: #713f12;
    --color-tertiary-container: #ca8a04;
    --color-on-tertiary-container: #fef9c3;

    --color-success: #34d399;
    --color-on-success: #022c22;
    --color-success-container: #059669;
    --color-on-success-container: #d1fae5;

    --color-warning: #fbbf24;
    --color-on-warning: #78350f;
    --color-warning-container: #b45309;
    --color-on-warning-container: #fef3c7;

    --color-info: #38bdf8;
    --color-on-info: #075985;
    --color-info-container: #0284c7;
    --color-on-info-container: #e0f2fe;

    --color-error: #f87171;
    --color-on-error: #7f1d1d;
    --color-error-container: #b91c1c;
    --color-on-error-container: #fee2e2;

    --spacing-margin-desktop-val: 40px;

    /* shadcn/ui mapping */
    --background: #022c22;
    --foreground: #ecfdf5;
    --card: #064e3b;
    --card-foreground: #ecfdf5;
    --popover: #064e3b;
    --popover-foreground: #ecfdf5;
    --primary: #34d399;
    --primary-foreground: #022c22;
    --secondary: #a7f3d0;
    --secondary-foreground: #064e3b;
    --muted: #047857;
    --muted-foreground: #a7f3d0;
    --accent: #059669;
    --accent-foreground: #ecfdf5;
    --destructive: #f87171;
    --destructive-foreground: #7f1d1d;
    --border: #065f46;
    --input: #065f46;
    --ring: #34d399;
  }
}
```

- [ ] **Step 2: Commit CSS Token configurations**

```bash
git add apps/admin-web/src/index.css
git commit -m "feat(admin-web): add scoped data-theme custom property palettes for multi-theme support"
```

---

### Task 4: Create Reusable `ThemeSelect` Dropdown Component (`src/components/ui/theme-select.tsx`)

**Files:**
- Create: `apps/admin-web/src/components/ui/theme-select.tsx`

**Interfaces:**
- Consumes: `THEMES`, `ThemeId`, `useAppDispatch`, `useAppSelector`, `setTheme`
- Produces: `<ThemeSelect />` component dropdown

- [ ] **Step 1: Create `ThemeSelect` component**

Create `apps/admin-web/src/components/ui/theme-select.tsx`:
```tsx
import * as React from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectApp, setTheme } from '../../store/slices/appSlice';
import { THEMES, ThemeConfig } from '../../theme/themes';
import { Sun, Moon, Sparkles, Trees, Palette, Check } from 'lucide-react';

const ICON_MAP: Record<ThemeConfig['iconName'], React.ComponentType<{ className?: string }>> = {
  Sun,
  Moon,
  Sparkles,
  Trees,
};

export interface ThemeSelectProps {
  className?: string;
}

export function ThemeSelect({ className = '' }: ThemeSelectProps) {
  const dispatch = useAppDispatch();
  const { theme: currentThemeId } = useAppSelector(selectApp);
  const [isOpen, setIsOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const activeTheme = THEMES.find((t) => t.id === currentThemeId) || THEMES[0];
  const ActiveIcon = ICON_MAP[activeTheme.iconName] || Palette;

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`relative inline-block text-left ${className}`} ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card text-card-foreground shadow-xs hover:bg-muted transition-colors cursor-pointer"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label="Select theme"
      >
        <ActiveIcon className="h-4 w-4 text-primary" />
        <span>{activeTheme.name}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 rounded-xl border border-border bg-card text-card-foreground shadow-lg z-50 py-1 font-sans">
          <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/50">
            Select Theme
          </div>
          <div className="py-1">
            {THEMES.map((t) => {
              const IconComponent = ICON_MAP[t.iconName] || Palette;
              const isSelected = t.id === currentThemeId;

              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    dispatch(setTheme(t.id));
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-colors cursor-pointer hover:bg-muted/70 ${
                    isSelected ? 'bg-muted font-semibold text-primary' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <IconComponent className="h-4 w-4 text-primary" />
                    <div>
                      <div>{t.name}</div>
                      <div className="text-[10px] text-muted-foreground font-normal">
                        {t.description}
                      </div>
                    </div>
                  </div>
                  {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit `ThemeSelect` component**

```bash
git add apps/admin-web/src/components/ui/theme-select.tsx
git commit -m "feat(admin-web): add ThemeSelect dropdown component"
```

---

### Task 5: Refactor `AuthCard.tsx`, `LoginPage.tsx`, and `App.tsx`

**Files:**
- Modify: `apps/admin-web/src/components/auth/AuthCard.tsx`
- Modify: `apps/admin-web/src/pages/LoginPage.tsx`
- Modify: `apps/admin-web/src/App.tsx`

**Interfaces:**
- Consumes: `<ThemeSelect />`, semantic CSS token utility classes (`bg-background text-foreground border-border bg-card`)
- Produces: Fully theme-agnostic layout components

- [ ] **Step 1: Refactor `AuthCard.tsx`**

Update `apps/admin-web/src/components/auth/AuthCard.tsx`:
```tsx
import * as React from 'react';
import { ThemeSelect } from '../ui/theme-select';

export interface AuthCardProps {
  children: React.ReactNode;
  className?: string;
}

export function AuthCard({ children, className = '' }: AuthCardProps) {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 md:p-8 font-sans relative transition-colors duration-200 bg-background text-foreground">
      <div className="absolute top-6 right-6">
        <ThemeSelect />
      </div>
      <div
        className={`w-full max-w-md border border-border rounded-xl p-8 md:p-10 transition-colors bg-card text-card-foreground shadow-sm ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `LoginPage.tsx`**

Update `apps/admin-web/src/pages/LoginPage.tsx`:
```tsx
import { useState, useId } from 'react';
import { useAppDispatch } from '../store/hooks';
import { setTenant } from '../store/slices/appSlice';
import { loginSuccess } from '../store/slices/authSlice';
import { AuthCard } from '../components/auth/AuthCard';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { Store, ArrowRight, Lock, User, AlertCircle } from 'lucide-react';

export function LoginPage() {
  const dispatch = useAppDispatch();
  const emailId = useId();
  const passwordId = useId();

  const [email, setEmail] = useState('admin@tinythreads.dev');
  const [password, setPassword] = useState('password123');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    setTimeout(() => {
      if (password !== 'password123') {
        setError('Invalid credentials. Password is password123');
        setIsLoading(false);
        return;
      }

      dispatch(
        loginSuccess({
          token: 'jwt-mock-merchant-token',
          user: {
            id: 'usr_m1',
            email,
            name: 'Merchant Admin',
            role: 'MERCHANT_ADMIN',
          },
        }),
      );

      dispatch(
        setTenant({
          id: 'tenant_demo_1',
          name: 'Tiny Threads Apparels',
        }),
      );

      setIsLoading(false);
    }, 600);
  };

  return (
    <AuthCard>
      <div className="flex flex-col items-center mb-8 text-center">
        <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
          <Store className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Merchant Portal</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Sign in to manage your e-commerce tenant store
        </p>
      </div>

      {error && (
        <div className="mb-6 p-3.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={emailId} className="text-xs font-medium">
            Email Address
          </Label>
          <div className="relative">
            <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id={emailId}
              type="email"
              placeholder="admin@merchant.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-9"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor={passwordId} className="text-xs font-medium">
              Password
            </Label>
            <span className="text-xs text-primary hover:underline cursor-pointer">
              Forgot password?
            </span>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id={passwordId}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-9"
              required
            />
          </div>
        </div>

        <Button type="submit" className="w-full mt-2" disabled={isLoading}>
          {isLoading ? (
            'Authenticating...'
          ) : (
            <span className="flex items-center justify-center gap-2">
              Sign In <ArrowRight className="h-4 w-4" />
            </span>
          )}
        </Button>
      </form>
    </AuthCard>
  );
}
```

- [ ] **Step 3: Refactor `App.tsx` to use `<ThemeSelect />`**

Update `apps/admin-web/src/App.tsx`:
```tsx
import React from 'react';
import { useAppDispatch, useAppSelector } from './store/hooks';
import { selectApp, setTheme } from './store/slices/appSlice';
import { selectAuth, logout } from './store/slices/authSlice';
import { applyThemeToDocument } from './theme/themes';
import { LoginPage } from './pages/LoginPage';
import { ThemeSelect } from './components/ui/theme-select';
import { Button } from './components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './components/ui/card';
import { Badge } from './components/ui/badge';
import { ErrorCode } from '@tiny-threads/shared';
import {
  ShieldAlert,
  Store,
  Layers,
  LogOut,
  User as UserIcon,
} from 'lucide-react';

export default function App() {
  const dispatch = useAppDispatch();
  const { tenantId, tenantName, theme } = useAppSelector(selectApp);
  const { isAuthenticated, user } = useAppSelector(selectAuth);

  React.useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-200">
      {!isAuthenticated ? (
        <LoginPage />
      ) : (
        <div className="container mx-auto max-w-4xl p-8">
          <header className="flex items-center justify-between pb-8 border-b border-border">
            <div className="flex items-center gap-3">
              <Store className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  {tenantName}
                </h1>
                <p className="text-sm text-muted-foreground">
                  Merchant Administration Console
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                variant={tenantId ? 'default' : 'secondary'}
                className="px-3 py-1 text-xs"
              >
                {tenantId ? `Tenant: ${tenantId}` : 'Platform Context'}
              </Badge>
              <ThemeSelect />
              <Button
                variant="outline"
                size="sm"
                onClick={() => dispatch(logout())}
                className="gap-2 text-destructive border-destructive/20 hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" />
                <span>Log out</span>
              </Button>
            </div>
          </header>

          <main className="py-8 space-y-6">
            <Card className="border-border bg-card text-card-foreground">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="h-5 w-5 text-primary" />
                  <span>Authenticated Merchant Session</span>
                </CardTitle>
                <CardDescription>
                  React 19 + Redux Toolkit + Multi-Theme Architecture Verified
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-muted border border-border">
                    <span className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5 mb-1">
                      <UserIcon className="h-3.5 w-3.5" /> Logged In User
                    </span>
                    <p className="text-base font-medium">
                      {user?.name} ({user?.email})
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Role: {user?.role}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted border border-border">
                    <span className="text-xs font-semibold uppercase text-muted-foreground">
                      Shared Error Code
                    </span>
                    <p className="text-sm font-mono mt-1 flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 text-amber-500" />
                      <span>{ErrorCode.AUTH_INSUFFICIENT_ROLE}</span>
                    </p>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="gap-3">
                <Button onClick={() => dispatch(logout())}>Sign Out</Button>
                <ThemeSelect />
              </CardFooter>
            </Card>
          </main>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Commit refactored UI components**

```bash
git add apps/admin-web/src/components/auth/AuthCard.tsx apps/admin-web/src/pages/LoginPage.tsx apps/admin-web/src/App.tsx
git commit -m "refactor(admin-web): replace binary theme toggling with ThemeSelect and semantic tokens"
```

---

### Task 6: End-to-End Verification & Build Check

**Files:**
- None (Verification step)

- [ ] **Step 1: Run unit tests for admin-web**

Run: `pnpm --filter @tiny-threads/admin-web test`
Expected: All tests pass cleanly.

- [ ] **Step 2: Run full build check for workspace**

Run: `pnpm build`
Expected: Successful build for shared package and admin-web.

- [ ] **Step 3: Commit completion**

```bash
git commit --allow-empty -m "chore(admin-web): multi-theme architecture verification complete"
```
