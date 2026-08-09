import * as React from 'react';
import {
  THEMES,
  ThemeConfig,
  ThemeId,
  getSavedTheme,
  applyThemeToDocument,
  THEME_STORAGE_KEY,
} from '../../theme/themes';
import { Sun, Moon, Sparkles, Trees, Palette, Check } from 'lucide-react';

const ICON_MAP: Record<ThemeConfig['iconName'], React.ComponentType<{ className?: string }>> = {
  Sun,
  Moon,
  Sparkles,
  Trees,
};

export interface ThemeSelectProps {
  value?: ThemeId;
  onChange?: (theme: ThemeId) => void;
  className?: string;
}

export function ThemeSelect({ value, onChange, className = '' }: ThemeSelectProps) {
  const [internalTheme, setInternalTheme] = React.useState<ThemeId>(() => getSavedTheme());
  const [isOpen, setIsOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const currentThemeId = value !== undefined ? value : internalTheme;

  const handleThemeChange = (newTheme: ThemeId) => {
    if (onChange) {
      onChange(newTheme);
    } else {
      setInternalTheme(newTheme);
      if (typeof window !== 'undefined') {
        localStorage.setItem(THEME_STORAGE_KEY, newTheme);
      }
      applyThemeToDocument(newTheme);
    }
    setIsOpen(false);
  };

  const activeTheme = THEMES.find((t) => t.id === currentThemeId) || THEMES[0];
  const ActiveIcon = ICON_MAP[activeTheme.iconName] || Palette;

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`relative inline-block text-left ${className}`} ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card text-card-foreground shadow-xs hover:bg-muted transition-colors cursor-pointer"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label="Select theme"
      >
        <ActiveIcon className="h-4 w-4 text-primary" />
        <span>{activeTheme.name}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 rounded-xl border border-border bg-card text-card-foreground shadow-lg z-50 py-1 font-sans">
          <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/50">
            Select Theme
          </div>
          <div className="py-1">
            {THEMES.map((t) => {
              const IconComponent = ICON_MAP[t.iconName] || Palette;
              const isSelected = t.id === currentThemeId;

              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleThemeChange(t.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-colors cursor-pointer hover:bg-muted/70 ${
                    isSelected ? 'bg-muted font-semibold text-primary' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <IconComponent className="h-4 w-4 text-primary" />
                    <div>
                      <div>{t.name}</div>
                      <div className="text-[10px] text-muted-foreground font-normal">
                        {t.description}
                      </div>
                    </div>
                  </div>
                  {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
