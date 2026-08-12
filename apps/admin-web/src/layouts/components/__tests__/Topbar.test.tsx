import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import appReducer from '@store/slices/appSlice';
import authReducer from '@store/slices/authSlice';
import { baseApi } from '@store/api/baseApi';
import { Topbar } from '../Topbar';

function renderTopbar() {
  const store = configureStore({
    reducer: {
      app: appReducer,
      auth: authReducer,
      [baseApi.reducerPath]: baseApi.reducer,
    },
    preloadedState: {
      app: { theme: 'dark', locale: 'en', sidebarCollapsed: false, mobileNavOpen: false },
      auth: {
        user: { id: '1', email: 'admin@demo.com', firstName: 'Admin', lastName: null, role: 'admin' },
        tenant: { id: 'tenant-demo', name: 'Demo Store' },
        isAuthenticated: true,
      },
    },
    middleware: (gdm) => gdm().concat(baseApi.middleware),
  });

  return {
    store,
    ...render(
      <Provider store={store}>
        <MemoryRouter>
          <Topbar />
        </MemoryRouter>
      </Provider>,
    ),
  };
}

describe('Topbar', () => {
  it('renders search input and triggers sidebar toggle actions', async () => {
    const user = userEvent.setup();
    const { store } = renderTopbar();

    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();

    const collapseBtn = screen.getByRole('button', { name: /collapse sidebar|expand sidebar/i });
    await user.click(collapseBtn);
    expect(store.getState().app.sidebarCollapsed).toBe(true);

    const mobileBtn = screen.getByRole('button', { name: /toggle menu/i });
    await user.click(mobileBtn);
    expect(store.getState().app.mobileNavOpen).toBe(true);
  });
});
