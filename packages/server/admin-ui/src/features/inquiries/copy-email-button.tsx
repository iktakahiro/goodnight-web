import Copy from '@gravity-ui/icons/Copy';
import { useI18n } from '../../shared/i18n/i18n-provider.tsx';
import { Button } from '../../shared/ui/button.tsx';
import { showToast } from '../../shared/ui/toast.tsx';
import { copyText } from './copy-text.ts';

/**
 * A small icon button that copies the sender's email address, for admins who
 * reply from webmail or have no mail client behind the `mailto:` link. It
 * shows a toast with the result.
 */
export const CopyEmailButton = ({ email }: { email: string }) => {
  const { t } = useI18n();
  const copy = async () => {
    if (await copyText(email)) showToast(t('detail.emailCopied'));
    else showToast(t('detail.emailCopyFailed'), 'error');
  };
  return (
    <Button
      variant='ghost'
      size='icon'
      className='-my-1.5 size-8 text-muted-foreground hover:text-primary'
      aria-label={t('detail.copyEmail')}
      title={t('detail.copyEmail')}
      onClick={() => void copy()}
      data-testid='copy-email'
    >
      <Copy aria-hidden='true' />
    </Button>
  );
};
