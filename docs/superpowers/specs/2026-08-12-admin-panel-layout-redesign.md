# Admin Panel Layout Redesign Specification

- **Date**: 2026-08-12
- **Author**: Antigravity & User
- **Status**: Approved
- **Target Application**: `apps/admin-web`

---

## 1. Overview & Objectives

This specification outlines the redesign of the **Admin Panel Layout** (`Sidebar` and `Topbar`) in `apps/admin-web` inspired by the Stitch Merchant Dashboard design system.

### Key Goals
1. **Collapsible Sidebar (Desktop `md:`)**:
   - Expanded state (`w-64`): Displays Store branding header ("SM" initials avatar, store name, "Active" status), full navigation labels, icons, and footer actions (Support, Sign Out).
   - Compact state (`w-16`): Displays icons only with floating tooltips on hover for labels.
   - Smooth CSS transitions (`transition-all duration-300 ease-in-out`).
   - Persistent desktop collapse preference in `localStorage` (`tiny_threads_sidebar_collapsed`).
2. **Mobile Navigation Drawer (`< md`)**:
   - Slide-out sheet drawer triggered by a Topbar hamburger button.
   - Semi-transparent backdrop with click-outside dismissal and auto-closing on route change or viewport resize.
3. **Streamlined Topbar**:
   - Left side: Mobile hamburger trigger (`md:hidden`), Desktop sidebar collapse toggle (`hidden md:flex`), and Global search input.
   - Right side: User Avatar interactive dropdown menu.
4. **Interactive User Avatar Dropdown**:
   - Encapsulates User Name, Email, Role badge, and Tenant Context badge.
   - Integrates Theme switcher (Light / Dark) and Language switcher (Locale selector).
   - Quick navigation to Account Settings.
   - Sign Out button with logout mutation execution and state reset.
5. **Full Stitch Navigation Menu with Placeholders**:
   - Overview (`/`), Orders (`/orders`), Products (`/products`), Categories (`/categories`), Customers (`/customers`), Analytics (`/analytics`), Settings (`/settings`), Support (`/support`), Sign Out.
   - Placeholder pages for routes not yet implemented.

---

## 2. Visual Architecture & Layout Diagrams

### Desktop Expanded View (`md:`, `sidebarCollapsed = false`)
```
+-------------------------------------------------------------------------------------------------------------------+
| [SM] Store Manager (Active) |  [=]  [ Search...                      ]                      [ (JD) Jane Doe v ]   |
|-----------------------------+-------------------------------------------------------------------------------------|
| (x) Overview                |                                                                                     |
| (x) Orders                  |                                                                                     |
| (x) Products                |                                                                                     |
| (x) Categories              |                             <Outlet /> Route Content                                |
| (x) Customers               |                                                                                     |
| (x) Analytics               |                                                                                     |
| (x) Settings                |                                                                                     |
|                             |                                                                                     |
|-----------------------------|                                                                                     |
| (?) Support                 |                                                                                     |
| [->] Sign Out               |                                                                                     |
+-------------------------------------------------------------------------------------------------------------------+
```

### Desktop Compact View (`md:`, `sidebarCollapsed = true`)
```
+-------------------------------------------------------------------------------------------------------------------+
| [SM]                        |  [=]  [ Search...                      ]                      [ (JD) Jane Doe v ]   |
|-----------------------------+-------------------------------------------------------------------------------------|
| (x) -> [Tooltip: Overview]  |                                                                                     |
| (x) -> [Tooltip: Orders]    |                                                                                     |
| (x) -> [Tooltip: Products]  |                             <Outlet /> Route Content                                |
| (x) -> [Tooltip: Categories]|                                                                                     |
| (x) -> [Tooltip: Customers] |                                                                                     |
| (x) -> [Tooltip: Analytics] |                                                                                     |
| (x) -> [Tooltip: Settings]  |                                                                                     |
|                             |                                                                                     |
|-----------------------------|                                                                                     |
| (?) -> [Tooltip: Support]   |                                                                                     |
| [->]-> [Tooltip: Sign Out]  |                                                                                     |
+-------------------------------------------------------------------------------------------------------------------+
```

### User Avatar Dropdown Popover
```
+---------------------------------------------------+
|  Jane Doe                                         |
|  admin@demo.com                                   |
|  [Tenant: Demo Store]  [Role: Owner]              |
+---------------------------------------------------+
|  Theme:       [ Light (o) ]  [ Dark ( ) ]         |
|  Language:    [ English (US)            v ]       |
+---------------------------------------------------+
|  [Gear] Account Settings                          |
+---------------------------------------------------+
|  [LogOut] Sign Out                                |
+---------------------------------------------------+
```

---

## 3. Component Hierarchy & Module Boundaries

