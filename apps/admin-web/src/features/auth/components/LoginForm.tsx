import { useState, useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppDispatch } from '@store/hooks';
import { setTenant, setLocale } from '@store/slices/appSlice';
import { loginSuccess } from '@store/slices/authSlice';
import { useLoginMutation } from '@store/api/endpoints/authApi';
import { useLazyGetLocaleQuery } from '@store/api/endpoints/localeApi';
import { Input } from '@components/ui/input';
import { Label } from '@components/ui/label';
import { Button } from '@components/ui/button';
import type { LocaleId } from '@i18n/locales';
import { LOCALES } from '@i18n/locales';
import type { ErrorResponseBody } from '@tiny-threads/shared';
import { ArrowRight, Lock, User, AlertCircle } from 'lucide-react';

export interface LoginFormProps {
  initialEmail?: string;
  onSuccess?: () => void;
}

export function LoginForm({ initialEmail = '', onSuccess }: LoginFormProps) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const emailId = useId();
  const passwordId = useId();

  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [loginMutation, { isLoading }] = useLoginMutation();
  const [fetchLocale] = useLazyGetLocaleQuery();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      await loginMutation({ email, password }).unwrap();

      dispatch(
        loginSuccess({
          user: {
            id: 'usr_m1',
            email,
            name: 'Merchant Admin',
            role: 'MERCHANT_ADMIN',
          },
          tenantId: 'tenant_demo_1',
        }),
      );

      dispatch(
        setTenant({
          id: 'tenant_demo_1',
          name: 'Tiny Threads Apparels',
        }),
      );

      try {
        const localeResult = await fetchLocale().unwrap();
        if (
          localeResult.locale &&
          LOCALES.some((l) => l.id === localeResult.locale)
        ) {
          dispatch(setLocale(localeResult.locale as LocaleId));
        }
      } catch (localeErr) {
        console.error('Failed to hydrate locale preference', localeErr);
      }

      onSuccess?.();
    } catch (err: unknown) {
      const customErr = err as { data?: ErrorResponseBody; message?: string };
      const errorMessage =
        customErr.data?.error?.message ??
        customErr.message ??
        t('auth.genericError');
      setError(errorMessage);
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

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={emailId} className="text-xs font-medium">
            {t('auth.emailLabel')}
          </Label>
          <div className="relative">
            <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id={emailId}
              type="email"
              placeholder={t('auth.emailPlaceholder')}
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
              {t('auth.passwordLabel')}
            </Label>
            <span className="text-xs text-primary hover:underline cursor-pointer">
              {t('auth.forgotPassword')}
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
    </div>
  );
}
