import * as React from 'react';

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className = '', children, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={`block text-sm font-medium text-foreground mb-1.5 select-none ${className}`}
        {...props}
      >
        {children}
      </label>
    );
  },
);
Label.displayName = 'Label';
