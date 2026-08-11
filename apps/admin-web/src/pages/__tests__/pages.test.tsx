import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import authReducer from '@store/slices/authSlice';
import appReducer from '@store/slices/appSlice';
import { DashboardPage } from '../dashboard/DashboardPage';
import { ProductsPage } from '../products/ProductsPage';
import { OrdersPage } from '../orders/OrdersPage';
import { SettingsPage } from '../settings/SettingsPage';
import { NotFoundPage } from '../not-found/NotFoundPage';

function renderWithStore(ui: React.ReactElement) {
  const store = configureStore({
    reducer: { auth: authReducer, app: appReducer },
    preloadedState: {
      auth: {
        user: {
          id: '1',
          email: 'owner@example.com',
          name: 'Owner',
          role: 'MERCHANT_ADMIN',
        },
        tenantId: 'tenant-1',
        isAuthenticated: true,
        status: 'succeeded' as const,
        error: null,
      },
      app: {
        tenantId: 'tenant-1',
        tenantName: 'Store 1',
        theme: 'dark' as const,
        locale: 'en' as const,
      },
    },
  });

  return render(
    <Provider store={store}>
      <MemoryRouter>{ui}</MemoryRouter>
    </Provider>,
  );
}

describe('Pages', () => {
  it('renders DashboardPage with user info', () => {
    renderWithStore(<DashboardPage />);
    expect(screen.getByText(/owner@example.com/i)).toBeInTheDocument();
  });

  it('renders ProductsPage placeholder', () => {
    renderWithStore(<ProductsPage />);
    expect(
      screen.getByRole('heading', { name: /products/i }),
    ).toBeInTheDocument();
  });

  it('renders OrdersPage placeholder', () => {
    renderWithStore(<OrdersPage />);
    expect(
      screen.getByRole('heading', { name: /orders/i }),
    ).toBeInTheDocument();
  });

  it('renders SettingsPage placeholder', () => {
    renderWithStore(<SettingsPage />);
    expect(
      screen.getByRole('heading', { name: /settings/i }),
    ).toBeInTheDocument();
  });

  it('renders NotFoundPage with back link', () => {
    renderWithStore(<NotFoundPage />);
    expect(screen.getByText(/404/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /back to dashboard/i }),
    ).toBeInTheDocument();
  });
});