```
src/
├── layouts/
│   ├── AppLayout.tsx                         # Layout shell managing offsets, Topbar, Sidebar, Drawer, Outlet
│   ├── components/
│   │   ├── Sidebar.tsx                       # Desktop collapsible sidebar (expanded w-64 vs compact w-16)
│   │   ├── Topbar.tsx                        # Sticky topbar with search, toggles, and user avatar trigger
│   │   ├── UserNavDropdown.tsx               # Avatar dropdown popover (user info, tenant, theme, locale, logout)
│   │   ├── MobileNavDrawer.tsx               # Responsive slide-out drawer on viewports < md
│   │   └── __tests__/
│   │       ├── Sidebar.test.tsx
│   │       ├── Topbar.test.tsx
│   │       ├── UserNavDropdown.test.tsx
│   │       └── MobileNavDrawer.test.tsx
│   └── __tests__/
│       └── AppLayout.test.tsx
├── pages/
│   ├── placeholder/
│   │   ├── PlaceholderPage.tsx               # Reusable coming-soon placeholder page
│   │   └── __tests__/
│   │       └── PlaceholderPage.test.tsx
│   └── ...
├── store/
│   └── slices/
│       ├── appSlice.ts                       # UI state (theme, locale, sidebarCollapsed, mobileNavOpen)
│       └── __tests__/
│           └── appSlice.test.ts
├── i18n/
│   └── locales/
│       ├── en/common.json
│       ├── es/common.json
│       ├── fr/common.json
│       └── ar/common.json
└── routes/
    └── index.tsx                             # Updated route hierarchy with new placeholder routes
```

---

## 4. Detailed Component Specifications

### 4.1. `src/store/slices/appSlice.ts`
- **State Interface**:
  ```typescript
  export interface AppState {
    theme: Theme;
    locale: Locale;
    sidebarCollapsed: boolean;
    mobileNavOpen: boolean;
  }
  ```
- **Initial State**:
  - `sidebarCollapsed`: `localStorage.getItem('tiny_threads_sidebar_collapsed') === 'true'`
  - `mobileNavOpen`: `false`
- **Reducers**:
  - `toggleSidebar(state)`: Inverts `state.sidebarCollapsed` and syncs with `localStorage`.
  - `setSidebarCollapsed(state, action: PayloadAction<boolean>)`: Sets explicit state and syncs with `localStorage`.
  - `toggleMobileNav(state)`: Inverts `state.mobileNavOpen`.
  - `setMobileNavOpen(state, action: PayloadAction<boolean>)`: Sets explicit state (transient, not persisted).

### 4.2. `src/layouts/AppLayout.tsx`
- Connects to Redux `useAppSelector` for `sidebarCollapsed` and `mobileNavOpen`.
- Dynamically applies content padding to the main container:
  - `pl-0` for mobile (`< md`)
  - `md:pl-64` when `!sidebarCollapsed`
  - `md:pl-16` when `sidebarCollapsed`
- Adds a `resize` listener or window media query handler to automatically dispatch `setMobileNavOpen(false)` when viewport expands `>= 768px`.
- Auto-closes mobile drawer on route navigation via `useLocation` hook.

### 4.3. `src/layouts/components/Sidebar.tsx`
- **Desktop fixed column**: `fixed left-0 top-0 h-screen border-r border-border bg-card z-40 hidden md:flex flex-col transition-all duration-300`.
- **Width**: `w-64` if expanded, `w-16` if collapsed.
- **Header**:
  - Avatar badge (`SM` or tenant initials) in `bg-primary/10 text-primary font-bold`.
  - Expanded: Displays tenant name (`tenant?.name || 'Tiny Threads'`) and "Active" status badge.
  - Collapsed: Centered avatar badge with hover tooltip showing tenant name.
- **Nav items (`NavLink`)**:
  - Items: `Overview` (`/`), `Orders` (`/orders`), `Products` (`/products`), `Categories` (`/categories`), `Customers` (`/customers`), `Analytics` (`/analytics`), `Settings` (`/settings`).
  - Active class: `bg-primary/10 text-primary font-semibold`.
  - Inactive class: `text-muted-foreground hover:bg-muted hover:text-foreground`.
  - Hover tooltips: When `sidebarCollapsed === true`, wrapped with floating tooltip showing item label.
- **Footer**:
  - `Support` link (`/support`) with `HelpCircle` icon.
  - `Sign Out` button with `LogOut` icon, red text on hover, executing `handleLogout()`.

### 4.4. `src/layouts/components/Topbar.tsx`
- **Sticky container**: `sticky top-0 z-30 h-16 w-full border-b border-border bg-card/80 backdrop-blur-md flex items-center justify-between px-4 md:px-6`.
- **Left Region**:
  - Mobile Hamburger Button (`md:hidden`): Dispatches `toggleMobileNav()`.
  - Desktop Sidebar Toggle Button (`hidden md:flex`): Dispatches `toggleSidebar()`.
  - Global Search Bar: `<Search className="h-4 w-4 text-muted-foreground" />` + `<Input placeholder={t('nav.searchPlaceholder')} />`.
- **Right Region**:
  - User Avatar dropdown trigger with user initials (e.g. `JD`) or profile image.

