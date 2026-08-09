import * as React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', error, type = 'text', ...props }, ref) => {
    return (
      <input
        type={type}
        className={`flex h-11 w-full rounded-lg border bg-[#f9f9ff] dark:bg-slate-900/80 px-3.5 py-2.5 text-sm text-[#151c27] dark:text-slate-100 placeholder-[#777587] dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/10 focus:border-[#4f46e5] disabled:cursor-not-allowed disabled:opacity-50 transition-all ${
          error
            ? 'border-red-500 focus:ring-red-500'
            : 'border-[#c7c4d8] dark:border-slate-800'
        } ${className}`}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';
