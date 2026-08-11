import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { store } from '@store/index';
import { LoginForm } from '../LoginForm';
import * as authApiHooks from '@store/api/endpoints/authApi';
import * as localeApiHooks from '@store/api/endpoints/localeApi';

describe('LoginForm', () => {
  it('renders email and password inputs and sign-in button', () => {
    render(
      <Provider store={store}>
        <LoginForm />
      </Provider>,
    );

    expect(screen.getByPlaceholderText(/admin@merchant\.com/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('handles login form submission and calls onSuccess', async () => {
    const mockUnwrapLogin = vi.fn().mockResolvedValue({ accessToken: 'mock-token' });
    const mockLoginMutation = vi.fn().mockReturnValue({ unwrap: mockUnwrapLogin });
    vi.spyOn(authApiHooks, 'useLoginMutation').mockReturnValue([
      mockLoginMutation as any,
      { isLoading: false } as any,
    ]);

    const mockUnwrapLocale = vi.fn().mockResolvedValue({ locale: 'en' });
    const mockFetchLocale = vi.fn().mockReturnValue({ unwrap: mockUnwrapLocale });
    vi.spyOn(localeApiHooks, 'useLazyGetLocaleQuery').mockReturnValue([
      mockFetchLocale as any,
      {} as any,
      {} as any,
    ]);

    const onSuccess = vi.fn();
    const user = userEvent.setup();

    render(
      <Provider store={store}>
        <LoginForm onSuccess={onSuccess} />
      </Provider>,
    );

    await user.type(screen.getByPlaceholderText(/admin@merchant\.com/i), 'admin@test.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLoginMutation).toHaveBeenCalledWith({
        email: 'admin@test.com',
        password: 'password123',
      });
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('displays error message when login fails', async () => {
    const mockUnwrapLogin = vi.fn().mockRejectedValue({
      data: { error: { code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid email or password' } },
    });
    const mockLoginMutation = vi.fn().mockReturnValue({ unwrap: mockUnwrapLogin });
    vi.spyOn(authApiHooks, 'useLoginMutation').mockReturnValue([
      mockLoginMutation as any,
      { isLoading: false } as any,
    ]);

    const user = userEvent.setup();

    render(
      <Provider store={store}>
        <LoginForm />
      </Provider>,
    );

    await user.type(screen.getByPlaceholderText(/admin@merchant\.com/i), 'admin@test.com');
    await user.type(screen.getByLabelText(/password/i), 'wrongpassword');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText('Invalid email or password')).toBeInTheDocument();
    });
  });
});
