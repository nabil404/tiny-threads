# React Hook Form and Zod Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize form handling in `apps/admin-web` by adding `react-hook-form`, `zod`, and `@hookform/resolvers`, creating accessible shadcn/ui Form primitives, and refactoring `LoginForm` with Zod validation.

**Architecture:** We use `react-hook-form` and `@hookform/resolvers/zod` with shadcn/ui Form UI primitives built on top of Radix UI `@radix-ui/react-slot`. Validation schemas are defined modularly per feature (e.g. `src/features/auth/schemas/login.schema.ts`) and produce inferred TypeScript types.

**Tech Stack:** React 19, TypeScript, `react-hook-form`, `zod`, `@hookform/resolvers`, `@radix-ui/react-slot`, Vitest, Testing Library.

## Global Constraints

- Must follow React 19 and Vite conventions in `apps/admin-web`.
- UI components in `src/components/ui/` must remain pure presentational components with zero Redux dependencies.
- All form inputs, labels, and error messages must be properly associated via ARIA attributes (`aria-describedby`, `aria-invalid`, `htmlFor`, `id`).
- All tests must pass with `pnpm --filter @tiny-threads/admin-web test`.
- ESLint and Prettier checks must pass without warnings or errors.

---

### Task 1: Install Form & Validation Dependencies

**Files:**
- Modify: `apps/admin-web/package.json`

**Interfaces:**
- Produces: `react-hook-form`, `zod`, `@hookform/resolvers` installed in `apps/admin-web`.

- [ ] **Step 1: Install packages via pnpm**

Run: `pnpm --filter @tiny-threads/admin-web add react-hook-form zod @hookform/resolvers`
Expected: Packages added to `dependencies` in `apps/admin-web/package.json` and `pnpm-lock.yaml` updated.

- [ ] **Step 2: Verify package installation**

Run: `pnpm --filter @tiny-threads/admin-web build`
Expected: Build passes without dependency resolution errors.

- [ ] **Step 3: Commit**

```bash
git add apps/admin-web/package.json pnpm-lock.yaml
git commit -m "feat(admin-web): install react-hook-form, zod, and @hookform/resolvers"
```

---

### Task 2: Implement shadcn/ui Form Primitives

**Files:**
- Create: `apps/admin-web/src/components/ui/form.tsx`
- Test: `apps/admin-web/src/components/ui/__tests__/form.test.tsx`

**Interfaces:**
- Produces:
  - `Form` (FormProvider alias)
  - `FormField` (typed Controller wrapper)
  - `FormItem` (context provider for unique field IDs)
  - `FormLabel` (accessible label linked to field ID)
  - `FormControl` (Radix Slot injecting ARIA attributes and IDs)
  - `FormDescription` (accessible helper text linked to field ID)
  - `FormMessage` (accessible error message linked to field ID)
  - `useFormField` (hook accessing field state and generated IDs)

- [ ] **Step 1: Write failing unit test for Form primitives**

Create `apps/admin-web/src/components/ui/__tests__/form.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from '../form';
import { Input } from '../input';

function TestForm({ defaultError = false }: { defaultError?: boolean }) {
  const form = useForm({
    defaultValues: { username: '' },
    errors: defaultError
      ? ({ username: { type: 'manual', message: 'Username is required' } } as any)
      : undefined,
  });

  return (
    <Form {...form}>
      <form>
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input placeholder="Enter username" {...field} />
              </FormControl>
              <FormDescription>Your unique username.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}

describe('Form UI Primitives', () => {
  it('renders label, input, description, and links IDs correctly', () => {
    render(<TestForm />);

    const label = screen.getByText('Username');
    const input = screen.getByPlaceholderText('Enter username');
    const description = screen.getByText('Your unique username.');

    expect(label).toHaveAttribute('for', input.getAttribute('id'));
    expect(input).toHaveAttribute('aria-describedby', description.getAttribute('id'));
    expect(input).toHaveAttribute('aria-invalid', 'false');
  });

  it('renders error message and updates aria-invalid when field has error', () => {
    render(<TestForm defaultError />);

    const input = screen.getByPlaceholderText('Enter username');
    const errorMessage = screen.getByText('Username is required');

    expect(errorMessage).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toContain(errorMessage.getAttribute('id'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/admin-web test src/components/ui/__tests__/form.test.tsx`
