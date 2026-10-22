import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

/** Class names for small rounded labels. */
export const badgeVariants = cva(
  'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs leading-5 font-medium whitespace-nowrap [&_svg]:size-3',
  {
    variants: {
      tone: {
        violet: 'border-primary/20 bg-accent text-accent-foreground',
        slate: 'border-border bg-muted text-muted-foreground',
        mint: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        amber: 'border-amber-200 bg-amber-50 text-amber-900',
        rose: 'border-rose-200 bg-rose-50 text-rose-800',
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
