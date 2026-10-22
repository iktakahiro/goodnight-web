import { Menu as BaseMenu } from '@base-ui/react/menu';
import { Check } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from './cn.ts';

/** A menu (Base UI Menu). */
export const Menu = BaseMenu.Root;

/** The button that opens the menu. Use `render` to style it. */
export const MenuTrigger = BaseMenu.Trigger;

/** The menu popup. */
export const MenuContent = ({
  className,
  align = 'end',
  ...props
}: ComponentProps<typeof BaseMenu.Popup> & {
  align?: 'start' | 'center' | 'end';
}) => (
  <BaseMenu.Portal>
    <BaseMenu.Positioner
      className='z-50 outline-none'
      sideOffset={8}
      align={align}
    >
      <BaseMenu.Popup
        className={cn(
          'min-w-44 origin-(--transform-origin) rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg shadow-primary/10 outline-none transition-[scale,opacity] duration-100 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0',
          className,
        )}
        {...props}
      />
    </BaseMenu.Positioner>
  </BaseMenu.Portal>
);

/** A group of mutually exclusive items. */
export const MenuRadioGroup = BaseMenu.RadioGroup;

/** One choice in a {@link MenuRadioGroup}, with a check mark when chosen. */
export const MenuRadioItem = ({
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof BaseMenu.RadioItem>, 'children'> & {
  children: ReactNode;
}) => (
  <BaseMenu.RadioItem
    className={cn(
      'grid cursor-pointer grid-cols-[1rem_1fr] items-center gap-2.5 rounded-lg py-2 pr-6 pl-2.5 text-[0.95rem] outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground',
      className,
    )}
    {...props}
  >
    <BaseMenu.RadioItemIndicator className='col-start-1 text-primary'>
      <Check aria-hidden='true' className='size-4' />
    </BaseMenu.RadioItemIndicator>
    <span className='col-start-2'>{children}</span>
  </BaseMenu.RadioItem>
);

/** An item that turns something on or off, with a check mark when on. */
export const MenuCheckboxItem = ({
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof BaseMenu.CheckboxItem>, 'children'> & {
  children: ReactNode;
}) => (
  <BaseMenu.CheckboxItem
    className={cn(
      'grid cursor-pointer grid-cols-[1rem_1fr] items-center gap-2.5 rounded-lg py-2 pr-6 pl-2.5 text-[0.95rem] outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground',
      className,
    )}
    {...props}
  >
    <BaseMenu.CheckboxItemIndicator className='col-start-1 text-primary'>
      <Check aria-hidden='true' className='size-4' />
    </BaseMenu.CheckboxItemIndicator>
    <span className='col-start-2'>{children}</span>
  </BaseMenu.CheckboxItem>
);
