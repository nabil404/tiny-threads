import { AuthCard } from '../components/AuthCard';
import { AuthHeader } from '../components/AuthHeader';
import { LoginForm } from '../components/LoginForm';

export function LoginPage() {
  return (
    <AuthCard>
      <AuthHeader />
      <LoginForm />
    </AuthCard>
  );
}
