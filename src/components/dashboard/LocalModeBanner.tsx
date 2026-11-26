/**
 * LuDraw — Chat 08.5 · D: aviso do Modo Local quando o servidor desta instalação existe e permite o Local.
 *  - Mesa: `LocalModeBanner`, faixa fixa (sem "Agora não") com "Entrar no servidor “<organização>”".
 *  - Board: `LocalOnlyBadge` ao lado do selo de estado da Ficha; abre a gaveta Você, que traz `LocalModeNotice` no topo.
 * Só aparece com `connection.mode === 'local' && connection.available` (Modo Local sem servidor continua sem aviso).
 * "Entrar no servidor" grava o board aberto e só então troca de modo; se a gravação falhar, desiste (fica no Local,
 * com o aviso de erro) para não perder nada. No servidor, a faixa "Trazer boards deste navegador" oferece trazê-los.
 *
 * Em que difere do padrão de mercado: em vez de uma barra global no topo da tela, o modo aparece no próprio selo de
 * estado do board (junto de "Salvo"), e o detalhe e a ação ficam na gaveta pessoal.
 */
import { useState, type MouseEvent } from 'react';
import { HardDrive, LoaderCircle, Server } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { persistCurrentBoard } from '../../utils/boardActions';
import { connection, switchMode } from '../../utils/serverConfig';
import { cn } from '../../utils/cn';
import { useT } from '../../i18n/useT';
import { t as tNow } from '../../i18n';
import { Tooltip } from '../ui/Tooltip';
import { useStudioUi } from '../studio/studioUi';

const DEMO_ORG = 'Empresa Exemplo';

/** Modo Local com o servidor desta instalação disponível? Devolve o nome da organização (para o botão). */
export function useLocalWithServer(demo = false): { org: string } | null {
  const t = useT();
  if (demo) return { org: DEMO_ORG };
  if (connection.mode !== 'local' || !connection.available) return null;
  return { org: connection.available.info?.organizationName ?? t('server.connect.sameOrigin') };
}

/**
 * Grava o board aberto (se houver) e volta ao Modo Servidor (recarrega). Gravação falhou = não troca de modo.
 * Devolve `false` quando desistiu.
 */
export async function enterServerFromLocal(): Promise<boolean> {
  const saved = await persistCurrentBoard(true, { silent: true });
  if (!saved) {
    useAppStore.getState().toast(tNow('server.localMode.saveFailed'), 'danger');
    return false;
  }
  switchMode({ mode: 'server' });
  return true;
}

function EnterServerButton({ org, demo, primary, testId }: { org: string; demo?: boolean; primary?: boolean; testId: string }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      data-testid={testId}
      className={cn('od-btn od-btn-sm h-7 max-w-full', primary ? 'od-btn-primary' : 'od-btn-secondary')}
      disabled={busy}
      onClick={async () => {
        if (demo) return;
        setBusy(true);
        if (!(await enterServerFromLocal())) setBusy(false);
      }}
    >
      {busy ? <LoaderCircle size={13} className="animate-spin" /> : <Server size={13} />}
      <span className="truncate">{t('server.connect.useServer', { org })}</span>
    </button>
  );
}

/** Faixa fixa da Mesa (sem dispensar). */
export function LocalModeBanner({ demo }: { demo?: boolean } = {}) {
  const t = useT();
  const local = useLocalWithServer(demo);
  if (!local) return null;
  return (
    <div role="status" data-testid="local-mode-banner" className="mt-4 flex flex-wrap items-center gap-2.5 rounded-xl bg-accent-soft px-3.5 py-2 text-[13px] text-ink ring-1 ring-line">
      <HardDrive size={16} className="shrink-0 text-brand-800 dark:text-brand-200" />
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{t('server.localMode.banner')}</span>
      <EnterServerButton org={local.org} demo={demo} testId="local-mode-enter" />
    </div>
  );
}

/** Selo da Ficha do board: abre a gaveta Você ancorada nele. Abaixo de 1180 px fica só o ícone. */
export function LocalOnlyBadge({ demo }: { demo?: boolean } = {}) {
  const t = useT();
  const local = useLocalWithServer(demo);
  const open = useStudioUi((s) => s.open === 'you');
  if (!local) return null;
  return (
    <Tooltip label={t('server.localMode.badgeHint')} side="bottom">
      <button
        type="button"
        data-testid="local-only-badge"
        data-studio-keep=""
        aria-haspopup="dialog"
        aria-expanded={!demo && open}
        aria-label={t('server.localMode.badge')}
        className="ms-0.5 inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full bg-accent-soft px-2 text-[12px] font-semibold text-brand-800 ring-1 ring-line transition-colors duration-base hover:bg-panel-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--od-selection)] dark:text-brand-200"
        onClick={(e: MouseEvent<HTMLButtonElement>) => {
          if (demo) return;
          useStudioUi.getState().toggle('you', e.currentTarget);
        }}
      >
        <HardDrive size={13} className="shrink-0" />
        <span className={demo ? 'whitespace-nowrap' : 'hidden max-w-[130px] truncate whitespace-nowrap min-[1180px]:inline'}>{t('server.localMode.badge')}</span>
      </button>
    </Tooltip>
  );
}

/** Bloco do topo da gaveta Você. */
export function LocalModeNotice({ demo }: { demo?: boolean } = {}) {
  const t = useT();
  const local = useLocalWithServer(demo);
  if (!local) return null;
  return (
    <div data-testid="local-mode-notice" className="mx-3 mt-3 min-w-0 rounded-xl bg-accent-soft px-3.5 py-3 text-[13px] text-ink ring-1 ring-line">
      <p className="flex min-w-0 items-center gap-1.5 font-semibold [overflow-wrap:anywhere]">
        <HardDrive size={15} className="shrink-0 text-brand-800 dark:text-brand-200" /> {t('server.localMode.noticeTitle')}
      </p>
      <p className="mt-1 text-ink-muted [overflow-wrap:anywhere]">{t('server.localMode.noticeText')}</p>
      <div className="mt-2.5">
        <EnterServerButton org={local.org} demo={demo} primary testId="local-notice-enter" />
      </div>
    </div>
  );
}
