import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAppSelector } from '@store/hooks';
import { selectAuth } from '@store/slices/authSlice';

export function PublicOnlyRoute() {
  const { isAuthenticated } = useAppSelector(selectAuth);
  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string } })?.from?.pathname ?? '/';

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  return <Outlet />;
}
