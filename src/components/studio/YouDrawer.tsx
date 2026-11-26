/**
 * LuDraw — gaveta Você (Chat 08.2 · B, `STUDIO_V2_SPEC.md` §3.2): preferências pessoais em seções de chaves —
 * Aparência · Edição · Acessibilidade · Avisos — e os atalhos para "Atalhos e ajuda" (`?`) e as configurações do perfil.
 * Substitui ⋯ → Preferências/Acessibilidade, o tema do menu e o rodapé do antigo Painel. As mesmas preferências de antes
 * (`useAppStore.preferences`); "Abrir sempre no app para desktop" só aparece quando o app desktop existir.
 */
import type { ReactNode } from 'react';
import { Keyboard, UserRound } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useBoardStore } from '../../store/useBoardStore';
import type { InputDevice } from '../../types/workspace';
import { persistCurrentBoard } from '../../utils/boardActions';
import { cn } from '../../utils/cn';
import { useT } from '../../i18n/useT';
import { Switch } from '../ui/Menu';
import { StudioDrawer } from './StudioDrawer';
import { useStudioUi } from './studioUi';
import { LocalModeNotice } from '../dashboard/LocalModeBanner';

type BoolPref = Parameters<ReturnType<typeof useAppStore.getState>['togglePreference']>[0];

/** O app desktop ainda não existe (Chat 09): a chave fica escondida até lá. */
const DESKTOP_APP_AVAILABLE = false;

export function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="px-4 pb-1 pt-3 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{children}</div>;
}

export function PrefSwitch({ pref, label, onAfter }: { pref: BoolPref; label: string; onAfter?: (value: boolean) => void }) {
  const value = useAppStore((s) => s.preferences[pref] as boolean);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      data-pref={pref}
      className="od-menu-item mx-1.5 w-[calc(100%-12px)] justify-between"
      onClick={() => {
        useAppStore.getState().togglePreference(pref);
        onAfter?.(!value);
      }}
    >
      <span className="text-[13px]">{label}</span>
      <Switch checked={value} />
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="mx-4 my-1 flex rounded-lg bg-panel-sunken p-0.5 ring-1 ring-line">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn('h-7 flex-1 rounded-md px-2 text-[12.5px] font-semibold transition-colors', value === o.id ? 'bg-panel text-ink shadow-panel' : 'text-ink-muted hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function YouDrawer() {
  const t = useT();
  const theme = useAppStore((s) => s.theme);
  const device = useAppStore((s) => s.preferences.inputDevice);
  const user = useAppStore((s) => s.user);
  return (
    <StudioDrawer id="you" title={user?.name ?? t('studio.you.title')} width={320} from="top">
      <div className="pb-2" data-testid="you-drawer">
        {/* Chat 08.5 · D: Modo Local com servidor disponível — aviso e "Entrar no servidor" no topo */}
        <LocalModeNotice />
        <SectionTitle>{t('studio.you.appearance')}</SectionTitle>
        <button type="button" role="switch" aria-checked={theme === 'dark'} className="od-menu-item mx-1.5 w-[calc(100%-12px)] justify-between" onClick={() => useAppStore.getState().toggleTheme()}>
          <span className="text-[13px]">{t('studio.you.darkTheme')}</span>
          <Switch checked={theme === 'dark'} />
        </button>

        <SectionTitle>{t('studio.you.editing')}</SectionTitle>
        <div className="px-4 pb-0.5 text-[12px] text-ink-muted">{t('studio.you.navigateWith')}</div>
        <Segmented<InputDevice>
          label={t('studio.you.navigateWith')}
          value={device}
          onChange={(v) => useAppStore.getState().setPreference('inputDevice', v)}
          options={[
            { id: 'auto', label: t('studio.you.deviceAuto') },
            { id: 'mouse', label: t('menus.boardMenu.mouse') },
            { id: 'trackpad', label: t('menus.boardMenu.trackpad') },
          ]}
        />
        <PrefSwitch pref="selectOnTouch" label={t('menus.boardMenu.selectJustHoveringOver')} />

        <SectionTitle>{t('menus.boardMenu.accessibility')}</SectionTitle>
        <PrefSwitch pref="preciseSelection" label={t('menus.boardMenu.preciseSelection')} />
        <PrefSwitch pref="reduceMotion" label={t('menus.boardMenu.reduceMotion')} />
        <PrefSwitch pref="singleKeyShortcuts" label={t('menus.boardMenu.singleKeyKeyboardShortcuts')} />

        <SectionTitle>{t('studio.you.notices')}</SectionTitle>
        <PrefSwitch pref="doNotDisturb" label={t('menus.boardMenu.doNotDisturb')} />
        {DESKTOP_APP_AVAILABLE && <PrefSwitch pref="alwaysOpenDesktop" label={t('menus.boardMenu.alwaysOpenDesktopApp')} />}

        <div className="mx-3 my-2 border-t border-line" />
        <button
          type="button"
          className="od-menu-item mx-1.5 w-[calc(100%-12px)]"
          onClick={() => {
            useStudioUi.getState().close();
            useAppStore.getState().openModal({ type: 'shortcuts' });
          }}
        >
          <Keyboard size={16} className="text-ink-muted" /> <span className="flex-1 text-[13px]">{t('board.topBar.shortcutsHelp')}</span> <span className="od-kbd">?</span>
        </button>
        <button
          type="button"
          className="od-menu-item mx-1.5 w-[calc(100%-12px)]"
          onClick={async () => {
            useStudioUi.getState().close();
            await persistCurrentBoard(true);
            const from = useBoardStore.getState().boardId ?? undefined;
            useAppStore.getState().navigate({ name: 'settings', tab: 'profile', from });
          }}
        >
          <UserRound size={16} className="text-ink-muted" /> <span className="flex-1 text-[13px]">{t('menus.boardMenu.profileSettings')}</span>
        </button>
      </div>
    </StudioDrawer>
  );
}
