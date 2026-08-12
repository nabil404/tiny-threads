import { createBrowserRouter } from 'react-router-dom';
import { RequireAuth } from './guards/RequireAuth';
import { PublicOnlyRoute } from './guards/PublicOnlyRoute';
import { AppLayout } from '../layouts/AppLayout';
import { AuthLayout } from '../layouts/AuthLayout';
import { LoginPage } from '../features/auth';
import { CreateProductPage, EditProductPage } from '../features/products';
import { DashboardPage } from '../pages/dashboard/DashboardPage';
import { ProductsPage } from '../pages/products/ProductsPage';
import { OrdersPage } from '../pages/orders/OrdersPage';
import { SettingsPage } from '../pages/settings/SettingsPage';
import { PlaceholderPage } from '../pages/placeholder/PlaceholderPage';
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
          { path: '/products/new', element: <CreateProductPage /> },
          { path: '/products/:id/edit', element: <EditProductPage /> },
          { path: '/orders', element: <OrdersPage /> },
          { path: '/settings', element: <SettingsPage /> },
          {
            path: '/categories',
            element: (
              <PlaceholderPage titleKey="nav.categories" title="Categories" />
            ),
          },
          {
            path: '/customers',
            element: (
              <PlaceholderPage titleKey="nav.customers" title="Customers" />
            ),
          },
          {
            path: '/analytics',
            element: (
              <PlaceholderPage titleKey="nav.analytics" title="Analytics" />
            ),
          },
          {
            path: '/support',
            element: <PlaceholderPage titleKey="nav.support" title="Support" />,
          },
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