Expected: FAIL with module `../form` not found.

- [ ] **Step 3: Implement `apps/admin-web/src/components/ui/form.tsx`**

```tsx
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import {
  Controller,
  ControllerProps,
  FieldPath,
  FieldValues,
  FormProvider,
  useFormContext,
  useFormState,
} from 'react-hook-form';
import { Label } from '@components/ui/label';

const Form = FormProvider;

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName;
};

const FormFieldContext = React.createContext<FormFieldContextValue>(
  {} as FormFieldContextValue,
);

const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
};

const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext = React.useContext(FormItemContext);
  const { getFieldState } = useFormContext();
  const formState = useFormState({ name: fieldContext.name });

  if (!fieldContext) {
    throw new Error('useFormField should be used within <FormField>');
  }

  const fieldState = getFieldState(fieldContext.name, formState);
  const { id } = itemContext;

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
};

type FormItemContextValue = {
  id: string;
};

const FormItemContext = React.createContext<FormItemContextValue>(
  {} as FormItemContextValue,
);

const FormItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className = '', ...props }, ref) => {
  const id = React.useId();

  return (
    <FormItemContext.Provider value={{ id }}>
      <div ref={ref} className={`space-y-2 ${className}`} {...props} />
    </FormItemContext.Provider>
  );
});
FormItem.displayName = 'FormItem';

const FormLabel = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className = '', ...props }, ref) => {
  const { error, formItemId } = useFormField();

  return (
    <Label
      ref={ref}
      className={`${error ? 'text-destructive' : ''} ${className}`}
      htmlFor={formItemId}
      {...props}
    />
  );
});
FormLabel.displayName = 'FormLabel';

const FormControl = React.forwardRef<
  React.ComponentRef<typeof Slot>,
  React.ComponentPropsWithoutRef<typeof Slot>
>(({ ...props }, ref) => {
  const { error, formItemId, formDescriptionId, formMessageId } =
    useFormField();

  return (
    <Slot
      ref={ref}
      id={formItemId}
      aria-describedby={
        !error
          ? `${formDescriptionId}`
          : `${formDescriptionId} ${formMessageId}`
      }
      aria-invalid={!!error}
      {...props}
    />
  );
});
FormControl.displayName = 'FormControl';

const FormDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className = '', ...props }, ref) => {
  const { formDescriptionId } = useFormField();

  return (
    <p
      ref={ref}
      id={formDescriptionId}
      className={`text-xs text-muted-foreground ${className}`}
      {...props}
    />
  );
});
FormDescription.displayName = 'FormDescription';

const FormMessage = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className = '', children, ...props }, ref) => {
  const { error, formMessageId } = useFormField();
  const body = error ? String(error?.message ?? '') : children;

  if (!body) {
    return null;
  }

  return (
    <p
      ref={ref}
      id={formMessageId}
      className={`text-xs font-medium text-destructive ${className}`}
      {...props}
    >
      {body}
    </p>
  );
});
FormMessage.displayName = 'FormMessage';

export {
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/admin-web test src/components/ui/__tests__/form.test.tsx`
Expected: PASS with 2 tests passing.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/src/components/ui/form.tsx apps/admin-web/src/components/ui/__tests__/form.test.tsx
git commit -m "feat(admin-web): add shadcn form primitives and unit tests"
```

---

### Task 3: Create Auth Zod Validation Schema

**Files:**
- Create: `apps/admin-web/src/features/auth/schemas/login.schema.ts`
- Create: `apps/admin-web/src/features/auth/schemas/index.ts`
- Test: `apps/admin-web/src/features/auth/schemas/__tests__/login.schema.test.ts`

**Interfaces:**
- Produces: `loginSchema`, `LoginFormData` type.

- [ ] **Step 1: Write unit test for login validation schema**

Create `apps/admin-web/src/features/auth/schemas/__tests__/login.schema.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { loginSchema } from '../login.schema';

