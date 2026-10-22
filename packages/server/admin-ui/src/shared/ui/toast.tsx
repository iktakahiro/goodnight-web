import { Toast as BaseToast } from '@base-ui/react/toast';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

/** Shared toast manager, so any screen can show a toast. */
export const toastManager = BaseToast.createToastManager();

/** Shows a short message at the bottom of the screen. */
export const showToast = (
  title: string,
  type: 'success' | 'error' = 'success',
) =>
  toastManager.add({
    title,
    type,
    priority: type === 'error' ? 'high' : 'low',
  });

const ToastList = ({ closeLabel }: { closeLabel: string }) => {
  const { toasts } = BaseToast.useToastManager();
  return toasts.map((toast) => (
    <BaseToast.Root
      key={toast.id}
      toast={toast}
      className='flex items-center gap-3 rounded-2xl border border-border bg-card py-3 pr-2 pl-4 text-[0.95rem] text-card-foreground shadow-xl shadow-primary/15 transition-[opacity,translate] duration-200 data-ending-style:translate-y-2 data-ending-style:opacity-0 data-starting-style:translate-y-2 data-starting-style:opacity-0 data-[type=error]:border-destructive/30 data-[type=error]:text-destructive'
    >
      <BaseToast.Content className='min-w-0 flex-1'>
        <BaseToast.Title className='font-medium' />
      </BaseToast.Content>
      <BaseToast.Close
        aria-label={closeLabel}
        className='flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/60'
      >
        <X aria-hidden='true' className='size-4' />
      </BaseToast.Close>
    </BaseToast.Root>
  ));
};

/** Renders toasts from {@link toastManager}. Mount once near the root. */
export const ToastProvider = ({
  children,
  closeLabel,
}: {
  children: ReactNode;
  closeLabel: string;
}) => (
  <BaseToast.Provider toastManager={toastManager} timeout={4000}>
    {children}
    <BaseToast.Portal>
      <BaseToast.Viewport className='fixed right-4 bottom-4 left-4 z-50 mx-auto flex max-w-sm flex-col gap-2 sm:right-6 sm:bottom-6 sm:left-auto sm:w-sm'>
        <ToastList closeLabel={closeLabel} />
      </BaseToast.Viewport>
    </BaseToast.Portal>
  </BaseToast.Provider>
);
