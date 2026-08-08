import { useAppDispatch, useAppSelector } from './store/hooks';
import { selectApp, setTenant, toggleTheme } from './store/slices/appSlice';
import { Button } from './components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './components/ui/card';
import { Badge } from './components/ui/badge';
import { ErrorCode } from '@tiny-threads/shared';
import { ShieldAlert, Store, Moon, Sun, Layers } from 'lucide-react';

export default function App() {
  const dispatch = useAppDispatch();
  const { tenantId, tenantName, theme } = useAppSelector(selectApp);

  const handleToggleTenant = () => {
    if (!tenantId) {
      dispatch(setTenant({ id: 'tenant_12345', name: 'Acme Apparel' }));
    } else {
      dispatch(setTenant({ id: '', name: 'Tiny Threads Admin' }));
    }
  };

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'dark bg-slate-950 text-slate-50' : 'bg-slate-50 text-slate-900'} transition-colors duration-200`}>
      <div className="container mx-auto max-w-4xl p-8">
        <header className="flex items-center justify-between pb-8 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <Store className="h-8 w-8 text-indigo-500" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{tenantName}</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Merchant Administration Console</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={tenantId ? 'default' : 'secondary'} className="px-3 py-1 text-xs">
              {tenantId ? `Tenant ID: ${tenantId}` : 'Platform Context'}
            </Badge>
            <Button variant="outline" size="icon" onClick={() => dispatch(toggleTheme())}>
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </header>

        <main className="py-8 space-y-6">
          <Card className="border-slate-200 dark:border-slate-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-indigo-500" />
                <span>State & UI Setup Status</span>
              </CardTitle>
              <CardDescription>
                React 19 + Redux Toolkit + Tailwind CSS v4 + shadcn/ui verified
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-xs font-semibold uppercase text-slate-500">Active Tenant</span>
                  <p className="text-lg font-medium mt-1">{tenantName}</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-xs font-semibold uppercase text-slate-500">Shared Error Code</span>
                  <p className="text-sm font-mono mt-1 flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-amber-500" />
                    <span>{ErrorCode.AUTH_INSUFFICIENT_ROLE}</span>
                  </p>
                </div>
              </div>
            </CardContent>
            <CardFooter className="gap-3">
              <Button onClick={handleToggleTenant}>
                {tenantId ? 'Reset to Platform Context' : 'Set Demo Merchant Tenant'}
              </Button>
              <Button variant="secondary" onClick={() => dispatch(toggleTheme())}>
                Toggle Theme ({theme})
              </Button>
            </CardFooter>
          </Card>
        </main>
      </div>
    </div>
  );
}
