import { createBrowserRouter } from 'react-router-dom';
import { RequireAuth } from './guards/RequireAuth';
import { PublicOnlyRoute } from './guards/PublicOnlyRoute';
import { AppLayout } from '../layouts/AppLayout';
import { AuthLayout } from '../layouts/AuthLayout';
import { LoginPage } from '../features/auth';
import { DashboardPage } from '../pages/dashboard/DashboardPage';
import { ProductsPage } from '../pages/products/ProductsPage';
import { OrdersPage } from '../pages/orders/OrdersPage';
import { SettingsPage } from '../pages/settings/SettingsPage';
import { NotFoundPage } from '../pages/not-found/NotFoundPage';

export const router = createBrowserRouter([
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <DashboardPage /> },
          { path: '/products', element: <ProductsPage /> },
          { path: '/orders', element: <OrdersPage /> },
          { path: '/settings', element: <SettingsPage /> },
        ],
      },
    ],
  },
  {
    element: <PublicOnlyRoute />,
    children: [
      {
        element: <AuthLayout />,
        children: [{ path: '/login', element: <LoginPage /> }],
      },
    ],
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
]);
