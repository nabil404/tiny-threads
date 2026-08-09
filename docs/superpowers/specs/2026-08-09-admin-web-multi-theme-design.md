# Admin Web Multi-Theme Architecture Design

## 1. Overview
This specification details the refactoring of `apps/admin-web` theme management from a binary light/dark mode switch into a modular, multi-theme architecture. The architecture enables adding arbitrary new themes (e.g. `midnight`, `emerald`, `cyberpunk`, `nord`) by simply registering the theme key and defining its CSS custom properties without modifying core UI logic.

---

## 2. Core Architecture & Components

```
apps/admin-web/src/
├── theme/
│   └── themes.ts                # Central Theme Registry & helper utilities
├── components/
│   ├── auth/
│   │   └── AuthCard.tsx         # Semantic card component (decoupled from hardcoded colors)
│   └── ui/
│       └── theme-select.tsx     # Dropdown selector for picking themes
├── store/
│   └── slices/
│       └── appSlice.ts          # Redux state, setTheme action, localStorage sync
├── index.css                    # CSS token palettes scoped to [data-theme="<id>"]
└── App.tsx                      # Top bar shell incorporating ThemeSelect component
```

---

## 3. Detailed Specifications

### 3.1 Central Theme Registry (`src/theme/themes.ts`)
The theme registry defines available themes, metadata, default theme, and DOM synchronization utilities.

```typescript
export type ThemeId = 'light' | 'dark' | 'midnight' | 'emerald' | string;

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  description: string;
  iconName: 'Sun' | 'Moon' | 'Sparkles' | 'Trees';
}

export const THEMES: ThemeConfig[] = [
  { id: 'light', name: 'Light', description: 'Clean light palette', iconName: 'Sun' },
  { id: 'dark', name: 'Dark', description: 'Classic dark mode', iconName: 'Moon' },
  { id: 'midnight', name: 'Midnight', description: 'Deep indigo & navy theme', iconName: 'Sparkles' },
  { id: 'emerald', name: 'Emerald', description: 'Rich green & mint theme', iconName: 'Trees' },
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
  // Maintain backward compatibility for class-based .dark selectors if any
  if (themeId === 'dark' || themeId === 'midnight') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}
```

---

### 3.2 Redux Store Slice (`src/store/slices/appSlice.ts`)
Update state types and actions to handle dynamic theme selection and persistence.

```typescript
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
```

---

### 3.3 CSS Custom Properties & Palettes (`src/index.css`)
Refactor `:root` and `.dark` into `[data-theme]` selectors. Add palettes for `midnight` and `emerald` themes.

- `:root, [data-theme="light"]`: Light mode surface, background, and primary variables.
- `[data-theme="dark"]`: Dark mode surface (`#0b1326`), background, and primary variables.
- `[data-theme="midnight"]`: Deep navy surface (`#0f172a`), purple/indigo primary variables (`#818cf8`).
- `[data-theme="emerald"]`: Dark slate surface (`#064e3b` / `#022c22`), emerald primary variables (`#10b981`).

Tailwind v4 `@theme` binds variables `--background`, `--foreground`, `--color-surface`, `--color-primary`, `--border`, etc. automatically.

---

### 3.4 Decoupled Component Styling

#### `AuthCard.tsx`
Remove binary `isDark ? 'bg-[#0b1326]...' : '...'` logic.
Use semantic CSS/Tailwind classes:
```tsx
<div className="min-h-screen w-full flex flex-col items-center justify-center p-4 md:p-8 font-sans relative transition-colors duration-200 bg-background text-foreground">
  ...
  <div className="w-full max-w-md border border-border rounded-xl p-8 md:p-10 transition-colors bg-card text-card-foreground shadow-sm">
    {children}
  </div>
</div>
```

#### `ThemeSelect.tsx`
A dropdown selector component displaying all registered themes with icons, allowing seamless switching between any theme in the registry.

---

## 4. Verification & Testing Plan
1. **Theme Switch Verification**: Select each theme from the `ThemeSelect` component on both Login and Merchant Dashboard pages. Verify document root attribute updates to `data-theme="<id>"`.
2. **Persistence Verification**: Select `midnight` or `emerald`, refresh the browser, and verify theme persists from `localStorage`.
3. **Build & Quality Check**: Run `pnpm --filter @tiny-threads/admin-web build` and `pnpm lint` to ensure zero compilation or lint errors.
