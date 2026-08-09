import { Store } from 'lucide-react';

export interface AuthHeaderProps {
  title?: string;
  subtitle?: string;
}

export function AuthHeader({
  title = 'Merchant Portal',
  subtitle = 'Sign in to manage your e-commerce tenant store',
}: AuthHeaderProps) {
  return (
    <div className="flex flex-col items-center mb-8 text-center">
      <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
        <Store className="h-6 w-6 text-primary" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
    </div>
  );
}
