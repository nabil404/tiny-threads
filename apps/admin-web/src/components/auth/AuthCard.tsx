import * as React from 'react';
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
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 md:p-8 font-sans relative bg-[#f9f9ff] dark:bg-[#0b1326] text-[#151c27] dark:text-[#dae2fd] transition-colors duration-200">
      {onToggleTheme && (
        <div className="absolute top-6 right-6">
          <button
            type="button"
            onClick={onToggleTheme}
            className="p-2.5 rounded-xl border border-[#c7c4d8]/60 dark:border-slate-800 bg-white dark:bg-[#060e20] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-sm cursor-pointer"
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
        className={`w-full max-w-md bg-white dark:bg-[#060e20] border border-[#c7c4d8]/70 dark:border-slate-800/80 rounded-xl p-8 md:p-10 shadow-[0px_4px_16px_rgba(0,0,0,0.04)] dark:shadow-none ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
