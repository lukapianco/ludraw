
import { EyeOff } from 'lucide-react';
import { useBoardStore } from '../../store/useBoardStore';
import { useCan } from '../../hooks/useCan';
import { cn } from '../../utils/cn';
import {  type MenuItem } from '../ui/Menu';

import { useT } from '../../i18n/useT';

/**
 * Popover "Modo Privado (Criação Cega)" da Régua. Ligar e revelar exigem `privateMode.toggle`/
 * `privateMode.reveal` (facilitador) — a checagem real fica nas ações do store; aqui só explicamos.
 */
/** Itens do Modo Privado (Régua antiga e cartão "Modo Privado" da gaveta Facilitar do Estúdio v2). */
export function usePrivateModeItems(): MenuItem[] {
  const t = useT();
  const enabled = useBoardStore((s) => s.facilitation.privateMode.enabled);
  const simulate = useBoardStore((s) => s.facilitation.privateMode.previewOwnNotes);
  const drafts = useBoardStore((s) => s.elementOrder.reduce((n, id) => (s.elements[id]?.type === 'sticky' && (s.elements[id] as { isPrivateDraft?: boolean }).isPrivateDraft ? n + 1 : n), 0));
  const toggle = useCan('privateMode.toggle');
  const reveal = useCan('privateMode.reveal');
  const b = useBoardStore.getState;

  const items: MenuItem[] = [
    {
      kind: 'custom',
      id: 'head',
      render: () => (
        <div className="max-w-[300px] px-2.5 pb-2 pt-1.5">
          <div className="text-sm font-bold text-ink">{t('board.privateModeMenu.privateModeBlindCreation')}</div>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">{t('board.privateModeMenu.whileItsEachNewSticky')}</p>
          <div className={cn('mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold', enabled ? 'bg-success-soft text-success' : 'bg-panel-sunken text-ink-subtle')}>
            <span className={cn('h-1.5 w-1.5 rounded-full', enabled ? 'bg-success' : 'bg-ink-subtle')} />
            {t('board.privateModeMenu.statusDrafts', { status: enabled ? t('board.privateModeMenu.on') : t('board.privateModeMenu.off'), count: drafts })}
          </div>
        </div>
      ),
    },
    { kind: 'separator', id: 's0' },
    { kind: 'toggle', id: 'enabled', label: t('board.privateModeMenu.turnPrivateMode'), checked: enabled, onToggle: () => b().setPrivateMode(!enabled) },
    { kind: 'toggle', id: 'simulate', label: t('board.privateModeMenu.simulateAnotherParticipantsView'), checked: simulate, onToggle: () => b().togglePreviewAsParticipant() },
    { kind: 'separator', id: 's1' },
    {
      kind: 'item',
      id: 'reveal',
      label: drafts ? t('board.privateModeMenu.endRevealAllCount', { count: drafts }) : t('board.privateModeMenu.endRevealAll'),
      icon: <EyeOff size={16} />,
      disabled: !enabled && drafts === 0,
      onSelect: () => b().revealPrivateNotes(),
    },
    ...(!toggle.allowed || !reveal.allowed
      ? [
          {
            kind: 'custom' as const,
            id: 'perm',
            render: () => <p className="max-w-[300px] px-2.5 pb-1.5 pt-1 text-xs leading-relaxed text-warning">{toggle.reason ?? reveal.reason}</p>,
          },
        ]
      : []),
  ];
  return items;
}
