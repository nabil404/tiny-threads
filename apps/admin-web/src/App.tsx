import React from 'react';
import { useAppDispatch, useAppSelector } from './store/hooks';
import { selectApp, setTheme } from './store/slices/appSlice';
import { selectAuth, logout } from './store/slices/authSlice';
import { applyThemeToDocument } from './theme/themes';
import { LoginPage } from './features/auth';
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
              <ThemeSelect
                value={theme}
                onChange={(newTheme) => dispatch(setTheme(newTheme))}
              />
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
                  React 19 + Redux Toolkit + Feature-Based Architecture Verified
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
                <ThemeSelect
                  value={theme}
                  onChange={(newTheme) => dispatch(setTheme(newTheme))}
                />
              </CardFooter>
            </Card>
          </main>
        </div>
      )}
    </div>
  );
}