describe('loginSchema', () => {
  it('validates correct email and password', () => {
    const result = loginSchema.safeParse({
      email: 'admin@merchant.com',
      password: 'password123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty email', () => {
    const result = loginSchema.safeParse({
      email: '',
      password: 'password123',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Email is required');
    }
  });

  it('rejects invalid email format', () => {
    const result = loginSchema.safeParse({
      email: 'not-an-email',
      password: 'password123',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        'Please enter a valid email address',
      );
    }
  });

  it('rejects empty password', () => {
    const result = loginSchema.safeParse({
      email: 'admin@merchant.com',
      password: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Password is required');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @tiny-threads/admin-web test src/features/auth/schemas/__tests__/login.schema.test.ts`
Expected: FAIL with `login.schema` not found.

- [ ] **Step 3: Implement `login.schema.ts` and `index.ts`**

Create `apps/admin-web/src/features/auth/schemas/login.schema.ts`:
```ts
import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, { message: 'Email is required' })
    .email({ message: 'Please enter a valid email address' }),
  password: z.string().min(1, { message: 'Password is required' }),
});

export type LoginFormData = z.infer<typeof loginSchema>;
```

Create `apps/admin-web/src/features/auth/schemas/index.ts`:
```ts
export * from './login.schema';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @tiny-threads/admin-web test src/features/auth/schemas/__tests__/login.schema.test.ts`
Expected: PASS with 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add apps/admin-web/src/features/auth/schemas/
git commit -m "feat(admin-web): add auth login zod schema and unit tests"
```

---

### Task 4: Refactor `LoginForm` to use React Hook Form and Zod

**Files:**
- Modify: `apps/admin-web/src/features/auth/components/LoginForm.tsx`
- Modify: `apps/admin-web/src/features/auth/components/__tests__/LoginForm.test.tsx`

**Interfaces:**
- Consumes: `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage` from `@components/ui/form`, `loginSchema`, `LoginFormData` from `@features/auth/schemas`.
- Produces: Refactored `LoginForm` component.

- [ ] **Step 1: Update `LoginForm.test.tsx` with validation and submission assertions**

Update `apps/admin-web/src/features/auth/components/__tests__/LoginForm.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { store } from '@store/index';
import { LoginForm } from '../LoginForm';
import * as authApiHooks from '@store/api/endpoints/authApi';

describe('LoginForm', () => {
  it('renders email and password inputs and sign-in button', () => {
    render(
      <Provider store={store}>
        <LoginForm />
      </Provider>,
    );

    expect(
      screen.getByPlaceholderText(/admin@merchant\.com/i),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/password/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /sign in/i }),
    ).toBeInTheDocument();
  });

  it('displays client-side validation errors for invalid input and does not submit', async () => {
    const mockUnwrapLogin = vi.fn();
    const mockLoginMutation = vi
      .fn()
      .mockReturnValue({ unwrap: mockUnwrapLogin });
    vi.spyOn(authApiHooks, 'useLoginMutation').mockReturnValue([
      mockLoginMutation as any,
      { isLoading: false } as any,
    ]);

    const user = userEvent.setup();

    render(
      <Provider store={store}>
        <LoginForm />
      </Provider>,
    );

    await user.type(
      screen.getByPlaceholderText(/admin@merchant\.com/i),
      'invalid-email',
    );
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(
        screen.getByText('Please enter a valid email address'),
      ).toBeInTheDocument();
      expect(screen.getByText('Password is required')).toBeInTheDocument();
    });

    expect(mockLoginMutation).not.toHaveBeenCalled();
  });

  it('handles valid login form submission and calls onSuccess', async () => {
    const mockUnwrapLogin = vi
      .fn()
      .mockResolvedValue({ accessToken: 'mock-token' });
    const mockLoginMutation = vi
      .fn()
      .mockReturnValue({ unwrap: mockUnwrapLogin });
    vi.spyOn(authApiHooks, 'useLoginMutation').mockReturnValue([
      mockLoginMutation as any,
      { isLoading: false } as any,
    ]);

    const onSuccess = vi.fn();
    const user = userEvent.setup();

    render(
      <Provider store={store}>
        <LoginForm onSuccess={onSuccess} />
      </Provider>,
    );

    await user.type(
      screen.getByPlaceholderText(/admin@merchant\.com/i),
      'admin@test.com',
    );
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLoginMutation).toHaveBeenCalledWith({
        email: 'admin@test.com',
        password: 'password123',
      });
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('displays error message when login API fails', async () => {
    const mockUnwrapLogin = vi.fn().mockRejectedValue({
      data: {
        error: {
          code: 'AUTH_INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      },
    });
    const mockLoginMutation = vi
      .fn()
      .mockReturnValue({ unwrap: mockUnwrapLogin });
    vi.spyOn(authApiHooks, 'useLoginMutation').mockReturnValue([
      mockLoginMutation as any,
      { isLoading: false } as any,
    ]);

    const user = userEvent.setup();

    render(
      <Provider store={store}>
        <LoginForm />
      </Provider>,
    );

    await user.type(
      screen.getByPlaceholderText(/admin@merchant\.com/i),
      'admin@test.com',
    );
    await user.type(screen.getByLabelText(/password/i), 'wrongpassword');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid email or password')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Refactor `apps/admin-web/src/features/auth/components/LoginForm.tsx`**

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLoginMutation } from '@store/api/endpoints/authApi';
import { extractErrorMessage } from '@lib/extract-error-message';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@components/ui/form';
import { Input } from '@components/ui/input';
import { Button } from '@components/ui/button';
import { ArrowRight, Lock, User, AlertCircle } from 'lucide-react';
import { loginSchema, LoginFormData } from '../schemas';

export interface LoginFormProps {
  initialEmail?: string;
  onSuccess?: () => void;
}

export function LoginForm({ initialEmail = '', onSuccess }: LoginFormProps) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);

  const [loginMutation, { isLoading }] = useLoginMutation();

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: initialEmail,
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setError(null);

    try {
      await loginMutation(data).unwrap();
      onSuccess?.();
    } catch (err: unknown) {
      setError(extractErrorMessage(err, t('auth.genericError')));
    }
  };

  return (
    <div className="w-full">
      {error && (
        <div className="mb-6 p-3.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel className="text-xs font-medium">
                  {t('auth.emailLabel')}
                </FormLabel>
                <div className="relative">
                  <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <FormControl>
                    <Input
                      type="email"
                      placeholder={t('auth.emailPlaceholder')}
                      className="pl-9"
                      {...field}
                    />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <div className="flex items-center justify-between">
                  <FormLabel className="text-xs font-medium mb-0">
                    {t('auth.passwordLabel')}
                  </FormLabel>
                  <span className="text-xs text-primary hover:underline cursor-pointer">
                    {t('auth.forgotPassword')}
                  </span>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <FormControl>
                    <Input
                      type="password"
                      className="pl-9"
                      {...field}
                    />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="w-full mt-2 cursor-pointer"
            disabled={isLoading}
          >
            {isLoading ? (
              t('auth.authenticating')
            ) : (
              <span className="flex items-center justify-center gap-2">
                {t('auth.signIn')} <ArrowRight className="h-4 w-4" />
              </span>
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
}
```

- [ ] **Step 3: Run tests to verify all tests pass**

Run: `pnpm --filter @tiny-threads/admin-web test`
Expected: All test suites pass.

- [ ] **Step 4: Commit**

```bash
git add apps/admin-web/src/features/auth/components/LoginForm.tsx apps/admin-web/src/features/auth/components/__tests__/LoginForm.test.tsx
git commit -m "refactor(admin-web): convert LoginForm to React Hook Form with Zod validation"
```

---

### Task 5: End-to-End Verification & Lint

**Files:**
- None (verification across repository)

- [ ] **Step 1: Run linter**

Run: `pnpm --filter @tiny-threads/admin-web lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 2: Run typecheck and production build**

Run: `pnpm --filter @tiny-threads/admin-web build`
Expected: TypeScript and Vite build succeed.

- [ ] **Step 3: Run full test suite**

Run: `pnpm test`
Expected: All workspace tests pass.
