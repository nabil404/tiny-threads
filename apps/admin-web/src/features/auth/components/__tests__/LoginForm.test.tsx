import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import appReducer from '@store/slices/appSlice';
import authReducer from '@store/slices/authSlice';
import { LoginForm } from '../LoginForm';
import { login, getLocale, ApiClientError } from '@lib/api-client';

vi.mock('@lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@lib/api-client')>('@lib/api-client');
  return {
    ...actual,
    login: vi.fn(),
    getLocale: vi.fn(),
  };
});

function createStore() {
  return configureStore({
    reducer: { app: appReducer, auth: authReducer },
  });
}

describe('LoginForm', () => {
  beforeEach(() => {
    vi.mocked(login).mockReset();
    vi.mocked(getLocale).mockReset();
  });

  it('calls the real login API and stores the returned accessToken on success', async () => {
    vi.mocked(login).mockResolvedValue({ accessToken: 'jwt-real' });
    vi.mocked(getLocale).mockResolvedValue({ locale: null });
    const store = createStore();
    const onSuccess = vi.fn();

    render(
      <Provider store={store}>
        <LoginForm onSuccess={onSuccess} />
      </Provider>,
    );

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'owner@acme.dev' },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'hunter2222' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(store.getState().auth.token).toBe('jwt-real');
    });
    expect(login).toHaveBeenCalledWith('owner@acme.dev', 'hunter2222');
    expect(store.getState().auth.isAuthenticated).toBe(true);
    expect(onSuccess).toHaveBeenCalled();
  });

  it('hydrates the locale from the backend after a successful login', async () => {
    vi.mocked(login).mockResolvedValue({ accessToken: 'jwt-real' });
    vi.mocked(getLocale).mockResolvedValue({ locale: 'en' });
    const store = createStore();

    render(
      <Provider store={store}>
        <LoginForm />
      </Provider>,
    );

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'owner@acme.dev' },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'hunter2222' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(getLocale).toHaveBeenCalledWith('jwt-real');
    });
    expect(store.getState().app.locale).toBe('en');
  });

  it('shows the error message when login fails', async () => {
    vi.mocked(login).mockRejectedValue(
      new ApiClientError(401, 'INVALID_CREDENTIALS', 'Invalid email or password'),
    );
    const store = createStore();

    render(
      <Provider store={store}>
        <LoginForm />
      </Provider>,
    );

    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'owner@acme.dev' },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: 'wrongpassword' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();
    expect(store.getState().auth.isAuthenticated).toBe(false);
  });
});
