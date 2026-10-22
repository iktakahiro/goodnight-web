import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

/** A pulsing placeholder shown while content loads. */
export const Skeleton = ({ className, ...props }: ComponentProps<'div'>) => (
  <div
    aria-hidden='true'
    className={cn('animate-pulse rounded-md bg-accent/70', className)}
    {...props}
  />
);
