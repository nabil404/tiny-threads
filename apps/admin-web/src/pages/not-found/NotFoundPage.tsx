import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@components/ui/card';
import { AlertTriangle, Home } from 'lucide-react';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <Card className="max-w-md w-full border-border text-center">
        <CardHeader>
          <div className="mx-auto h-12 w-12 rounded-full bg-amber-500/10 flex items-center justify-center mb-2">
            <AlertTriangle className="h-6 w-6 text-amber-500" />
          </div>
          <CardTitle className="text-2xl">{t('notFound.title')}</CardTitle>
          <CardDescription>
            {t('notFound.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="gap-2 cursor-pointer">
            <Link to="/">
              <Home className="h-4 w-4" />
              <span>{t('notFound.backToDashboard')}</span>
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
