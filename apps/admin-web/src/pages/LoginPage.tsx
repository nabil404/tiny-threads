import * as React from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { selectApp, toggleTheme, setTenant } from '../store/slices/appSlice';
import {
  selectAuth,
  loginStart,
  loginSuccess,
  loginFailure,
} from '../store/slices/authSlice';
import { AuthCard } from '../components/auth/AuthCard';
import { AuthHeader } from '../components/auth/AuthHeader';
import { LoginForm } from '../components/auth/LoginForm';
import { DemoLoginHelper } from '../components/auth/DemoLoginHelper';

export function LoginPage() {
  const dispatch = useAppDispatch();
  const { theme } = useAppSelector(selectApp);
  const { status, error } = useAppSelector(selectAuth);
  const [initialEmail, setInitialEmail] = React.useState('');

  const handleLogin = async (values: {
    email: string;
    password: string;
    rememberMe: boolean;
  }) => {
    dispatch(loginStart());
    try {
      // Simulate auth delay & validation
      await new Promise((resolve) => setTimeout(resolve, 800));

      if (values.password === 'wrong') {
        dispatch(
          loginFailure('Invalid merchant credentials. Please try again.'),
        );
        return;
      }

      const tenantId = 'tenant_acme_123';
      const tenantName = 'Acme Apparel';
      const user = {
        id: 'usr_merchant_01',
        email: values.email,
        name: 'Merchant Admin',
        role: 'STORE_ADMIN',
      };

      dispatch(
        loginSuccess({
          user,
          tenantId,
          token: 'mock_jwt_token_xyz',
        }),
      );
      dispatch(setTenant({ id: tenantId, name: tenantName }));
    } catch {
      dispatch(loginFailure('An unexpected authentication error occurred.'));
    }
  };

  const handleSelectDemoUser = (credentials: {
    email: string;
    password: string;
  }) => {
    setInitialEmail(credentials.email);
    handleLogin({
      email: credentials.email,
      password: credentials.password,
      rememberMe: true,
    });
  };

  return (
    <AuthCard theme={theme} onToggleTheme={() => dispatch(toggleTheme())}>
      <AuthHeader />
      <LoginForm
        onSubmit={handleLogin}
        isLoading={status === 'loading'}
        error={error}
        initialEmail={initialEmail}
        onForgotPassword={() =>
          alert('Password reset functionality requested.')
        }
      />
      <DemoLoginHelper onSelectDemoUser={handleSelectDemoUser} />
    </AuthCard>
  );
}
