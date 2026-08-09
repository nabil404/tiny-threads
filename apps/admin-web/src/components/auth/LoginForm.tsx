import * as React from 'react';
import { Mail, Lock, AlertCircle, Loader2 } from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { Button } from '../ui/button';

export interface LoginFormProps {
  onSubmit: (values: { email: string; password: string; rememberMe: boolean }) => void;
  isLoading?: boolean;
  error?: string | null;
  initialEmail?: string;
  onForgotPassword?: () => void;
}

export function LoginForm({
  onSubmit,
  isLoading = false,
  error = null,
  initialEmail = '',
  onForgotPassword,
}: LoginFormProps) {
  const [email, setEmail] = React.useState(initialEmail);
  const [password, setPassword] = React.useState('');
  const [rememberMe, setRememberMe] = React.useState(false);
  const [validationError, setValidationError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (initialEmail) setEmail(initialEmail);
  }, [initialEmail]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setValidationError('Please enter your email address.');
      return;
    }
    if (!password) {
      setValidationError('Please enter your password.');
      return;
    }
    setValidationError(null);
    onSubmit({ email: email.trim(), password, rememberMe });
  };

  const displayedError = validationError || error;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {displayedError && (
        <div className="p-3.5 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm flex items-start gap-2.5">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <span>{displayedError}</span>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">Email Address</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
          <Input
            id="email"
            type="email"
            placeholder="merchant@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="pl-10"
            disabled={isLoading}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" />
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="pl-10"
            disabled={isLoading}
            required
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <Checkbox
          id="remember-me"
          label="Remember me"
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
          disabled={isLoading}
        />
        <button
          type="button"
          onClick={onForgotPassword}
          className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline focus:outline-none"
        >
          Forgot password?
        </button>
      </div>

      <Button
        type="submit"
        disabled={isLoading}
        className="w-full h-11 text-base font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Signing in...</span>
          </span>
        ) : (
          'Sign in to Dashboard'
        )}
      </Button>
    </form>
  );
}
