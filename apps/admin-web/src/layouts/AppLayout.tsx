import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { selectApp } from '@store/slices/appSlice';
import { selectAuth, logout } from '@store/slices/authSlice';
import { useLogoutMutation } from '@store/api/endpoints/authApi';
import { baseApi } from '@store/api/baseApi';
import { ThemeSelector, LocaleSelector } from '@features/common';
import { Button } from '@components/ui/button';
import { Badge } from '@components/ui/badge';
import {
  Store,
  LogOut,
  LayoutDashboard,
  Package,
  ShoppingCart,
  Settings,
} from 'lucide-react';

export function AppLayout() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { tenantId, tenantName } = useAppSelector(selectApp);
  const { user } = useAppSelector(selectAuth);
  const [logoutApi] = useLogoutMutation();

  const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/products', label: 'Products', icon: Package, end: false },
    { to: '/orders', label: 'Orders', icon: ShoppingCart, end: false },
    { to: '/settings', label: 'Settings', icon: Settings, end: false },
  ];

  const handleLogout = async () => {
    try {
      await logoutApi().unwrap();
    } catch {
      // ignore server logout errors
    } finally {
      dispatch(logout());
      dispatch(baseApi.util.resetApiState());
      navigate('/login', { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-200">
      <header className="border-b border-border bg-card/60 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2.5">
              <Store className="h-6 w-6 text-primary" />
              <span className="font-bold text-lg tracking-tight">
                {tenantName}
              </span>
            </div>
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      isActive
                        ? 'bg-primary/10 text-primary font-semibold'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`
                  }
                >
                  <item.icon className="h-3.5 w-3.5" />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2.5">
            <Badge
              variant={tenantId ? 'default' : 'secondary'}
              className="px-2.5 py-0.5 text-xs hidden sm:inline-flex"
            >
              {tenantId
                ? t('app.tenantBadge', { tenantId })
                : t('app.platformContext')}
            </Badge>
            <ThemeSelector />
            <LocaleSelector />
            {user && (
              <span className="text-xs text-muted-foreground hidden lg:inline-block">
                {user.email}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="gap-1.5 text-destructive border-destructive/20 hover:bg-destructive/10 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>{t('app.logOut')}</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-6xl p-6">
        <Outlet />
      </main>
    </div>
  );
}
