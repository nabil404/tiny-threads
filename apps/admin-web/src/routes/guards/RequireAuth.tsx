import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useGetMeQuery } from '@store/api/endpoints/authApi';

export function RequireAuth() {
  const { data, isLoading, isError } = useGetMeQuery();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground text-sm">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span>Verifying session...</span>
        </div>
      </div>
    );
  }

  if (isError || !data?.user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
