import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

/** A white, rounded surface. */
export const Card = ({ className, ...props }: ComponentProps<'div'>) => (
  <div
    className={cn(
      'rounded-2xl border border-border/80 bg-card text-card-foreground shadow-(--shadow-soft)',
      className,
    )}
    {...props}
  />
);

/** Padding and spacing for the top of a card. */
export const CardHeader = ({ className, ...props }: ComponentProps<'div'>) => (
  <div
    className={cn('flex flex-col gap-1.5 p-6 pb-0 sm:p-8 sm:pb-0', className)}
    {...props}
  />
);

/** A card title. Pass `render`-free markup: it renders an `<h2>` by default. */
export const CardTitle = ({ className, ...props }: ComponentProps<'h2'>) => (
  <h2
    className={cn(
      'text-xl leading-snug font-semibold tracking-tight',
      className,
    )}
    {...props}
  />
);

/** Secondary text under a card title. */
export const CardDescription = ({
  className,
  ...props
}: ComponentProps<'p'>) => (
  <p className={cn('text-sm text-muted-foreground', className)} {...props} />
);

/** The main content area of a card. */
export const CardContent = ({ className, ...props }: ComponentProps<'div'>) => (
  <div className={cn('p-6 sm:p-8', className)} {...props} />
);
