import { useState } from 'react';
import { ScanEye } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { VIEW_AS_PROFILES } from '../../utils/permissions';
import { cn } from '../../utils/cn';
import { Menu, type MenuItem } from '../ui/Menu';
import { Tooltip } from '../ui/Tooltip';
import { useT } from '../../i18n/useT';
import { roleLabel } from '../../utils/workspaceDisplay';
import { useOrgMembers } from '../../hooks/useWorkspace';

/**
 * "Visualizar como…" (Régua) — simula outro perfil (Membro, Convidado B2B, Visitante leitor/
 * comentador/editor) para testar permissões, bloqueio protegido e Modo Privado sozinho.
 * Só altera o CONTEXTO de permissão (`useAppStore.session.viewAs`), nunca os dados.
 */
/** Itens do "Visualizar como…" (Régua da Mesa e cartão "Ver como…" da gaveta Facilitar do Estúdio v2). */
export function useViewAsItems(scope: 'board' | 'workspace', close: () => void): MenuItem[] {
  const t = useT();
  const viewAs = useAppStore((s) => s.session.viewAs);
  const setViewAs = useAppStore((s) => s.setViewAs);
  const myRole = useAppStore((s) => s.session.workspaceRole);
  const me = useAppStore((s) => s.session.userId);
  const members = useOrgMembers();
  const setMenu = (_v: null) => close();
  // Chat 06: contas do diretório (usuários simulados e colegas) — a Mesa e o board passam a ver o que ELAS veem
  const people = members.filter((a) => a.id !== me && a.status === 'active');

  const items: MenuItem[] = [
    { kind: 'label', id: 'l', label: scope === 'workspace' ? t('workspace.viewAs.title') : t('board.viewAsMenu.viewBoardAs') },
    { kind: 'radio', id: 'me', label: t('workspace.viewAs.myself', { role: roleLabel(myRole) }), checked: !viewAs, onSelect: () => {
        setViewAs(null);
        setMenu(null);
      },
    },
    ...(people.length
      ? [
          { kind: 'separator', id: 's-people' } as MenuItem,
          { kind: 'label', id: 'l-people', label: t('workspace.viewAs.people') } as MenuItem,
          ...people.map(
            (a): MenuItem => ({
              kind: 'radio',
              id: `user-${a.id}`,
              label: t('share.people.option', { name: a.name, role: roleLabel(a.role) }),
              checked: viewAs?.simulatedUserId === a.id,
              onSelect: () => {
                setViewAs({ label: a.name, workspaceRole: a.role, isFacilitator: false, simulatedUserId: a.id });
                setMenu(null);
              },
            }),
          ),
        ]
      : []),
    { kind: 'separator', id: 's' },
    { kind: 'label', id: 'l-profiles', label: t('workspace.viewAs.profiles') },
    ...VIEW_AS_PROFILES.map(
      (p): MenuItem => ({
        kind: 'radio',
        id: p.id,
        label: p.profile.labelKey ? t(p.profile.labelKey) : p.profile.label,
        checked: !viewAs?.simulatedUserId && viewAs?.label === p.profile.label,
        onSelect: () => {
          setViewAs(p.profile);
          setMenu(null);
        },
      }),
    ),
    { kind: 'separator', id: 's2' },
    {
      kind: 'custom',
      id: 'note',
      render: () => <p className="max-w-[250px] px-2.5 pb-1.5 text-xs leading-relaxed text-ink-subtle">{t('board.viewAsMenu.onlyChangesPermissionsThisScreen')}</p>,
    },
  ];
  return items;
}

export function ViewAsMenu({ scope = 'board' }: { scope?: 'board' | 'workspace' }) {
  const t = useT();
  const viewAs = useAppStore((s) => s.session.viewAs);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const items = useViewAsItems(scope, () => setMenu(null));

  return (
    <>
      <Tooltip label={t('board.viewAsMenu.viewAsSimulateProfiles')} side="bottom" disabled={!!menu}>
        <button
          type="button"
          data-od-menu-trigger
          className={cn('od-btn od-btn-sm h-8 px-2', viewAs ? 'od-btn-soft text-brand-900 dark:text-brand-200' : 'od-btn-ghost text-ink-muted')}
          aria-haspopup="menu"
          aria-expanded={!!menu}
          aria-label={viewAs ? t('board.viewAsMenu.viewingAsLabel', { label: viewAs.labelKey ? t(viewAs.labelKey) : viewAs.label }) : t('board.viewAsMenu.viewAs')}
          onClick={(e) => {
            if (menu) {
              setMenu(null);
              return;
            }
            const r = e.currentTarget.getBoundingClientRect();
            setMenu({ x: r.right, y: r.bottom + 8 });
          }}
        >
          <ScanEye size={16} />
          <span className="hidden max-w-[150px] truncate min-[1600px]:inline">{viewAs ? (viewAs.labelKey ? t(viewAs.labelKey) : viewAs.label) : t('board.viewAsMenu.viewAs')}</span>
        </button>
      </Tooltip>
      {menu && <Menu items={items} x={menu.x} y={menu.y} align="end" minWidth={260} onClose={() => setMenu(null)} />}
    </>
  );
}
