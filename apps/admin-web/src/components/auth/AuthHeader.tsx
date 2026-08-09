import { Store } from 'lucide-react';

export interface AuthHeaderProps {
  title?: string;
  subtitle?: string;
}

export function AuthHeader({
  title = 'Merchant Precision',
  subtitle = 'Welcome back! Please enter your merchant credentials to access your dashboard.',
}: AuthHeaderProps) {
  return (
    <div className="text-center mb-8">
      <div className="flex justify-center mb-4">
        <div className="h-12 w-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-sm">
          <Store className="h-6 w-6" />
        </div>
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-sans">
        {title}
      </h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-xs mx-auto">
        {subtitle}
      </p>
    </div>
  );
}
