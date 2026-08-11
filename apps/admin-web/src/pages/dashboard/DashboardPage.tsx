import { useTranslation } from 'react-i18next';
import { useAppSelector } from '@store/hooks';
import { selectAuth } from '@store/slices/authSlice';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@components/ui/card';
import { ErrorCode } from '@tiny-threads/shared';
import { ShieldAlert, Layers, User as UserIcon } from 'lucide-react';

export function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAppSelector(selectAuth);

  const displayName =
    user && (user.firstName || user.lastName)
      ? [user.firstName, user.lastName].filter(Boolean).join(' ')
      : user?.email;

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card text-card-foreground">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <span>{t('app.authenticatedSessionTitle')}</span>
          </CardTitle>
          <CardDescription>
            {t('app.authenticatedSessionDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-muted border border-border">
              <span className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5 mb-1">
                <UserIcon className="h-3.5 w-3.5" /> {t('app.loggedInUser')}
              </span>
              <p className="text-base font-medium">
                {displayName}
                {displayName !== user?.email && ` (${user?.email})`}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('app.role', { role: user?.role })}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-muted border border-border">
              <span className="text-xs font-semibold uppercase text-muted-foreground">
                {t('app.sharedErrorCode')}
              </span>
              <p className="text-sm font-mono mt-1 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-500" />
                <span>{ErrorCode.AUTH_INSUFFICIENT_ROLE}</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
