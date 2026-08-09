import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { selectApp, setLocale } from '@store/slices/appSlice';
import { selectAuth, logout } from '@store/slices/authSlice';
import { applyThemeToDocument } from '@theme/themes';
import { LoginPage } from '@features/auth';
import { ThemeSelector, LocaleSelector } from '@features/common';
import { getLocale } from '@lib/api-client';
import { LOCALES, LocaleId } from '@i18n/locales';
import { Button } from '@components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@components/ui/card';
import { Badge } from '@components/ui/badge';
import { ErrorCode } from '@tiny-threads/shared';
import {
  ShieldAlert,
  Store,
  Layers,
  LogOut,
  User as UserIcon,
} from 'lucide-react';

export default function App() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { tenantId, tenantName, theme } = useAppSelector(selectApp);
  const { isAuthenticated, user, token } = useAppSelector(selectAuth);
  const hasHydratedLocale = React.useRef(false);

  React.useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  React.useEffect(() => {
    if (!isAuthenticated || !token || hasHydratedLocale.current) return;
    hasHydratedLocale.current = true;

    getLocale(token)
      .then(({ locale }) => {
        if (locale && LOCALES.some((l) => l.id === locale)) {
          dispatch(setLocale(locale as LocaleId));
        }
      })
      .catch((err: unknown) => {
        console.error('Failed to hydrate locale preference', err);
      });
  }, [isAuthenticated, token, dispatch]);

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
                  {t('app.subtitle')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                variant={tenantId ? 'default' : 'secondary'}
                className="px-3 py-1 text-xs"
              >
                {tenantId
                  ? t('app.tenantBadge', { tenantId })
                  : t('app.platformContext')}
              </Badge>
              <ThemeSelector />
              <LocaleSelector />
              <Button
                variant="outline"
                size="sm"
                onClick={() => dispatch(logout())}
                className="gap-2 text-destructive border-destructive/20 hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" />
                <span>{t('app.logOut')}</span>
              </Button>
            </div>
          </header>

          <main className="py-8 space-y-6">
            <Card className="border-border bg-card text-card-foreground">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="h-5 w-5 text-primary" />
                  <span>{t('app.authenticatedSessionTitle')}</span>
                </CardTitle>
                <CardDescription>
                  {t('app.authenticatedSessionDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-muted border border-border">
                    <span className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5 mb-1">
                      <UserIcon className="h-3.5 w-3.5" /> {t('app.loggedInUser')}
                    </span>
                    <p className="text-base font-medium">
                      {user?.name} ({user?.email})
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t('app.role', { role: user?.role })}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted border border-border">
                    <span className="text-xs font-semibold uppercase text-muted-foreground">
                      {t('app.sharedErrorCode')}
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
                  {t('app.signOut')}
                </Button>
                <ThemeSelector />
              </CardFooter>
            </Card>
          </main>
        </div>
      )}
    </div>
  );
}
