import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@components/ui/card';
import { Button } from '@components/ui/button';
import { Construction } from 'lucide-react';

interface PlaceholderPageProps {
  title?: string;
  titleKey?: string;
  description?: string;
}

export function PlaceholderPage({
  title,
  titleKey,
  description,
}: PlaceholderPageProps) {
  const { t } = useTranslation();

  const resolvedTitle = titleKey
    ? t(titleKey, { defaultValue: title || '' })
    : title || '';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{resolvedTitle}</h1>
        <p className="text-sm text-muted-foreground">
          {description || t('nav.placeholderDescription')}
        </p>
      </div>

      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Construction className="h-5 w-5 text-primary" />
            <span>{t('nav.placeholderTitle', { title: resolvedTitle })}</span>
          </CardTitle>
          <CardDescription>
            {description || t('nav.placeholderDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-8 text-center border border-dashed border-border rounded-lg text-muted-foreground text-sm">
            {t('nav.placeholderDescription')}
          </div>
          <div>
            <Button asChild variant="outline">
              <Link to="/">{t('nav.backToDashboard')}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
