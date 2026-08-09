import { useState, useId } from 'react';
import { useAppDispatch } from '../store/hooks';
import { setTenant } from '../store/slices/appSlice';
import { loginSuccess } from '../store/slices/authSlice';
import { AuthCard } from '../components/auth/AuthCard';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { Store, ArrowRight, Lock, User, AlertCircle } from 'lucide-react';

export function LoginPage() {
  const dispatch = useAppDispatch();
  const emailId = useId();
  const passwordId = useId();

  const [email, setEmail] = useState('admin@tinythreads.dev');
  const [password, setPassword] = useState('password123');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    setTimeout(() => {
      if (password !== 'password123') {
        setError('Invalid credentials. Password is password123');
        setIsLoading(false);
        return;
      }

      dispatch(
        loginSuccess({
          token: 'jwt-mock-merchant-token',
          tenantId: 'tenant_demo_1',
          user: {
            id: 'usr_m1',
            email,
            name: 'Merchant Admin',
            role: 'MERCHANT_ADMIN',
          },
        }),
      );

      dispatch(
        setTenant({
          id: 'tenant_demo_1',
          name: 'Tiny Threads Apparels',
        }),
      );

      setIsLoading(false);
    }, 600);
  };

  return (
    <AuthCard>
      <div className="flex flex-col items-center mb-8 text-center">
        <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
          <Store className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Merchant Portal</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Sign in to manage your e-commerce tenant store
        </p>
      </div>

      {error && (
        <div className="mb-6 p-3.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={emailId} className="text-xs font-medium">
            Email Address
          </Label>
          <div className="relative">
            <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id={emailId}
              type="email"
              placeholder="admin@merchant.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-9"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor={passwordId} className="text-xs font-medium">
              Password
            </Label>
            <span className="text-xs text-primary hover:underline cursor-pointer">
              Forgot password?
            </span>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id={passwordId}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-9"
              required
            />
          </div>
        </div>

        <Button type="submit" className="w-full mt-2" disabled={isLoading}>
          {isLoading ? (
            'Authenticating...'
          ) : (
            <span className="flex items-center justify-center gap-2">
              Sign In <ArrowRight className="h-4 w-4" />
            </span>
          )}
        </Button>
      </form>
    </AuthCard>
  );
}
