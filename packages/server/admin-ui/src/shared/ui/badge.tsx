import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

/** Class names for small rounded labels. */
export const badgeVariants = cva(
  'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs leading-5 font-medium whitespace-nowrap [&_svg]:size-3',
  {
    variants: {
      tone: {
        violet: 'border-info-border bg-info-soft text-info-foreground',
        slate: 'border-border bg-muted text-muted-foreground',
        mint: 'border-success-border bg-success-soft text-success-foreground',
        amber: 'border-warning-border bg-warning-soft text-warning-foreground',
        rose: 'border-destructive-border bg-destructive-soft text-destructive',
        outline: 'border-border bg-card text-muted-foreground',
      },
    },
    defaultVariants: { tone: 'slate' },
  },
);

/** A small rounded label. */
export const Badge = ({
  className,
  tone,
  ...props
}: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) => (
  <span className={cn(badgeVariants({ tone }), className)} {...props} />
);
