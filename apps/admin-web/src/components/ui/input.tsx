import * as React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', error, type = 'text', ...props }, ref) => {
    return (
      <input
        type={type}
        className={`flex h-11 w-full rounded-lg border bg-card px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:cursor-not-allowed disabled:opacity-50 transition-all ${
          error ? 'border-destructive focus:ring-destructive' : 'border-input'
        } ${className}`}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';
