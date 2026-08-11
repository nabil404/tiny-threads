import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAppSelector } from '@store/hooks';
import { selectAuth } from '@store/slices/authSlice';

export function PublicOnlyRoute() {
  const { isAuthenticated } = useAppSelector(selectAuth);
  const location = useLocation();
  const fromState = (
    location.state as { from?: { pathname?: string; search?: string } }
  )?.from;
  const from = fromState?.pathname
    ? `${fromState.pathname}${fromState.search ?? ''}`
    : '/';

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  return <Outlet />;
}
