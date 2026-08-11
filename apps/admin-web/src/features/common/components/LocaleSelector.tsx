import { useAppDispatch, useAppSelector } from '@store/hooks';
import { selectApp, setLocale } from '@store/slices/appSlice';
import { selectAuth } from '@store/slices/authSlice';
import { useUpdateLocaleMutation } from '@store/api/endpoints/localeApi';
import { LocaleSelect } from '@components/ui/locale-select';
import type { LocaleId } from '@i18n/locales';

export interface LocaleSelectorProps {
  className?: string;
}

export function LocaleSelector({ className = '' }: LocaleSelectorProps) {
  const dispatch = useAppDispatch();
  const { locale } = useAppSelector(selectApp);
  const { isAuthenticated } = useAppSelector(selectAuth);
  const [updateLocaleApi] = useUpdateLocaleMutation();

  const handleChange = (newLocale: LocaleId) => {
    dispatch(setLocale(newLocale));
    if (isAuthenticated) {
      updateLocaleApi({ locale: newLocale })
        .unwrap()
        .catch((err: unknown) => {
          console.error('Failed to persist locale preference', err);
        });
    }
  };

  return (
    <LocaleSelect
      value={locale}
      onChange={handleChange}
      className={className}
    />
  );
}
