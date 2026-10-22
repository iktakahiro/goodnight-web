import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from './cn.ts';

const noticeVariants = cva(
  'flex gap-3.5 rounded-2xl border p-4 sm:p-5 [&>svg]:mt-0.5 [&>svg]:size-5 [&>svg]:shrink-0',
  {
    variants: {
      tone: {
        warning:
          'border-warning-border bg-warning-soft text-warning-foreground [&>svg]:text-warning-icon',
        info: 'border-border bg-card/70 text-muted-foreground [&>svg]:text-primary',
        error:
          'border-destructive/25 bg-destructive-soft text-destructive [&>svg]:text-destructive',
      },
    },
    defaultVariants: { tone: 'info' },
  },
);

/**
 * A message box with an icon. Pass `role="alert"` for errors that appear
 * after an action, so screen readers announce them.
 */
export const Notice = ({
  className,
  tone,
  icon,
  title,
  children,
  ...props
}: Omit<ComponentProps<'div'>, 'title'> &
  VariantProps<typeof noticeVariants> & {
    icon: ReactNode;
    title?: ReactNode;
  }) => (
  <div className={cn(noticeVariants({ tone }), className)} {...props}>
    {icon}
    <div className='flex min-w-0 flex-col gap-1 text-[0.9rem] leading-relaxed'>
      {title ? <p className='font-semibold'>{title}</p> : null}
      {children}
    </div>
  </div>
);
