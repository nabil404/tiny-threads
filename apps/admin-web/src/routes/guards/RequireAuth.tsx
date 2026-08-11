import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAppDispatch } from '@store/hooks';
import { useGetMeQuery } from '@store/api/endpoints/authApi';
import { loginSuccess } from '@store/slices/authSlice';
import { setTenant } from '@store/slices/appSlice';

export function RequireAuth() {
  const { data, isLoading, isError } = useGetMeQuery();
  const dispatch = useAppDispatch();
  const location = useLocation();

  React.useEffect(() => {
    if (data?.user) {
      dispatch(
        loginSuccess({
          user: {
            id: data.user.id,
            email: 'Merchant Admin',
            name: 'Merchant Admin',
            role: data.user.role,
          },
          tenantId: data.user.tenantId,
        }),
      );
      dispatch(
        setTenant({
          id: data.user.tenantId,
          name: 'Tiny Threads Apparels',
        }),
      );
    }
  }, [data, dispatch]);

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
