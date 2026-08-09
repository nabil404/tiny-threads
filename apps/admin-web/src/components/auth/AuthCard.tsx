import { Sun, Moon } from 'lucide-react';

export interface AuthCardProps {
  children: React.ReactNode;
  className?: string;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

export function AuthCard({
  children,
  className = '',
  theme,
  onToggleTheme,
}: AuthCardProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8 font-sans relative">
      {onToggleTheme && (
        <div className="absolute top-6 right-6">
          <button
            type="button"
            onClick={onToggleTheme}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-sm"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun className="h-5 w-5 text-amber-400" />
            ) : (
              <Moon className="h-5 w-5 text-slate-700" />
            )}
          </button>
        </div>
      )}
      <div
        className={`w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-8 md:p-10 shadow-xl shadow-slate-200/50 dark:shadow-none ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
