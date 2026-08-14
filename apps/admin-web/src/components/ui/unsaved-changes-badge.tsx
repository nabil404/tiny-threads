import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface UnsavedChangesBadgeProps
  extends React.HTMLAttributes<HTMLDivElement> {
  isDirty?: boolean;
}

export function UnsavedChangesBadge({
  isDirty = true,
  className,
  ...props
}: UnsavedChangesBadgeProps) {
  const { t } = useTranslation();

  if (!isDirty) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/25',
        'animate-in fade-in duration-200',
        className,
      )}
      {...props}
    >
      <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
      <span>{t('common.unsavedChanges')}</span>
    </div>
  );
}
