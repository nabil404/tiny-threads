import * as React from 'react';
import { ThemeSelect } from '../ui/theme-select';
import { ThemeId } from '../../theme/themes';

export interface AuthCardProps {
  children: React.ReactNode;
  className?: string;
  theme?: ThemeId;
  onThemeChange?: (theme: ThemeId) => void;
}

export function AuthCard({
  children,
  className = '',
  theme,
  onThemeChange,
}: AuthCardProps) {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 md:p-8 font-sans relative transition-colors duration-200 bg-background text-foreground">
      <div className="absolute top-6 right-6">
        <ThemeSelect value={theme} onChange={onThemeChange} />
      </div>
      <div
        className={`w-full max-w-md border border-border rounded-xl p-8 md:p-10 transition-colors bg-card text-card-foreground shadow-sm ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
