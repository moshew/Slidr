import { useTranslation } from 'react-i18next';
import { Button, Dialog, DialogContent } from '@slidr/ui';

/**
 * The approval a CLI's installation needs before `HarnessSetup.run(id, 'install')`: asked for the
 * agent's harness, and for the CLI an image provider runs on.
 */
export function InstallDialog({
  name,
  open,
  onClose,
  onApprove,
}: {
  name: string | undefined;
  open: boolean;
  onClose: () => void;
  onApprove: () => void;
}) {
  const { t } = useTranslation('settings');
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        title={t('agent.installTitle', { name })}
        description={t('agent.installDescription', { name })}
        closeLabel={t('keys.cancel')}
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              {t('keys.cancel')}
            </Button>
            <Button
              onClick={() => {
                onClose();
                onApprove();
              }}
            >
              {t('agent.approveInstall')}
            </Button>
          </>
        }
      />
    </Dialog>
  );
}
