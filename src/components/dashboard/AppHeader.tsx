import { useState } from 'react';
import { Bell, Building2, Keyboard, LogOut, Moon, Palette, Search, Settings, Sun, UserPlus } from 'lucide-react';
import { ViewAsMenu } from '../toolbar/ViewAsMenu';
import { useWorkspaceCan } from '../../hooks/useWorkspace';
import { useDesignSystemEnabled } from '../../hooks/useDesignSystemGate';
import { notifyInDevelopment, useAppStore } from '../../store/useAppStore';
import { initials, shortcutLabel } from '../../utils/format';
import { Logo } from '../ui/Logo';
import { Menu } from '../ui/Menu';
import { Tooltip } from '../ui/Tooltip';
import { SpaceSwitcher } from './SpaceSwitcher';
import { useT } from '../../i18n/useT';

/**
 * Cabeçalho docado da Mesa (52 px, ponta a ponta): marca · seletor de espaço em trilha ·
 * campo de busca/paleta (Ctrl+K) · notificações, Convidar e menu do avatar.
 */
export function AppHeader({ onOpenPalette }: { onOpenPalette: () => void }) {
  const t = useT();
  const user = useAppStore((s) => s.user);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const navigate = useAppStore((s) => s.navigate);
  const logout = useAppStore((s) => s.logout);
  const openModal = useAppStore((s) => s.openModal);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  // Chat 06: só admin vê a Administração; convidar segue can('workspace.members.invite')
  const admin = useWorkspaceCan('workspace.admin.view');
  // Chat 09 · R5: "Sistema visual" só quando a instalação deixa (LUDRAW_ENABLE_DESIGN_SYSTEM)
  const designSystem = useDesignSystemEnabled();
  const invite = useWorkspaceCan('workspace.members.invite');
  const guests = useWorkspaceCan('workspace.guests.invite');

  return (
    <header className="relative z-30 flex h-[52px] shrink-0 items-center gap-1.5 border-b border-line bg-panel px-2.5 md:gap-3 md:px-4">
      <div className="flex min-w-0 items-center gap-1">
        <button type="button" onClick={() => navigate({ name: 'dashboard' })} aria-label={t('dashboard.appHeader.ludrawHome')} className="shrink-0 rounded-lg p-1">
          <Logo markSize={24} className="[&>span:last-child]:hidden sm:[&>span:last-child]:inline" />
        </button>
        <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden="true" />
        <SpaceSwitcher />
      </div>

      <div className="flex min-w-0 flex-1 justify-center">
        <button
          type="button"
          onClick={onOpenPalette}
          className="flex h-9 w-full max-w-[440px] items-center gap-2.5 rounded-lg bg-panel-sunken px-3 text-start text-[13px] text-ink-subtle ring-1 ring-line transition-all duration-base ease-out hover:ring-line-strong"
          aria-label={t('dashboard.appHeader.searchBoardsActions')}
          aria-keyshortcuts="Control+K"
        >
          <Search size={16} className="shrink-0" />
          <span className="hidden flex-1 truncate sm:block">{t('dashboard.appHeader.searchBoardsActions2')}</span>
          <span className="od-kbd ms-auto hidden rounded-md bg-panel px-1.5 py-0.5 ring-1 ring-line md:inline-flex">{shortcutLabel('Ctrl K')}</span>
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Tooltip label={t('dashboard.appHeader.notifications')}>
          <button type="button" className="od-tool" onClick={() => notifyInDevelopment(t('dashboard.appHeader.notifications'), t('dashboard.appHeader.chat07RealTimeCollaboration'))} aria-label={t('dashboard.appHeader.notifications')}>
            <Bell size={18} />
          </button>
        </Tooltip>
        <span className="hidden md:inline-flex">
          <ViewAsMenu scope="workspace" />
        </span>
        <Tooltip label={invite.allowed || guests.allowed ? t('dashboard.appHeader.invite') : (invite.reason ?? '')}>
          <button
            type="button"
            className="od-btn od-btn-secondary od-btn-sm hidden md:inline-flex"
            disabled={!invite.allowed && !guests.allowed}
            onClick={() => openModal({ type: 'invite', role: invite.allowed ? 'member' : 'guest_b2b' })}
          >
            <UserPlus size={15} />{' '}{t('dashboard.appHeader.invite')}</button>
        </Tooltip>
        <button
          type="button"
          data-od-menu-trigger
          aria-haspopup="menu"
          aria-expanded={!!menu}
          onClick={(e) => {
            if (menu) {
              setMenu(null);
              return;
            }
            const r = e.currentTarget.getBoundingClientRect();
            setMenu({ x: r.right, y: r.bottom + 6 });
          }}
          className="ms-1 flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-bold text-white ring-2 ring-transparent transition hover:ring-brand-300"
          style={{ background: user?.color ?? '#194B32' }}
          aria-label={t('dashboard.appHeader.userMenu')}
        >
          {/* Chat 08.6 · A (D-13): iniciais são decorativas; o nome do botão é "Menu do usuário" */}
          <span aria-hidden="true">{initials(user?.name ?? '?')}</span>
        </button>
      </div>

      {menu && (
        <Menu
          x={menu.x}
          y={menu.y}
          align="end"
          minWidth={240}
          onClose={() => setMenu(null)}
          items={[
            {
              kind: 'custom',
              id: 'who',
              render: () => (
                <div className="px-2.5 pb-2 pt-1.5">
                  <div className="text-sm font-bold text-ink">{user?.name}</div>
                  <div className="text-xs text-ink-subtle">{user?.guest ? t('dashboard.appHeader.offlineModeNoAccount') : user?.email}</div>
                </div>
              ),
            },
            { kind: 'separator', id: 's0' },
            { kind: 'item', id: 'settings', label: t('common.settings'), icon: <Settings size={16} />, onSelect: () => navigate({ name: 'settings', tab: 'profile' }) },
            ...(admin.allowed
              ? [{ kind: 'item' as const, id: 'admin', label: t('admin.nav.title'), icon: <Building2 size={16} />, onSelect: () => navigate({ name: 'admin', section: 'overview' }) }]
              : []),
            ...(designSystem ? [{ kind: 'item' as const, id: 'ds', label: t('common.visualSystem'), icon: <Palette size={16} />, onSelect: () => navigate({ name: 'design-system' }) }] : []),
            { kind: 'item', id: 'theme', label: theme === 'dark' ? t('common.lightMode') : t('common.darkMode'), icon: theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />, onSelect: toggleTheme },
            { kind: 'item', id: 'shortcuts', label: t('dashboard.appHeader.keyboardShortcuts'), icon: <Keyboard size={16} />, shortcut: '?', onSelect: () => openModal({ type: 'shortcuts' }) },
            { kind: 'separator', id: 's1' },
            { kind: 'item', id: 'logout', label: t('dashboard.appHeader.signOut'), icon: <LogOut size={16} />, onSelect: logout },
          ]}
        />
      )}
    </header>
  );
}
