import ArrowRotateRight from '@gravity-ui/icons/ArrowRotateRight';
import { cn } from './cn.ts';

/** A spinning icon. Pair it with visible or screen-reader text. */
export const Spinner = ({ className }: { className?: string }) => (
  <ArrowRotateRight
    aria-hidden='true'
    className={cn('size-4 animate-spin motion-reduce:animate-none', className)}
  />
);
