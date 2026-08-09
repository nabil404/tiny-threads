import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import { selectApp, setTheme } from '../../../store/slices/appSlice';
import { AuthCard } from '../components/AuthCard';
import { AuthHeader } from '../components/AuthHeader';
import { LoginForm } from '../components/LoginForm';

export function LoginPage() {
  const dispatch = useAppDispatch();
  const { theme } = useAppSelector(selectApp);

  return (
    <AuthCard theme={theme} onThemeChange={(newTheme) => dispatch(setTheme(newTheme))}>
      <AuthHeader />
      <LoginForm />
    </AuthCard>
  );
}
