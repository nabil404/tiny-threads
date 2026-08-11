import { useAppDispatch, useAppSelector } from '@store/hooks';
import { selectApp, setLocale } from '@store/slices/appSlice';
import { selectAuth } from '@store/slices/authSlice';
import { LocaleSelect } from '@components/ui/locale-select';
import { updateLocale } from '@lib/api-client';
import type { LocaleId } from '@i18n/locales';

export interface LocaleSelectorProps {
  className?: string;
}

export function LocaleSelector({ className = '' }: LocaleSelectorProps) {
  const dispatch = useAppDispatch();
  const { locale } = useAppSelector(selectApp);
  const { token } = useAppSelector(selectAuth);

  const handleChange = (newLocale: LocaleId) => {
    dispatch(setLocale(newLocale));
    if (token) {
      updateLocale(token, newLocale).catch((err: unknown) => {
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
