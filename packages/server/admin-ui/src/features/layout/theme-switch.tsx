import { Monitor, Moon, Sun } from 'lucide-react';
import { useI18n } from '../../shared/i18n/i18n-provider.tsx';
import {
  THEME_PREFERENCES,
  isThemePreference,
} from '../../shared/theme/color-scheme.ts';
import { useTheme } from '../../shared/theme/theme-provider.tsx';
import { buttonVariants } from '../../shared/ui/button.tsx';
import { cn } from '../../shared/ui/cn.ts';
import {
  Menu,
  MenuContent,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from '../../shared/ui/menu.tsx';

const ICON = { system: Monitor, light: Sun, dark: Moon } as const;

/**
 * Header menu that switches between the system setting, light, and dark.
 * The button shows the icon of the current choice; its accessible name says
 * the choice in words.
 */
export const ThemeSwitch = ({ className }: { className?: string }) => {
  const { t } = useI18n();
  const { preference, setPreference } = useTheme();
  const Icon = ICON[preference];
  const label = `${t('theme.label')}: ${t(`theme.${preference}`)}`;
  return (
    <Menu>
      <MenuTrigger
        data-testid='theme-switch'
        aria-label={label}
        title={label}
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'sm' }),
          'size-9 px-0',
          className,
        )}
      >
        <Icon aria-hidden='true' />
      </MenuTrigger>
      <MenuContent>
        <MenuRadioGroup
          value={preference}
          onValueChange={(value: unknown) => {
            if (isThemePreference(value)) setPreference(value);
          }}
        >
          {THEME_PREFERENCES.map((option) => {
            const OptionIcon = ICON[option];
            return (
              <MenuRadioItem key={option} value={option} closeOnClick>
                <span className='flex items-center gap-2'>
                  <OptionIcon
                    aria-hidden='true'
                    className='size-4 text-muted-foreground'
                  />
                  {t(`theme.${option}`)}
                </span>
              </MenuRadioItem>
            );
          })}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
};
