import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { selectSidebarCollapsed } from '@store/slices/appSlice';
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
} from 'lucide-react';

export function Sidebar() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const isCollapsed = useAppSelector(selectSidebarCollapsed);
  const { tenant } = useAppSelector(selectAuth);
  const [logoutApi] = useLogoutMutation();

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
    {
      to: '/categories',
      label: t('nav.categories'),
      icon: FolderTree,
      end: false,
    },
    { to: '/customers', label: t('nav.customers'), icon: Users, end: false },
    {
      to: '/analytics',
      label: t('nav.analytics'),
      icon: BarChart3,
      end: false,
    },
    { to: '/settings', label: t('nav.settings'), icon: Settings, end: false },
  ];

  const handleLogout = async () => {
    try {
      await logoutApi().unwrap();
    } catch {
      // Ignore server error on logout
    } finally {
      dispatch(logout());
      dispatch(baseApi.util.resetApiState());
      navigate('/login', { replace: true });
    }
  };

  return (
    <aside
      className={`fixed left-0 top-0 h-screen border-r border-border bg-card z-40 hidden md:flex flex-col transition-all duration-300 ease-in-out ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Store Header */}
      <div
        className={`h-16 border-b border-border flex items-center gap-3 px-3 transition-all ${
          isCollapsed ? 'justify-center' : 'px-4'
        }`}
      >
        <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary font-bold flex items-center justify-center text-sm shrink-0">
          {storeInitials}
        </div>
        {!isCollapsed && (
          <div className="min-w-0 flex-1 flex items-center justify-between">
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-foreground truncate">
                {tenant?.name || t('app.defaultStoreName')}
              </h2>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-[11px] text-muted-foreground">
                  {t('nav.activeStatus')}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation List */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            title={isCollapsed ? item.label : undefined}
            className={({ isActive }) =>
              `group relative flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                isCollapsed ? 'justify-center' : ''
              } ${
                isActive
                  ? 'bg-primary/10 text-primary font-semibold'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!isCollapsed && <span className="truncate">{item.label}</span>}
            {isCollapsed && (
              <span className="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded-md shadow-md opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap border border-border">
                {item.label}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer Actions */}
      <div className="p-2 border-t border-border space-y-1">
        <NavLink
          to="/support"
          title={isCollapsed ? t('nav.support') : undefined}
          className={({ isActive }) =>
            `group relative flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
              isCollapsed ? 'justify-center' : ''
            } ${
              isActive
                ? 'bg-primary/10 text-primary font-semibold'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`
          }
        >
          <HelpCircle className="h-4 w-4 shrink-0" />
          {!isCollapsed && <span className="truncate">{t('nav.support')}</span>}
          {isCollapsed && (
            <span className="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded-md shadow-md opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap border border-border">
              {t('nav.support')}
            </span>
          )}
        </NavLink>

        <button
          type="button"
          onClick={handleLogout}
          title={isCollapsed ? t('nav.signOut') : undefined}
          className={`group relative w-full flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-lg text-destructive hover:bg-destructive/10 transition-colors cursor-pointer ${
            isCollapsed ? 'justify-center' : ''
          }`}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!isCollapsed && <span className="truncate">{t('nav.signOut')}</span>}
          {isCollapsed && (
            <span className="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded-md shadow-md opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap border border-border">
              {t('nav.signOut')}
            </span>
          )}
        </button>
      </div>
    </aside>
  );
}
