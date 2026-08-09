# Admin Web Login Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Stitch "Login - Centered Form" design into `apps/admin-web` with zero-Redux pure presentational components in `src/components/`, Redux auth state in `src/store/`, and container page orchestration in `src/pages/`.

**Architecture:** A container/presentational architecture where `src/components/ui/` primitives and `src/components/auth/` domain components are 100% pure UI components with zero Redux imports (Storybook ready). Redux Toolkit state (`authSlice.ts`) and store configuration live strictly in `src/store/`. The container component `src/pages/LoginPage.tsx` connects Redux hooks to pure presentation components.

**Tech Stack:** React 19, Vite, TypeScript, Redux Toolkit (`@reduxjs/toolkit`, `react-redux`), Tailwind CSS v4, Lucide React icons, `@tiny-threads/shared`.

## Global Constraints

- All UI components inside `src/components/` MUST NOT import `@reduxjs/toolkit`, `react-redux`, or anything from `src/store/`.
- All Redux slices (`authSlice.ts`), hooks (`hooks.ts`), and store configuration (`index.ts`) MUST reside inside `src/store/`.
- Container pages MUST reside in `src/pages/`.
- Styling MUST use Tailwind CSS v4 classes without inline hardcoded styles.

---

### Task 1: Primitive UI Form Components

**Files:**
- Create: `apps/admin-web/src/components/ui/input.tsx`
- Create: `apps/admin-web/src/components/ui/label.tsx`
- Create: `apps/admin-web/src/components/ui/checkbox.tsx`

**Interfaces:**
- Consumes: Standard React HTML input/label/checkbox attributes.
- Produces: `<Input />`, `<Label />`, `<Checkbox />` pure primitives.

- [ ] **Step 1: Create Input primitive component**

```tsx
// apps/admin-web/src/components/ui/input.tsx
import * as React from 'react';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', error, type = 'text', ...props }, ref) => {
    return (
      <input
        type={type}
        className={`flex h-10 w-full rounded-lg border bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 transition-colors ${
          error
            ? 'border-red-500 focus:ring-red-500'
            : 'border-slate-200 dark:border-slate-800'
        } ${className}`}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';
```

- [ ] **Step 2: Create Label primitive component**

```tsx
// apps/admin-web/src/components/ui/label.tsx
import * as React from 'react';

export interface LabelProps
  extends React.LabelHTMLAttributes<HTMLLabelElement> {}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className = '', children, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={`text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400 select-none ${className}`}
        {...props}
      >
        {children}
      </label>
    );
  }
);
Label.displayName = 'Label';
```

- [ ] **Step 3: Create Checkbox primitive component**

```tsx
// apps/admin-web/src/components/ui/checkbox.tsx
import * as React from 'react';

export interface CheckboxProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className = '', label, id, ...props }, ref) => {
    return (
      <div className="flex items-center gap-2 select-none">
        <input
          type="checkbox"
          id={id}
          ref={ref}
          className={`h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 dark:bg-slate-900 dark:checked:bg-indigo-600 ${className}`}
          {...props}
        />
        {label && (
          <label
            htmlFor={id}
            className="text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
          >
            {label}
          </label>
        )}
      </div>
    );
  }
);
Checkbox.displayName = 'Checkbox';
```

- [ ] **Step 4: Commit UI Primitives**

```bash
git add apps/admin-web/src/components/ui/
git commit -m "feat(admin-web): add Input, Label, and Checkbox UI primitives"
```

---

### Task 2: Pure Auth Presentation Components (Storybook Ready)

**Files:**
- Create: `apps/admin-web/src/components/auth/AuthCard.tsx`
- Create: `apps/admin-web/src/components/auth/AuthHeader.tsx`
- Create: `apps/admin-web/src/components/auth/LoginForm.tsx`
- Create: `apps/admin-web/src/components/auth/DemoLoginHelper.tsx`

**Interfaces:**
- Consumes: UI primitives from `src/components/ui/`, Lucide React icons (`Store`, `Lock`, `Mail`, `AlertCircle`, `Loader2`). Zero Redux imports.
- Produces: Pure presentation components for auth layout, header, form, and demo helper.

