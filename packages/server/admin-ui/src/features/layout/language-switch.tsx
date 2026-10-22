import { Languages } from 'lucide-react';
import { LOCALES } from '../../../../src/shared/messages.ts';
import { useI18n } from '../../shared/i18n/i18n-provider.tsx';
import { isLocale } from '../../shared/i18n/locale.ts';
import { buttonVariants } from '../../shared/ui/button.tsx';
import { cn } from '../../shared/ui/cn.ts';
import {
  Menu,
  MenuContent,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from '../../shared/ui/menu.tsx';

/** Header menu that switches between Japanese and English. */
export const LanguageSwitch = ({ className }: { className?: string }) => {
  const { locale, setLocale, t } = useI18n();
  return (
    <Menu>
      <MenuTrigger
        aria-label={`${t('admin.language')}: ${t(`language.${locale}`)}`}
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'sm' }),
          'gap-1.5 px-3',
          className,
        )}
      >
        <Languages aria-hidden='true' />
        <span>{t(`language.${locale}`)}</span>
      </MenuTrigger>
      <MenuContent>
        <MenuRadioGroup
          value={locale}
          onValueChange={(value: unknown) => {
            if (isLocale(value)) setLocale(value);
          }}
        >
          {LOCALES.map((option) => (
            <MenuRadioItem key={option} value={option} lang={option}>
              {t(`language.${option}`)}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
};
