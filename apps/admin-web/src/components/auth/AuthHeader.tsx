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
      <div className="flex justify-center mb-4">
        <div className="w-12 h-12 rounded-xl bg-[#4f46e5] text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
          <Store className="h-6 w-6" />
        </div>
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-[#151c27] dark:text-slate-100 font-sans">
        {title}
      </h1>
      <p className="text-sm text-[#464555] dark:text-slate-400 mt-1">
        {subtitle}
      </p>
    </div>
  );
}