- [ ] **Step 1: Create AuthCard component**

```tsx
// apps/admin-web/src/components/auth/AuthCard.tsx
import * as React from 'react';

export interface AuthCardProps {
  children: React.ReactNode;
  className?: string;
}

export function AuthCard({ children, className = '' }: AuthCardProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4 md:p-8 font-sans">
      <div
        className={`w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 md:p-8 shadow-sm ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create AuthHeader component**

```tsx
// apps/admin-web/src/components/auth/AuthHeader.tsx
import { Store } from 'lucide-react';

export interface AuthHeaderProps {
  title?: string;
  subtitle?: string;
}

export function AuthHeader({
  title = 'Merchant Precision',
  subtitle = 'Welcome back! Please enter your merchant credentials to access your dashboard.',
}: AuthHeaderProps) {
  return (
    <div className="text-center mb-8">
      <div className="flex justify-center mb-4">
        <div className="h-12 w-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-sm">
          <Store className="h-6 w-6" />
        </div>
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-sans">
        {title}
      </h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-xs mx-auto">
        {subtitle}
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Create LoginForm component**

```tsx
// apps/admin-web/src/components/auth/LoginForm.tsx
import * as React from 'react';
import { Mail, Lock, AlertCircle, Loader2 } from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { Button } from '../ui/button';

export interface LoginFormProps {
  onSubmit: (values: { email: string; password: string; rememberMe: boolean }) => void;
  isLoading?: boolean;
  error?: string | null;
  initialEmail?: string;
  onForgotPassword?: () => void;
}

export function LoginForm({
  onSubmit,
  isLoading = false,
  error = null,
  initialEmail = '',
  onForgotPassword,
}: LoginFormProps) {
  const [email, setEmail] = React.useState(initialEmail);
  const [password, setPassword] = React.useState('');
  const [rememberMe, setRememberMe] = React.useState(false);
  const [validationError, setValidationError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (initialEmail) setEmail(initialEmail);
  }, [initialEmail]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setValidationError('Please enter your email address.');
      return;
    }
    if (!password) {
      setValidationError('Please enter your password.');
      return;
    }
    setValidationError(null);
    onSubmit({ email: email.trim(), password, rememberMe });
  };

  const displayedError = validationError || error;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {displayedError && (
        <div className="p-3.5 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm flex items-start gap-2.5">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <span>{displayedError}</span>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">Email Address</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
          <Input
            id="email"
            type="email"
            placeholder="merchant@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="pl-10"
            disabled={isLoading}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="pl-10"
            disabled={isLoading}
            required
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <Checkbox
          id="remember-me"
          label="Remember me"
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
          disabled={isLoading}
        />
        <button
          type="button"
          onClick={onForgotPassword}
          className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline focus:outline-none"
        >
          Forgot password?
        </button>
      </div>

      <Button
        type="submit"
        disabled={isLoading}
        className="w-full h-11 text-base font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Signing in...</span>
          </span>
        ) : (
          'Sign in to Dashboard'
        )}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Create DemoLoginHelper component**

```tsx
// apps/admin-web/src/components/auth/DemoLoginHelper.tsx
import { ShieldCheck } from 'lucide-react';
import { Button } from '../ui/button';

export interface DemoLoginHelperProps {
  onSelectDemoUser: (credentials: { email: string; password: string }) => void;
}

export function DemoLoginHelper({ onSelectDemoUser }: DemoLoginHelperProps) {
  return (
    <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 text-center">
      <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
        <ShieldCheck className="h-4 w-4 text-emerald-500" />
        <span>Development Demo Mode</span>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          onSelectDemoUser({
            email: 'admin@acmeapparel.com',
            password: 'Password123!',
          })
        }
        className="w-full text-xs text-slate-600 dark:text-slate-300"
      >
        Use Demo Merchant Credentials
      </Button>
    </div>
  );
}
```

- [ ] **Step 5: Commit Auth UI Components**

```bash
git add apps/admin-web/src/components/auth/
git commit -m "feat(admin-web): add pure presentational auth UI components (AuthCard, AuthHeader, LoginForm, DemoLoginHelper)"
```

---

