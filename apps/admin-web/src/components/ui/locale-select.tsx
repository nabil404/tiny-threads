import * as React from 'react';
import { useTranslation } from 'react-i18next';
import {
  LOCALES,
  LocaleId,
  getSavedLocale,
  LOCALE_STORAGE_KEY,
} from '@i18n/locales';
import { Globe, Check } from 'lucide-react';

export interface LocaleSelectProps {
  value?: LocaleId;
  onChange?: (locale: LocaleId) => void;
  className?: string;
}

export function LocaleSelect({ value, onChange, className = '' }: LocaleSelectProps) {
  const { t } = useTranslation();
  const [internalLocale, setInternalLocale] = React.useState<LocaleId>(() => getSavedLocale());
  const [isOpen, setIsOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const currentLocaleId = value !== undefined ? value : internalLocale;

  const handleLocaleChange = (newLocale: LocaleId) => {
    if (onChange) {
      onChange(newLocale);
    } else {
      setInternalLocale(newLocale);
      if (typeof window !== 'undefined') {
        localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
      }
    }
    setIsOpen(false);
  };

  const activeLocale = LOCALES.find((l) => l.id === currentLocaleId) || LOCALES[0];

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
        aria-label={t('locale.selectLocaleAria')}
      >
        <Globe className="h-4 w-4 text-primary" />
        <span>{activeLocale.nativeName}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 rounded-xl border border-border bg-card text-card-foreground shadow-lg z-50 py-1 font-sans">
          <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider border-b border-border/50">
            {t('locale.selectLocaleLabel')}
          </div>
          <div className="py-1">
            {LOCALES.map((l) => {
              const isSelected = l.id === currentLocaleId;

              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => handleLocaleChange(l.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs text-left transition-colors cursor-pointer hover:bg-muted/70 ${
                    isSelected ? 'bg-muted font-semibold text-primary' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-primary" />
                    <div>
                      <div>{l.nativeName}</div>
                      <div className="text-[10px] text-muted-foreground font-normal">
                        {l.englishName}
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
