# Design Document: React Hook Form and Zod Validation in Admin Web

**Date**: 2026-08-12  
**Status**: Approved  
**Target Package**: `apps/admin-web` (`@tiny-threads/admin-web`)

---

## 1. Overview & Objective

The objective of this architectural enhancement is to modernize form handling and client-side validation in `apps/admin-web`. Currently, forms (such as `LoginForm.tsx`) rely on manual React `useState` hooks, native HTML form submissions, and unstandardized validation states.

We will introduce a standardized, accessible form infrastructure based on:
1. **React Hook Form (`react-hook-form`)**: High-performance, un-controlled/controlled form state management.
2. **Zod (`zod`) & Hookform Resolvers (`@hookform/resolvers`)**: Declarative schema-based validation with inferred TypeScript types.
3. **shadcn/ui Form Primitives (`src/components/ui/form.tsx`)**: Reusable, accessible UI primitives (`Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage`, `useFormField`) wrapping Radix UI Slot.

---

## 2. Architecture & Directory Structure

```
apps/admin-web/
├── package.json
└── src/
    ├── components/
    │   └── ui/
    │       ├── form.tsx                     # [NEW] shadcn/ui React Hook Form primitives
    │       └── __tests__/
    │           └── form.test.tsx            # [NEW] Tests for form primitives
    ├── features/
    │   └── auth/
    │       ├── schemas/
    │       │   ├── login.schema.ts          # [NEW] Zod validation schema & LoginFormData type
    │       │   └── index.ts                 # [NEW] Export schema and types
    │       └── components/
    │           ├── LoginForm.tsx            # [MODIFY] Refactored to React Hook Form & Zod
    │           └── __tests__/
    │               └── LoginForm.test.tsx   # [MODIFY] Tests updated for validation & submission
    └── lib/
        └── utils.ts                         # Existing clsx / tailwind-merge helper
```

---

## 3. Detailed Specifications

### 3.1 Dependencies
In `apps/admin-web/package.json`:
- `react-hook-form`: `^7.54.2` (or latest 7.x)
- `zod`: `^3.24.2` (or latest 3.x)
- `@hookform/resolvers`: `^3.10.0` (or latest 3.x)

### 3.2 Form Primitives (`src/components/ui/form.tsx`)
The form component primitives follow the standard shadcn/ui pattern built on top of `react-hook-form` and `@radix-ui/react-slot`:
- **`Form`**: Alias for `FormProvider`.
- **`FormField`**: Wrapper around `Controller` providing `FormFieldContext` (`{ name }`).
- **`FormItem`**: Wrapper providing unique field IDs via React `useId()` and `FormItemContext`.
- **`FormLabel`**: Extends `Label` primitive, automatically setting `htmlFor` and error styling if invalid.
- **`FormControl`**: Extends Radix `Slot`, injecting `id`, `aria-describedby` (linking description and error message), and `aria-invalid`.
- **`FormDescription`**: Optional helper text with linked ID.
- **`FormMessage`**: Renders field error message (`p.text-destructive`) or custom text with linked ID.
- **`useFormField`**: Custom hook retrieving current field state, error, IDs, and invalid status from context.

### 3.3 Auth Validation Schema (`src/features/auth/schemas/login.schema.ts`)
```typescript
import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, { message: 'Email is required' })
    .email({ message: 'Please enter a valid email address' }),
  password: z
    .string()
    .min(1, { message: 'Password is required' }),
});

export type LoginFormData = z.infer<typeof loginSchema>;
```

### 3.4 Refactored `LoginForm.tsx`
- Replaces raw `useState` for email and password with `useForm<LoginFormData>` using `zodResolver(loginSchema)`.
- Default values: `{ email: initialEmail, password: '' }`.
- Integrates with `useLoginMutation()` from `@store/api/endpoints/authApi`.
- Handles form submission with `form.handleSubmit(onSubmit)`.
- Renders top-level alert banner on API failure using `extractErrorMessage`.
- Automatically renders field-level errors via `FormMessage` when inputs fail validation.

### 3.5 Error Handling Strategy
1. **Client-side validation errors**: Handled automatically on submit or blur by Zod resolver, displayed under the relevant input via `FormMessage`.
2. **Server-side API errors**:
   - Generic/auth errors (e.g., `AUTH_INVALID_CREDENTIALS`): Rendered in the top alert banner.
   - Field-level server errors (if returned by the API): Can be mapped via `form.setError(fieldName, { message })`.

---

## 4. Testing & Verification

1. **Unit tests for Form Primitives (`src/components/ui/__tests__/form.test.tsx`)**:
   - Verify rendering of label, control, description, and error message.
   - Verify `aria-describedby` and `aria-invalid` bindings on error.
2. **Unit tests for `LoginForm` (`src/features/auth/components/__tests__/LoginForm.test.tsx`)**:
   - Verify rendering with initial values.
   - Verify validation errors when submitting empty or invalid email/password.
   - Verify successful mutation call and `onSuccess` callback on valid submission.
   - Verify API error message display when login mutation fails.
3. **Workspace Build & Lint**:
   - Run `pnpm --filter @tiny-threads/admin-web test`
   - Run `pnpm --filter @tiny-threads/admin-web lint`
   - Run `pnpm --filter @tiny-threads/admin-web build`
