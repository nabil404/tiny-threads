import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAppSelector } from '@store/hooks';
import { selectAuth } from '@store/slices/authSlice';

export function RequireAuth() {
  const { isAuthenticated, isInitialized } = useAppSelector(selectAuth);
  const location = useLocation();

  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground text-sm">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span>Authenticating session...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
