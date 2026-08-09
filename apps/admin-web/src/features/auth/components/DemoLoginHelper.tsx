import { ShieldCheck } from 'lucide-react';
import { Button } from '../../../components/ui/button';

export interface DemoLoginHelperProps {
  onSelectDemoUser: (credentials: { email: string; password: string }) => void;
}

export function DemoLoginHelper({ onSelectDemoUser }: DemoLoginHelperProps) {
  return (
    <div className="mt-8 pt-6 border-t border-border text-center">
      <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        <ShieldCheck className="h-4 w-4 text-emerald-500" />
        <span>Development Demo Mode</span>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          onSelectDemoUser({
            email: 'admin@acmeapparel.com',
            password: 'Password123!',
          })
        }
        className="w-full text-xs text-muted-foreground"
      >
        Use Demo Merchant Credentials
      </Button>
    </div>
  );
}
