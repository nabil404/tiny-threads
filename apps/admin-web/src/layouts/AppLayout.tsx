import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import {
  selectSidebarCollapsed,
  setMobileNavOpen,
} from '@store/slices/appSlice';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { MobileNavDrawer } from './components/MobileNavDrawer';

export function AppLayout() {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const isCollapsed = useAppSelector(selectSidebarCollapsed);

  // Auto-close mobile drawer on route change
  useEffect(() => {
    dispatch(setMobileNavOpen(false));
  }, [location.pathname, dispatch]);

  // Auto-close mobile drawer if viewport expands to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        dispatch(setMobileNavOpen(false));
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [dispatch]);

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-200">
      {/* Desktop Fixed Sidebar */}
      <Sidebar />

      {/* Mobile Drawer */}
      <MobileNavDrawer />

      {/* Main Content Area offset by Sidebar */}
      <div
        className={`flex flex-col min-h-screen transition-all duration-300 ease-in-out ${
          isCollapsed ? 'md:pl-16' : 'md:pl-64'
        }`}
      >
        <Topbar />
        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
