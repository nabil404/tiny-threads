import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@components/ui/form';
import { Input } from '@components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@components/ui/card';
import { RichTextEditor } from '@components/ui/rich-text-editor';
import { CategoryMultiSelect } from './CategoryMultiSelect';
import type { ProductFormData } from '../schemas/product-form.schema';

export function GeneralInfoSection() {
  const { control } = useFormContext<ProductFormData>();
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('products.generalInfo')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField
          control={control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('products.productNameLabel')}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t('products.productNamePlaceholder')}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('products.descriptionLabel')}</FormLabel>
              <FormControl>
                <RichTextEditor
                  value={field.value}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="categoryIds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('products.categoryLabel')}</FormLabel>
              <FormControl>
                <CategoryMultiSelect
                  selectedIds={field.value ?? []}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </CardContent>
    </Card>
  );
}
