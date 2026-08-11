import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useGetMeQuery } from '@store/api/endpoints/authApi';

export function PublicOnlyRoute() {
  const { data, isLoading } = useGetMeQuery();
  const location = useLocation();
  const fromState = (
    location.state as { from?: { pathname?: string; search?: string } }
  )?.from;
  const from = fromState?.pathname
    ? `${fromState.pathname}${fromState.search ?? ''}`
    : '/';

  if (isLoading) {
    return null;
  }

  if (data?.user) {
    return <Navigate to={from} replace />;
  }

  return <Outlet />;
}