### Task 3: Centralized Redux Auth Slice & Store

**Files:**
- Create: `apps/admin-web/src/store/slices/authSlice.ts`
- Modify: `apps/admin-web/src/store/index.ts`

**Interfaces:**
- Consumes: Redux Toolkit `createSlice`, `PayloadAction`.
- Produces: `authReducer`, `loginStart`, `loginSuccess`, `loginFailure`, `logout`, `clearError`, `selectAuth`.

- [ ] **Step 1: Create authSlice.ts**

```ts
// apps/admin-web/src/store/slices/authSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../index';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface AuthState {
  user: AuthUser | null;
  tenantId: string | null;
  token: string | null;
  isAuthenticated: boolean;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  tenantId: null,
  token: null,
  isAuthenticated: false,
  status: 'idle',
  error: null,
};

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    loginStart: (state) => {
      state.status = 'loading';
      state.error = null;
    },
    loginSuccess: (
      state,
      action: PayloadAction<{
        user: AuthUser;
        tenantId: string;
        token: string;
      }>
    ) => {
      state.status = 'succeeded';
      state.user = action.payload.user;
      state.tenantId = action.payload.tenantId;
      state.token = action.payload.token;
      state.isAuthenticated = true;
      state.error = null;
    },
    loginFailure: (state, action: PayloadAction<string>) => {
      state.status = 'failed';
      state.error = action.payload;
    },
    logout: (state) => {
      state.user = null;
      state.tenantId = null;
      state.token = null;
      state.isAuthenticated = false;
      state.status = 'idle';
      state.error = null;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
});

export const { loginStart, loginSuccess, loginFailure, logout, clearError } =
  authSlice.actions;

export const selectAuth = (state: RootState) => state.auth;

export default authSlice.reducer;
```

- [ ] **Step 2: Update store/index.ts to include authReducer**

```ts
// apps/admin-web/src/store/index.ts
import { configureStore } from '@reduxjs/toolkit';
import appReducer from './slices/appSlice';
import authReducer from './slices/authSlice';

export const store = configureStore({
  reducer: {
    app: appReducer,
    auth: authReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

- [ ] **Step 3: Commit Redux Store Changes**

```bash
git add apps/admin-web/src/store/
git commit -m "feat(admin-web): add authSlice and register authReducer in Redux store"
```

---

### Task 4: Container Page & App Integration

**Files:**
- Create: `apps/admin-web/src/pages/LoginPage.tsx`
- Modify: `apps/admin-web/src/App.tsx`

**Interfaces:**
- Consumes: Redux hooks from `src/store/hooks.ts`, auth actions from `src/store/slices/authSlice.ts`, auth UI components from `src/components/auth/`.
- Produces: `<LoginPage />` smart container page & auth-guarded `<App />`.

- [ ] **Step 1: Create LoginPage container component**

```tsx
// apps/admin-web/src/pages/LoginPage.tsx
import * as React from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import {
  selectAuth,
  loginStart,
  loginSuccess,
  loginFailure,
} from '../store/slices/authSlice';
import { setTenant } from '../store/slices/appSlice';
import { AuthCard } from '../components/auth/AuthCard';
import { AuthHeader } from '../components/auth/AuthHeader';
import { LoginForm } from '../components/auth/LoginForm';
import { DemoLoginHelper } from '../components/auth/DemoLoginHelper';

