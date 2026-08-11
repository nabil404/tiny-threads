import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { useAppSelector } from '@store/hooks';
import { selectApp } from '@store/slices/appSlice';
import { applyThemeToDocument } from '@theme/themes';
import { router } from './routes';

export default function App() {
  const { theme } = useAppSelector(selectApp);

  React.useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  return <RouterProvider router={router} />;
}
