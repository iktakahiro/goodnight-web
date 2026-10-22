import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

/** A dialog (Base UI Dialog). */
export const Dialog = BaseDialog.Root;

/** The element that opens the dialog. Use `render` to style it as a button. */
export const DialogTrigger = BaseDialog.Trigger;

/** Closes the dialog. Use `render` to style it as a button. */
export const DialogClose = BaseDialog.Close;

/** The dialog with a dimmed backdrop. Its content scrolls when it is tall. */
export const DialogContent = ({
  className,
  ...props
}: ComponentProps<typeof BaseDialog.Popup>) => (
  <BaseDialog.Portal>
    <BaseDialog.Backdrop className='fixed inset-0 z-40 min-h-dvh bg-foreground/30 backdrop-blur-[2px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-[-webkit-touch-callout:none]:absolute' />
    <BaseDialog.Popup
      className={cn(
        'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[36rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-y-auto rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-2xl shadow-primary/15 outline-none transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 sm:p-7',
        className,
      )}
      {...props}
    />
  </BaseDialog.Portal>
);

/** The dialog title. */
export const DialogTitle = ({
  className,
  ...props
}: ComponentProps<typeof BaseDialog.Title>) => (
  <BaseDialog.Title
    className={cn('text-lg leading-snug font-semibold', className)}
    {...props}
  />
);

/** The dialog's explanation. */
export const DialogDescription = ({
  className,
  ...props
}: ComponentProps<typeof BaseDialog.Description>) => (
  <BaseDialog.Description
    className={cn('text-[0.95rem] text-muted-foreground', className)}
    {...props}
  />
);
