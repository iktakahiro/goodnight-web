import { AlertDialog as BaseAlertDialog } from '@base-ui/react/alert-dialog';
import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

/** A confirmation dialog (Base UI AlertDialog). */
export const AlertDialog = BaseAlertDialog.Root;

/** The element that opens the dialog. Use `render` to style it as a button. */
export const AlertDialogTrigger = BaseAlertDialog.Trigger;

/** Closes the dialog. Use `render` to style it as a button. */
export const AlertDialogClose = BaseAlertDialog.Close;

/** The dialog with a dimmed backdrop. */
export const AlertDialogContent = ({
  className,
  ...props
}: ComponentProps<typeof BaseAlertDialog.Popup>) => (
  <BaseAlertDialog.Portal>
    <BaseAlertDialog.Backdrop className='fixed inset-0 z-40 min-h-dvh bg-overlay/35 dark:bg-overlay/65 backdrop-blur-[2px] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-[-webkit-touch-callout:none]:absolute' />
    <BaseAlertDialog.Popup
      className={cn(
        'fixed top-1/2 left-1/2 z-50 flex w-[28rem] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-2xl shadow-primary/15 outline-none transition-[scale,opacity] duration-150 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 sm:p-7',
        className,
      )}
      {...props}
    />
  </BaseAlertDialog.Portal>
);

/** The dialog title. */
export const AlertDialogTitle = ({
  className,
  ...props
}: ComponentProps<typeof BaseAlertDialog.Title>) => (
  <BaseAlertDialog.Title
    className={cn('text-lg leading-snug font-semibold', className)}
    {...props}
  />
);

/** The dialog's explanation. */
export const AlertDialogDescription = ({
  className,
  ...props
}: ComponentProps<typeof BaseAlertDialog.Description>) => (
  <BaseAlertDialog.Description
    className={cn('text-[0.95rem] text-muted-foreground', className)}
    {...props}
  />
);
