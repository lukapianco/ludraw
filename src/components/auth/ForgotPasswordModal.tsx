import { KeyRound } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { useT } from '../../i18n/useT';
import { useAppStore } from '../../store/useAppStore';
import { isServerMode } from '../../utils/serverConfig';

/**
 * Chat 07 · B — "Esqueci minha senha". Sem e-mail (SMTP fica para depois, decisão do usuário), não há
 * redefinição pela própria pessoa: no servidor, explica quem redefine (admin da organização ou quem opera o
 * servidor, com a CLI); no Modo Local, que a conta só existe neste navegador.
 */
export function ForgotPasswordModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const sso = useAppStore((s) => s.serverInfo?.sso.enabled);
  const server = isServerMode();
  return (
    <Modal
      open
      onClose={onClose}
      width={440}
      icon={<KeyRound size={18} />}
      title={t('server.forgot.title')}
      footer={
        <button type="button" className="od-btn od-btn-primary" onClick={onClose}>
          {t('server.forgot.ok')}
        </button>
      }
    >
      <div className="space-y-3 text-sm text-ink-muted">
        <p>{server ? t('server.forgot.server') : t('server.forgot.local')}</p>
        {server && sso && <p>{t('server.forgot.serverSso')}</p>}
      </div>
    </Modal>
  );
}
