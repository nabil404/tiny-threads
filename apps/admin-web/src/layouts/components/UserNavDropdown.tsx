import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { selectAuth, logout } from '@store/slices/authSlice';
import { useLogoutMutation } from '@store/api/endpoints/authApi';
import { baseApi } from '@store/api/baseApi';
import { ThemeSelector, LocaleSelector } from '@features/common';
import { Badge } from '@components/ui/badge';
import { Settings, LogOut, Shield } from 'lucide-react';

export function UserNavDropdown() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { user, tenant } = useAppSelector(selectAuth);
  const [logoutApi] = useLogoutMutation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const initials = user?.firstName
    ? `${user.firstName[0]}${user.lastName ? user.lastName[0] : ''}`.toUpperCase()
    : user?.email?.[0]?.toUpperCase() || 'U';

  const displayName = user?.firstName
    ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ''}`
    : user?.email || 'User';

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleLogout = async () => {
    try {
      await logoutApi().unwrap();
    } catch {
      // Ignore server error on logout
    } finally {
      dispatch(logout());
      dispatch(baseApi.util.resetApiState());
      setIsOpen(false);
      navigate('/login', { replace: true });
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        aria-label={t('nav.userMenu')}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-9 h-9 rounded-full bg-primary/10 text-primary hover:bg-primary/20 flex items-center justify-center font-bold text-sm border border-border cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20"
      >
        <span>{initials}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 rounded-xl bg-card border border-border shadow-xl py-2 z-50 animate-in fade-in-0 zoom-in-95 duration-100">
          <div className="px-4 py-3 border-b border-border space-y-1.5">
            <div className="font-semibold text-sm text-foreground truncate">
              {displayName}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {user?.email}
            </div>
            <div className="flex items-center gap-1.5 pt-1">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {tenant?.name || t('app.platformContext')}
              </Badge>
              {user?.role && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize flex items-center gap-1">
                  <Shield className="h-2.5 w-2.5" />
                  {user.role}
                </Badge>
              )}
            </div>
          </div>

          <div className="px-4 py-2.5 border-b border-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{t('nav.theme')}</span>
              <ThemeSelector />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{t('nav.language')}</span>
              <LocaleSelector />
            </div>
          </div>

          <div className="py-1">
            <Link
              to="/settings"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <Settings className="h-4 w-4 text-muted-foreground" />
              <span>{t('nav.accountSettings')}</span>
            </Link>
          </div>

          <div className="pt-1 border-t border-border">
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors cursor-pointer text-left"
            >
              <LogOut className="h-4 w-4" />
              <span>{t('nav.signOut')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