export function LoginPage() {
  const dispatch = useAppDispatch();
  const { status, error } = useAppSelector(selectAuth);
  const [initialEmail, setInitialEmail] = React.useState('');

  const handleLogin = async (values: {
    email: string;
    password: string;
    rememberMe: boolean;
  }) => {
    dispatch(loginStart());
    try {
      // Simulate auth delay & validation
      await new Promise((resolve) => setTimeout(resolve, 800));

      if (values.password === 'wrong') {
        dispatch(loginFailure('Invalid merchant credentials. Please try again.'));
        return;
      }

      const tenantId = 'tenant_acme_123';
      const tenantName = 'Acme Apparel';
      const user = {
        id: 'usr_merchant_01',
        email: values.email,
        name: 'Merchant Admin',
        role: 'STORE_ADMIN',
      };

      dispatch(
        loginSuccess({
          user,
          tenantId,
          token: 'mock_jwt_token_xyz',
        })
      );
      dispatch(setTenant({ id: tenantId, name: tenantName }));
    } catch {
      dispatch(loginFailure('An unexpected authentication error occurred.'));
    }
  };

  const handleSelectDemoUser = (credentials: {
    email: string;
    password: string;
  }) => {
    setInitialEmail(credentials.email);
    handleLogin({
      email: credentials.email,
      password: credentials.password,
      rememberMe: true,
    });
  };

  return (
    <AuthCard>
      <AuthHeader />
      <LoginForm
        onSubmit={handleLogin}
        isLoading={status === 'loading'}
        error={error}
        initialEmail={initialEmail}
        onForgotPassword={() => alert('Password reset functionality requested.')}
      />
      <DemoLoginHelper onSelectDemoUser={handleSelectDemoUser} />
    </AuthCard>
  );
}
```

- [ ] **Step 2: Update App.tsx to handle authenticated vs unauthenticated state**

```tsx
// apps/admin-web/src/App.tsx
import { useAppDispatch, useAppSelector } from './store/hooks';
import { selectApp, toggleTheme } from './store/slices/appSlice';
import { selectAuth, logout } from './store/slices/authSlice';
import { LoginPage } from './pages/LoginPage';
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
import { ShieldAlert, Store, Moon, Sun, Layers, LogOut, User as UserIcon } from 'lucide-react';

export default function App() {
  const dispatch = useAppDispatch();
  const { tenantId, tenantName, theme } = useAppSelector(selectApp);
  const { isAuthenticated, user } = useAppSelector(selectAuth);

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div
      className={`min-h-screen ${theme === 'dark' ? 'dark bg-slate-950 text-slate-50' : 'bg-slate-50 text-slate-900'} transition-colors duration-200`}
    >
      <div className="container mx-auto max-w-4xl p-8">
        <header className="flex items-center justify-between pb-8 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <Store className="h-8 w-8 text-indigo-500" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {tenantName}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
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
            <Button
              variant="outline"
              size="icon"
              onClick={() => dispatch(toggleTheme())}
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => dispatch(logout())}
              className="gap-2 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-950/50"
            >
              <LogOut className="h-4 w-4" />
              <span>Log out</span>
            </Button>
          </div>
        </header>

        <main className="py-8 space-y-6">
          <Card className="border-slate-200 dark:border-slate-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-indigo-500" />
                <span>Authenticated Merchant Session</span>
              </CardTitle>
              <CardDescription>
                React 19 + Redux Toolkit + Tailwind CSS v4 + Stitch Login Flow Verified
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-xs font-semibold uppercase text-slate-500 flex items-center gap-1.5 mb-1">
                    <UserIcon className="h-3.5 w-3.5" /> Logged In User
                  </span>
                  <p className="text-base font-medium">{user?.name} ({user?.email})</p>
                  <p className="text-xs text-slate-500 mt-0.5">Role: {user?.role}</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-xs font-semibold uppercase text-slate-500">
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
              <Button onClick={() => dispatch(logout())}>
                Sign Out
              </Button>
              <Button
                variant="secondary"
                onClick={() => dispatch(toggleTheme())}
              >
                Toggle Theme ({theme})
              </Button>
            </CardFooter>
          </Card>
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit Container Page and App Integration**

```bash
git add apps/admin-web/src/pages/ apps/admin-web/src/App.tsx
git commit -m "feat(admin-web): integrate LoginPage container page and auth-guarded App shell"
```

---

### Task 5: Build & Quality Verification

**Files:**
- Modify: N/A

**Interfaces:**
- Consumes: Workspace build & lint tools.
- Produces: Passing build and lint checks.

- [ ] **Step 1: Run TypeScript & Vite build check**

Run: `pnpm --filter @tiny-threads/admin-web build`
Expected: Successful build output with 0 errors.

- [ ] **Step 2: Run ESLint code quality check**

Run: `pnpm --filter @tiny-threads/admin-web lint`
Expected: 0 lint errors across `apps/admin-web`.
