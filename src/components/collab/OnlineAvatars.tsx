import { useCollabUi } from '../../collab/presenceStore';
import { COLLABORATOR_PALETTE, presenceColor } from '../../collab/protocol';
import { useT } from '../../i18n/useT';
import { useBoardStore } from '../../store/useBoardStore';
import { cn } from '../../utils/cn';
import { initials } from '../../utils/format';
import { Tooltip } from '../ui/Tooltip';

/** Quantas pessoas além de mim aparecem antes do "+N" (Design System › Componentes base › Avatares e selos). */
const SHOWN = 3;

const AVATAR = 'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ring-2';

/**
 * Pilha de avatares da barra do topo (Design System › Componentes base › "Avatares e selos"): círculos sobrepostos com anel na cor
 * do painel, a própria pessoa primeiro e um contador "+N" no fim. No board ao vivo (Chat 08) os outros entram na
 * pilha; clicar em alguém segue a câmera dela (o anel fica na cor de seleção).
 */
export function OnlineAvatars({ selfName, selfColor, selfLabel, hideSelf = false }: { selfName: string; selfColor: string; selfLabel: string; hideSelf?: boolean }) {
  const t = useT();
  const users = useCollabUi((s) => s.users);
  const following = useCollabUi((s) => s.following);
  const follow = useCollabUi((s) => s.follow);
  const me = useBoardStore((s) => s.access.userId);
  const others = users.filter((u) => u.id !== me);
  const shown = others.slice(0, SHOWN);
  const rest = others.length - shown.length;

  return (
    <div className="mx-1 flex items-center -space-x-2" role="group" aria-label={t('collab.presence.title')} data-od-follow-ui data-testid="online-avatars">
      {/* Chat 08.2 (Estúdio v2): a própria pessoa fica no botão Você, fora da pilha */}
      {!hideSelf && (
        <Tooltip label={selfLabel} side="bottom">
          <span className={cn(AVATAR, 'relative z-[1] text-white ring-[var(--od-panel)]')} style={{ background: selfColor }} data-self-avatar>
            {initials(selfName)}
          </span>
        </Tooltip>
      )}
      {/* telas estreitas (< 760 px): só o contador de quem está aqui */}
      {others.length > 0 && (
        <Tooltip label={others.map((u) => u.name).join(', ')} side="bottom">
          <span className={cn(AVATAR, 'relative bg-panel-sunken text-ink-muted ring-[var(--od-panel)] min-[760px]:hidden')} data-narrow-count>
            {t('collab.presence.moreCount', { count: others.length })}
          </span>
        </Tooltip>
      )}
      {shown.map((u) => {
        const on = following === u.id;
        const label = on ? t('collab.follow.stopClick', { name: u.name }) : t('collab.follow.click', { name: u.name });
        return (
          <Tooltip key={u.id} label={label} side="bottom">
            <button
              type="button"
              data-od-avatar
              onClick={() => follow(u.id)}
              aria-pressed={on}
              aria-label={label}
              data-user-id={u.id}
              className={cn(AVATAR, 'relative text-white transition-transform duration-fast hover:z-10 hover:-translate-y-0.5 max-[759px]:hidden', on ? 'z-[2] ring-[var(--od-selection)]' : 'ring-[var(--od-panel)]')}
              style={{ background: u.color || presenceColor(u.id, COLLABORATOR_PALETTE) }}
            >
              {initials(u.name)}
            </button>
          </Tooltip>
        );
      })}
      {rest > 0 && (
        <Tooltip label={others.slice(SHOWN).map((u) => u.name).join(', ')} side="bottom">
          <span className={cn(AVATAR, 'relative bg-panel-sunken text-ink-muted ring-[var(--od-panel)] max-[759px]:hidden')} data-more-count>
            {t('collab.presence.moreCount', { count: rest })}
          </span>
        </Tooltip>
      )}
    </div>
  );
}
