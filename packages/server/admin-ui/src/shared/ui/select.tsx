import { Select as BaseSelect } from '@base-ui/react/select';
import Check from '@gravity-ui/icons/Check';
import ChevronsExpandVertical from '@gravity-ui/icons/ChevronsExpandVertical';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from './cn.ts';

/** A select (Base UI Select). */
export const Select = BaseSelect.Root;

/** The visible label of a {@link Select}. */
export const SelectLabel = ({
  className,
  ...props
}: ComponentProps<typeof BaseSelect.Label>) => (
  <BaseSelect.Label
    className={cn('text-sm font-semibold text-foreground', className)}
    {...props}
  />
);

/** The button that opens the select, showing the current value. */
export const SelectTrigger = ({
  className,
  children,
  ...props
}: ComponentProps<typeof BaseSelect.Trigger>) => (
  <BaseSelect.Trigger
    className={cn(
      'flex h-11 w-full min-w-40 cursor-pointer items-center justify-between gap-3 rounded-xl border border-input bg-card px-3.5 text-[0.95rem] text-foreground shadow-xs outline-none select-none hover:border-ring/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 data-disabled:cursor-not-allowed data-disabled:opacity-60 data-popup-open:border-ring',
      className,
    )}
    {...props}
  >
    {children}
    <BaseSelect.Icon className='text-muted-foreground'>
      <ChevronsExpandVertical aria-hidden='true' className='size-4' />
    </BaseSelect.Icon>
  </BaseSelect.Trigger>
);

/** Shows the selected item's label inside {@link SelectTrigger}. */
export const SelectValue = BaseSelect.Value;

/** The popup with the options. */
export const SelectContent = ({
  className,
  children,
  ...props
}: ComponentProps<typeof BaseSelect.Popup>) => (
  <BaseSelect.Portal>
    <BaseSelect.Positioner className='z-50 outline-none' sideOffset={6}>
      <BaseSelect.Popup
        className={cn(
          'min-w-(--anchor-width) origin-(--transform-origin) rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg shadow-primary/10 outline-none transition-[scale,opacity] duration-100 ease-out data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0 data-[side=none]:data-starting-style:scale-100 data-[side=none]:data-starting-style:opacity-100',
          className,
        )}
        {...props}
      >
        <BaseSelect.List className='max-h-(--available-height) overflow-y-auto'>
          {children}
        </BaseSelect.List>
      </BaseSelect.Popup>
    </BaseSelect.Positioner>
  </BaseSelect.Portal>
);

/** One option, with a check mark when selected. */
export const SelectItem = ({
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof BaseSelect.Item>, 'children'> & {
  children: ReactNode;
}) => (
  <BaseSelect.Item
    className={cn(
      'grid cursor-pointer grid-cols-[1rem_1fr] items-center gap-2.5 rounded-lg py-2 pr-6 pl-2.5 text-[0.95rem] outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground',
      className,
    )}
    {...props}
  >
    <BaseSelect.ItemIndicator className='col-start-1 text-primary'>
      <Check aria-hidden='true' className='size-4' />
    </BaseSelect.ItemIndicator>
    <BaseSelect.ItemText className='col-start-2'>
      {children}
    </BaseSelect.ItemText>
  </BaseSelect.Item>
);