### 4.5. `src/layouts/components/UserNavDropdown.tsx`
- Interactive Popover / Dropdown menu.
- **Header**: User full name, email, role badge (`Admin`/`Owner`), tenant context badge (`tenant.name`).
- **Preferences**:
  - Embedded `ThemeSelector` (Light/Dark toggle).
  - Embedded `LocaleSelector` (Language switcher).
- **Links**:
  - `Account Settings` (`/settings`).
- **Actions**:
  - `Sign Out`: Destructive action executing `logoutApi()`, clearing Redux auth state, resetting base API state, and redirecting to `/login`.

### 4.6. `src/layouts/components/MobileNavDrawer.tsx`
- Viewport: `md:hidden`.
- Renders when `mobileNavOpen` is `true`.
- Backdrop: `fixed inset-0 bg-background/80 backdrop-blur-sm z-50`.
- Drawer Panel: `fixed inset-y-0 left-0 z-50 w-3/4 max-w-xs bg-card border-r border-border p-4 shadow-xl flex flex-col`.
- Header with Close button (`X`).
- Full navigation links list + footer actions.
- Auto-closes on click of any link or backdrop.

### 4.7. `src/pages/placeholder/PlaceholderPage.tsx`
- Presentational placeholder page for routes not yet built (`/categories`, `/customers`, `/analytics`, `/support`).
- Displays page title, description ("This module will be available in upcoming updates."), and a button to "Return to Dashboard".

---

## 5. Internationalization Strings (`src/i18n/locales/*/common.json`)

New translation keys across all 4 locales (`en`, `es`, `fr`, `ar`):
```json
{
  "nav": {
    "overview": "Overview",
    "orders": "Orders",
    "products": "Products",
    "categories": "Categories",
    "customers": "Customers",
    "analytics": "Analytics",
    "settings": "Settings",
    "support": "Support",
    "signOut": "Sign Out",
    "searchPlaceholder": "Search...",
    "collapseSidebar": "Collapse sidebar",
    "expandSidebar": "Expand sidebar",
    "toggleMobileMenu": "Toggle menu",
    "activeStatus": "Active",
    "theme": "Theme",
    "language": "Language",
    "accountSettings": "Account Settings",
    "placeholderTitle": "{{title}} Module",
    "placeholderDescription": "This section is currently under development.",
    "backToDashboard": "Back to Dashboard"
  }
}
```

---

## 6. Testing & Quality Assurance Plan

### 6.1. Unit & Redux Tests
- `src/store/slices/__tests__/appSlice.test.ts`:
  - Verify initial state reads `localStorage` for `sidebarCollapsed`.
  - Verify `toggleSidebar` inverts state and updates `localStorage`.
  - Verify `toggleMobileNav` and `setMobileNavOpen` correctly update `mobileNavOpen`.

### 6.2. Component Tests (Vitest + React Testing Library)
- `src/layouts/components/__tests__/Sidebar.test.tsx`:
  - Renders all navigation items in expanded state.
  - Collapses to compact mode when `sidebarCollapsed = true`.
  - Shows hover tooltips in compact mode.
  - Active route is highlighted according to the current path.
  - Clicking sign out triggers the logout callback.
- `src/layouts/components/__tests__/Topbar.test.tsx`:
  - Renders search input.
  - Clicking desktop toggle dispatches `toggleSidebar`.
  - Clicking mobile hamburger dispatches `toggleMobileNav`.
- `src/layouts/components/__tests__/UserNavDropdown.test.tsx`:
  - Displays user name, email, tenant badge, and role.
  - Allows toggling theme and selecting locale.
  - Clicking sign out triggers the logout handler.
- `src/layouts/components/__tests__/MobileNavDrawer.test.tsx`:
  - Renders navigation links when open.
  - Closes on backdrop click or close button click.
  - Closes automatically when a navigation link is clicked.
- `src/layouts/__tests__/AppLayout.test.tsx`:
  - Orchestrates Sidebar, Topbar, and `<Outlet />`.
  - Applies proper `pl-64`, `pl-16`, and `pl-0` dynamic classes.
  - Auto-closes mobile drawer on route navigation and viewport resize.

---

## 7. Acceptance Criteria

- [ ] Desktop sidebar supports smooth collapsing between `w-64` (expanded) and `w-16` (compact icon-only).
- [ ] Compact sidebar shows hover tooltips for all navigation items and footer actions.
- [ ] Collapse preference is persisted in `localStorage` across page reloads.
- [ ] Topbar features a global search bar, desktop toggle, mobile hamburger toggle, and User Avatar dropdown.
- [ ] User Avatar dropdown includes user details, tenant badge, theme switcher, language switcher, settings link, and sign-out.
- [ ] Mobile drawer operates smoothly on viewports `< md` with backdrop and auto-close.
- [ ] Routes for `/categories`, `/customers`, `/analytics`, and `/support` render clean placeholder pages.
- [ ] All user-facing text is internationalized across `en`, `es`, `fr`, and `ar`.
- [ ] All unit and integration tests pass with 100% assertions satisfied.
