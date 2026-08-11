import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { selectApp, setLocale, setTenant } from '@store/slices/appSlice';
import {
  selectAuth,
  loginSuccess,
  setInitialized,
} from '@store/slices/authSlice';
import { useRefreshMutation } from '@store/api/endpoints/authApi';
import { useLazyGetLocaleQuery } from '@store/api/endpoints/localeApi';
import { parseJwtPayload, MerchantJwtPayload } from '@lib/jwt';
import { LOCALES, LocaleId } from '@i18n/locales';
import { applyThemeToDocument } from '@theme/themes';
import { router } from './routes';

export default function App() {
  const dispatch = useAppDispatch();
  const { theme } = useAppSelector(selectApp);
  const { isInitialized } = useAppSelector(selectAuth);
  const [refresh] = useRefreshMutation();
  const [fetchLocale] = useLazyGetLocaleQuery();
  const hasAttemptedRefresh = React.useRef(false);

  React.useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  React.useEffect(() => {
    if (isInitialized || hasAttemptedRefresh.current) return;
    hasAttemptedRefresh.current = true;

    refresh()
      .unwrap()
      .then(async ({ accessToken }) => {
        const payload = parseJwtPayload<MerchantJwtPayload>(accessToken);
        const tenantId = payload?.tenantId ?? 'tenant_demo_1';
        dispatch(
          loginSuccess({
            token: accessToken,
            user: {
              id: payload?.sub ?? 'usr_m1',
              email: 'Merchant Admin',
              name: 'Merchant Admin',
              role: payload?.role ?? 'MERCHANT_ADMIN',
            },
            tenantId,
          }),
        );
        dispatch(
          setTenant({
            id: tenantId,
            name: 'Tiny Threads Apparels',
          }),
        );
        try {
          const { locale } = await fetchLocale().unwrap();
          if (locale && LOCALES.some((l) => l.id === locale)) {
            dispatch(setLocale(locale as LocaleId));
          }
        } catch {
          // ignore locale fetch error
        }
      })
      .catch(() => {
        dispatch(setInitialized(true));
      });
  }, [isInitialized, refresh, fetchLocale, dispatch]);

  return <RouterProvider router={router} />;
}
