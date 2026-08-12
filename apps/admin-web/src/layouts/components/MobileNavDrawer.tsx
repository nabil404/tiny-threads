import { useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import {
  selectMobileNavOpen,
  setMobileNavOpen,
} from '@store/slices/appSlice';
import { selectAuth, logout } from '@store/slices/authSlice';
import { useLogoutMutation } from '@store/api/endpoints/authApi';
import { baseApi } from '@store/api/baseApi';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  FolderTree,
  Users,
  BarChart3,
  Settings,
  HelpCircle,
  LogOut,
  X,
} from 'lucide-react';

export function MobileNavDrawer() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const isOpen = useAppSelector(selectMobileNavOpen);
  const { tenant } = useAppSelector(selectAuth);
  const [logoutApi] = useLogoutMutation();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dispatch(setMobileNavOpen(false));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, dispatch]);

  if (!isOpen) return null;

  const storeInitials = tenant?.name
    ? tenant.name
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'TT';

  const navItems = [
    { to: '/', label: t('nav.overview'), icon: LayoutDashboard, end: true },
    { to: '/orders', label: t('nav.orders'), icon: ShoppingCart, end: false },
    { to: '/products', label: t('nav.products'), icon: Package, end: false },
    { to: '/categories', label: t('nav.categories'), icon: FolderTree, end: false },
    { to: '/customers', label: t('nav.customers'), icon: Users, end: false },
    { to: '/analytics', label: t('nav.analytics'), icon: BarChart3, end: false },
    { to: '/settings', label: t('nav.settings'), icon: Settings, end: false },
  ];

  const handleClose = () => {
    dispatch(setMobileNavOpen(false));
  };

  const handleLogout = async () => {
    try {
      await logoutApi().unwrap();
    } catch {
      // Ignore server logout error
    } finally {
      dispatch(logout());
      dispatch(baseApi.util.resetApiState());
      handleClose();
      navigate('/login', { replace: true });
    }
  };

  return (
    <div className="md:hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 animate-in fade-in-0"
        onClick={handleClose}
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-y-0 left-0 z-50 w-3/4 max-w-xs bg-card border-r border-border p-4 shadow-xl flex flex-col animate-in slide-in-from-left duration-200"
      >
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary font-bold flex items-center justify-center text-xs">
              {storeInitials}
            </div>
            <span className="font-bold text-sm text-foreground truncate">
              {tenant?.name || 'Tiny Threads'}
            </span>
          </div>
          <button
            type="button"
            aria-label={t('nav.closeMenu')}
            onClick={handleClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={handleClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="pt-2 border-t border-border space-y-1">
          <NavLink
            to="/support"
            onClick={handleClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                isActive
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`
            }
          >
            <HelpCircle className="h-4 w-4" />
            <span>{t('nav.support')}</span>
          </NavLink>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-lg text-destructive hover:bg-destructive/10 transition-colors text-left"
          >
            <LogOut className="h-4 w-4" />
            <span>{t('nav.signOut')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
