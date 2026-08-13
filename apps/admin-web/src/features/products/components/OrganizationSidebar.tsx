import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@components/ui/card';
import type { ProductFormData } from '../schemas/product-form.schema';

export function OrganizationSidebar() {
  const { control } = useFormContext<ProductFormData>();
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('products.organizationTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <FormField
          control={control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('products.statusLabel')}</FormLabel>
              <Select
                onValueChange={field.onChange}
                defaultValue={field.value}
                value={field.value}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t('products.statusPlaceholder')} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="draft">{t('products.statusDraft')}</SelectItem>
                  <SelectItem value="active">{t('products.statusActive')}</SelectItem>
                  <SelectItem value="archived">{t('products.statusArchived')}</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </CardContent>
    </Card>
  );
}
