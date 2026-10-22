import { Tabs as BaseTabs } from '@base-ui/react/tabs';
import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

/** Tabs (Base UI Tabs). */
export const Tabs = BaseTabs.Root;

/** A pill-shaped tab list that scrolls sideways on narrow screens. */
export const TabsList = ({
  className,
  children,
  ...props
}: ComponentProps<typeof BaseTabs.List>) => (
  <BaseTabs.List
    className={cn(
      'relative z-0 flex w-max max-w-full gap-1 overflow-x-auto rounded-full border border-border/80 bg-card/80 p-1 shadow-xs',
      className,
    )}
    {...props}
  >
    {children}
    <BaseTabs.Indicator className='absolute top-1/2 left-0 -z-1 h-[calc(100%-0.5rem)] w-(--active-tab-width) translate-x-(--active-tab-left) -translate-y-1/2 rounded-full bg-accent transition-[translate,width] duration-200 ease-out motion-reduce:transition-none' />
  </BaseTabs.List>
);

/** One tab. */
export const TabsTab = ({
  className,
  ...props
}: ComponentProps<typeof BaseTabs.Tab>) => (
  <BaseTabs.Tab
    className={cn(
      'inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none select-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/60 data-active:text-accent-foreground',
      className,
    )}
    {...props}
  />
);

/** The content for the active tab. */
export const TabsPanel = ({
  className,
  ...props
}: ComponentProps<typeof BaseTabs.Panel>) => (
  <BaseTabs.Panel className={cn('outline-none', className)} {...props} />
);
