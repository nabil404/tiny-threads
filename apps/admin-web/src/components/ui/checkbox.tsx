import * as React from 'react';

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className = '', label, id, ...props }, ref) => {
    return (
      <div className="flex items-center gap-2 select-none">
        <input
          type="checkbox"
          id={id}
          ref={ref}
          className={`h-4 w-4 rounded border-[#c7c4d8] text-[#4f46e5] focus:ring-[#4f46e5] bg-[#f9f9ff] dark:bg-slate-900 dark:border-slate-700 dark:checked:bg-[#4f46e5] ${className}`}
          {...props}
        />
        {label && (
          <label
            htmlFor={id}
            className="text-sm font-medium text-[#464555] dark:text-slate-300 cursor-pointer"
          >
            {label}
          </label>
        )}
      </div>
    );
  },
);
Checkbox.displayName = 'Checkbox';
