import { Button as BaseButton } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

/** Class names for buttons and button-like links. */
export const buttonVariants = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-55 data-disabled:cursor-not-allowed data-disabled:opacity-55 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-accent',
        outline:
          'border border-border bg-card text-foreground shadow-xs hover:border-ring/50 hover:bg-muted',
        ghost: 'text-foreground hover:bg-accent hover:text-accent-foreground',
        destructive:
          'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive-hover',
        'destructive-outline':
          'border border-destructive/30 bg-card text-destructive hover:bg-destructive-soft',
        link: 'h-auto rounded-sm px-0 text-link underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-9 px-3.5 text-sm',
        md: 'h-11 px-5 text-[0.95rem]',
        lg: 'h-12 px-6 text-base',
        icon: 'size-10',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

/** A button (Base UI Button) in one of the theme's variants. */
export const Button = ({
  className,
  variant,
  size,
  type = 'button',
  ...props
}: ComponentProps<typeof BaseButton> & VariantProps<typeof buttonVariants>) => (
  <BaseButton
    type={type}
    className={cn(buttonVariants({ variant, size }), className)}
    {...props}
  />
);
