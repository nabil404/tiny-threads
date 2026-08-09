import { useAppDispatch, useAppSelector } from '@store/hooks';
import { selectApp, setTheme } from '@store/slices/appSlice';
import { ThemeSelect } from '@components/ui/theme-select';

export interface ThemeSelectorProps {
  className?: string;
}

export function ThemeSelector({ className = '' }: ThemeSelectorProps) {
  const dispatch = useAppDispatch();
  const { theme } = useAppSelector(selectApp);

  return (
    <ThemeSelect
      value={theme}
      onChange={(newTheme) => dispatch(setTheme(newTheme))}
      className={className}
    />
  );
}
