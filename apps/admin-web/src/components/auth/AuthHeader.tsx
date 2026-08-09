import { Store } from 'lucide-react';

export interface AuthHeaderProps {
  title?: string;
  subtitle?: string;
}

export function AuthHeader({
  title = 'Welcome back',
  subtitle = 'Sign in to your Merchant Precision account',
}: AuthHeaderProps) {
  return (
    <div className="text-center mb-8">
      <div className="flex justify-center mb-5">
        <div className="h-14 w-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/25">
          <Store className="h-7 w-7" />
        </div>
      </div>
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-sans">
        {title}
      </h1>
      <p className="text-sm md:text-base text-slate-500 dark:text-slate-400 mt-2">
        {subtitle}
      </p>
    </div>
  );
}
