# Admin Web Login Screen Design Spec

**Date**: 2026-08-09  
**Status**: Draft (Pending User Approval)  
**Target Application**: `apps/admin-web`

---

## 1. Overview & Objectives

Implement the Stitch "Login - Centered Form" design (`projects/8405893068564684815/screens/67de714357204e8ea07420c8586b3b9d`) as a modular, responsive React component in `apps/admin-web`.

### Key Requirements & Constraints
1. **Strict Presentational Component Isolation**: All UI components in `src/components/ui/` and `src/components/auth/` MUST BE 100% pure presentational components with ZERO Redux dependencies. They accept props and emit callback events (`onSubmit`, `isLoading`, `error`, etc.), enabling seamless isolated testing in Storybook and Jest.
2. **Centralized Redux Store**: All Redux slices, hooks, and store configurations reside strictly inside `src/store/` (`src/store/slices/authSlice.ts`, `src/store/index.ts`, `src/store/hooks.ts`).
3. **Smart Container Page**: `src/pages/LoginPage.tsx` acts as the container component that connects Redux state and dispatches actions to the pure presentation components.
4. **Stitch Visual Fidelity**: Replicate the exact typography (Plus Jakarta Sans, Inter), responsive spacing, input controls, brand logo badge, error alert state, and dark/light mode compatibility.

---

## 2. File & Component Architecture

```
apps/admin-web/src/
├── store/
│   ├── index.ts                      # Combined Redux store (app + auth reducers)
│   ├── hooks.ts                      # Typed hooks (useAppDispatch, useAppSelector)
│   └── slices/
│       ├── appSlice.ts               # Existing app configuration slice
│       └── authSlice.ts              # [NEW] Auth state slice (user, token, status, error)
├── components/
│   ├── ui/                           # Reusable low-level primitives (Pure Presentational)
│   │   ├── button.tsx                # Existing shadcn button
│   │   ├── card.tsx                  # Existing shadcn card
│   │   ├── badge.tsx                 # Existing shadcn badge
│   │   ├── input.tsx                 # [NEW] Primitive Input component
│   │   ├── label.tsx                 # [NEW] Primitive Label component
│   │   └── checkbox.tsx              # [NEW] Primitive Checkbox component
│   └── auth/                         # Auth-specific UI components (Pure Presentational - Storybook ready)
│       ├── AuthCard.tsx              # Outer centered container & theme wrapper
│       ├── AuthHeader.tsx            # Brand icon, Merchant Precision title & subtitle
│       ├── LoginForm.tsx             # Interactive form (email, password, rememberMe, submit, error alert)
│       └── DemoLoginHelper.tsx       # Quick fill / demo login developer helper
├── pages/
│   └── LoginPage.tsx                 # [NEW] Smart Container Page (connects Redux to pure auth components)
└── App.tsx                           # Auth-guarded main application shell
```

---

## 3. Detailed Component Contracts

### 3.1 Pure Presentational Components (`src/components/auth/`)

All components in this directory MUST NOT import `@reduxjs/toolkit`, `react-redux`, or any files from `src/store/`.

#### `AuthCard.tsx`
- **Props**: `children: React.ReactNode; className?: string`
- **Responsibility**: Centered layout wrapper (`min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4 md:p-8`), max-width container (`max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-sm`).

#### `AuthHeader.tsx`
- **Props**: `title?: string; subtitle?: string; logo?: React.ReactNode`
- **Responsibility**: Displays brand badge icon (`Store` icon in indigo badge), header title ("Merchant Precision"), and subtitle text ("Welcome back! Please enter your details.").

#### `LoginForm.tsx`
- **Props**:
  ```ts
  export interface LoginFormProps {
    onSubmit: (values: { email: string; password: string; rememberMe: boolean }) => void;
    isLoading?: boolean;
    error?: string | null;
    initialEmail?: string;
    onForgotPassword?: () => void;
  }
  ```
- **Responsibility**: Manages local form state (`email`, `password`, `rememberMe`). Handles input validation, displays inline error alert banner if `error` is passed, shows loading spinner on submit button when `isLoading` is true, and calls `onSubmit` callback.

#### `DemoLoginHelper.tsx`
- **Props**:
  ```ts
  export interface DemoLoginHelperProps {
    onSelectDemoUser: (credentials: { email: string; password: string }) => void;
  }
  ```
- **Responsibility**: Developer assistance banner allowing 1-click populating/submitting of demo merchant credentials.

---

### 3.2 Redux Store Slice (`src/store/slices/authSlice.ts`)

- **State Interface**:
  ```ts
  export interface User {
    id: string;
    email: string;
    name: string;
    role: string;
  }

  export interface AuthState {
    user: User | null;
    tenantId: string | null;
    token: string | null;
    isAuthenticated: boolean;
    status: 'idle' | 'loading' | 'succeeded' | 'failed';
    error: string | null;
  }
  ```
- **Reducers**:
  - `loginStart(state)`: Sets `status = 'loading'`, `error = null`.
  - `loginSuccess(state, action: PayloadAction<{ user: User; tenantId: string; token: string }>)`: Sets `user`, `tenantId`, `token`, `isAuthenticated = true`, `status = 'succeeded'`, `error = null`.
  - `loginFailure(state, action: PayloadAction<string>)`: Sets `status = 'failed'`, `error = action.payload`.
  - `logout(state)`: Resets state to initial unauthenticated state.
  - `clearError(state)`: Resets `error = null`.

---

### 3.3 Smart Container Page (`src/pages/LoginPage.tsx`)

- **Imports**: `useAppDispatch`, `useAppSelector` from `../store/hooks`, `selectAuth`, `loginStart`, `loginSuccess`, `loginFailure` from `../store/slices/authSlice`.
- **Logic**:
  - Maps `state.auth` to props for `LoginForm`.
  - Handles `handleSubmit`: dispatches `loginStart`, simulates API authentication check (or validates against standard merchant credentials), and dispatches `loginSuccess` or `loginFailure`.
  - Passes callbacks down to pure presentational components.

---

### 3.4 Main App Integration (`src/App.tsx`)

- Selects `isAuthenticated` and `user` from Redux `auth` slice.
- If `!isAuthenticated`: renders `<LoginPage />`.
- If `isAuthenticated`: renders the Merchant Administration Shell with store overview, active tenant badge, theme switcher, and Logout button.

---

## 4. Testing & Verification Plan

1. **Unit / Storybook Readiness Test**: Verify that all components in `src/components/ui/` and `src/components/auth/` have zero imports from `store/` or `redux`.
2. **Build Verification**: Run `pnpm --filter @tiny-threads/admin-web build` (or root `pnpm build`) to ensure zero TypeScript or ESLint errors.
3. **Interactive Verification**:
   - Launch Vite dev server (`pnpm dev:admin-web`).
   - Verify centered layout, responsive design, input focus states, error handling, quick demo login button, and successful transition to the dashboard upon sign in.
