import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import {
  toggleSidebar,
  toggleMobileNav,
  selectSidebarCollapsed,
} from '@store/slices/appSlice';
import { UserNavDropdown } from './UserNavDropdown';
import { Search, Menu, PanelLeftClose, PanelLeft } from 'lucide-react';

export function Topbar() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const isCollapsed = useAppSelector(selectSidebarCollapsed);

  return (
    <header className="h-16 w-full border-b border-border bg-card/80 backdrop-blur-md sticky top-0 right-0 z-30 flex items-center justify-between gap-4 md:gap-8 px-4 md:px-6">
      {/* Left section: toggles & search */}
      <div className="flex items-center gap-2 sm:gap-3 flex-1 max-w-md min-w-0">
        {/* Mobile Hamburger Toggle */}
        <button
          type="button"
          aria-label={t('nav.toggleMobileMenu')}
          onClick={() => dispatch(toggleMobileNav())}
          className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer shrink-0"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Desktop Collapse Toggle */}
        <button
          type="button"
          aria-label={
            isCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')
          }
          onClick={() => dispatch(toggleSidebar())}
          className="hidden md:flex p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer shrink-0"
        >
          {isCollapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>

        {/* Global Search */}
        <div className="relative flex-1 min-w-0">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder={t('nav.searchPlaceholder')}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-border bg-background placeholder:text-muted-foreground placeholder:truncate focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
          />
        </div>
      </div>

      {/* Right section: User Avatar dropdown */}
      <div className="flex items-center gap-3 shrink-0">
        <UserNavDropdown />
      </div>
    </header>
  );
}
