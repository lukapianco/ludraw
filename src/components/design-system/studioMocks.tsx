/**
 * Réplicas PARADAS do Estúdio v2 para a tela #/design-system (mesmas classes do app: `StudioBar`, `ViewModule`,
 * `TimeModule`, `LeftToolbar`, `DockTray`, `Toolbox`, `FloatingContextToolbar`, `Menu`). Peças reais quando não
 * dependem do board aberto (ícones, `LockButton` com o anel de 2 s, `LiveBadge`). Nenhum token novo.
 */
import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight, Compass as CompassIcon, Play, Search, ShieldCheck, SlidersHorizontal, Bold, Type, X } from 'lucide-react';
import * as Od from '../icons/od';
import { LockButton } from '../toolbar/LockButton';
import { LiveBadge } from '../toolbar/TopBar';
import { STICKY_PALETTE } from '../../utils/factory';
import { cn } from '../../utils/cn';
import { useAppStore } from '../../store/useAppStore';

export function ThemePane({ title, dark, children }: { title: string; dark?: boolean; children: ReactNode }) {
  return (
    <div className={cn(dark && 'dark')}>
      <div className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{title}</div>
      {children}
    </div>
  );
}

/** Os quatro módulos + uma gaveta (Facilitar) aberta, numa tela de 640 × 360. */
export function StudioMock() {
  return (
    <div className="relative h-[360px] overflow-hidden rounded-2xl bg-canvas text-ink ring-1 ring-line">
      <div className="od-dot-bg absolute inset-0 opacity-70" />
      {/* barra do topo: Ficha │ Roda */}
      <div className="od-panel absolute left-1/2 top-3 flex h-11 -translate-x-1/2 items-center gap-1 rounded-[14px] px-1.5 shadow-panel">
        <Od.MesaMark size={30} />
        <span className="flex flex-col px-1 leading-tight">
          <span className="whitespace-nowrap text-2xs text-ink-subtle">Espaço pessoal</span>
          <span className="flex items-center gap-1 whitespace-nowrap text-[12.5px] font-semibold">Sprint 14 <ChevronDown size={12} /></span>
        </span>
        <LiveBadge status="live" compact />
        <span className="od-divider-v" />
        <span className="od-tool w-auto gap-1 px-1.5 text-[12px] font-semibold" data-active="true">
          <Od.BatonIcon size={16} /> <span className="font-mono tabular-nums text-[var(--od-selection)]">04:12</span>
        </span>
        <span className="od-tool h-8 w-8"><Od.CommentPinIcon size={16} /></span>
        <span className="od-tool h-8 w-8"><Play size={14} className="fill-current" /></span>
        <span className="od-btn od-btn-primary h-8 px-2.5 text-[12px]">Compartilhar</span>
        <span className="flex h-7 w-7 items-center justify-center rounded-full text-2xs font-bold text-white" style={{ background: '#2C64A8' }}>LP</span>
      </div>
      {/* gaveta presa ao botão Facilitar */}
      <div className="od-pop absolute left-[44%] top-[64px] w-[210px] rounded-2xl">
        <div className="flex items-center px-3 pb-1 pt-2.5 text-[12.5px] font-bold">Facilitar<span className="flex-1" /><X size={13} className="text-ink-subtle" /></div>
        <div className="grid grid-cols-2 gap-1.5 p-2">
          {['Cronômetro', 'Votação', 'Enquete', 'Modo Privado'].map((x, i) => (
            <span key={x} className={cn('rounded-xl p-2 text-[11px] font-semibold ring-1', i === 0 ? 'bg-accent-soft ring-[var(--od-selection)]' : 'bg-panel-sunken ring-line')}>
              {x}
              {i === 0 && <span className="block text-2xs text-[var(--od-selection)]">Em andamento</span>}
            </span>
          ))}
        </div>
        <div className="border-t border-line px-3 py-1.5 text-2xs text-ink-subtle">Sem permissão, o motivo aparece no cartão.</div>
      </div>
      {/* Vista */}
      <div className="od-panel absolute bottom-3 left-3 flex h-10 items-center gap-0.5 rounded-xl px-1 shadow-panel">
        {/* nesta largura a Vista fica compacta (medida contra a Dock): Bússola + Exibir */}
        <span className="od-tool h-8 w-8"><CompassIcon size={15} /></span>
        <span className="od-tool h-8 w-8"><SlidersHorizontal size={14} /></span>
      </div>
      {/* Dock */}
      <div className="od-panel absolute bottom-3 left-1/2 flex h-10 -translate-x-1/2 items-center gap-0.5 rounded-xl px-1 shadow-panel">
        {[Od.HandIcon, Od.SelectIcon, Od.LassoIcon, Od.StickyIcon, Od.TextIcon, Od.ShapesIcon, Od.FrameIcon, Od.StickerIcon, Od.ToolboxIcon].map((I, i) => (
          <span key={i} className="od-tool od-dock-tool relative h-8 w-8" data-active={i === 1}>
            <I size={16} />
            {[3, 5, 6, 7, 8].includes(i) && <span className="absolute end-[3px] top-[3px] h-[4px] w-[4px] rounded-full bg-current opacity-45" />}
          </span>
        ))}
      </div>
      {/* Tempo */}
      <div className="od-panel absolute bottom-3 right-3 flex h-10 items-center gap-0.5 rounded-xl px-1 shadow-panel">
        <span className="od-tool h-8 w-8 text-ink-muted">↶</span>
        <span className="od-tool h-8 w-8"><Od.HourglassIcon size={15} /></span>
      </div>
    </div>
  );
}

type StripState = 'texto' | 'conector' | 'frame' | 'varios' | 'travado';

export function StripMock({ state }: { state: StripState }) {
  const locked = state === 'travado';
  const identity: Record<StripState, [ReactNode, string, boolean]> = {
    texto: [<Od.StickyIcon size={15} key="i" />, 'Post-it', true],
    conector: [<Od.ConnectorIcon size={15} key="i" />, 'Conector', false],
    frame: [<Od.FrameIcon size={15} key="i" />, 'Sprint 3', false],
    varios: [<Od.SelectIcon size={15} key="i" />, 'Seleção · 4', true],
    travado: [<Od.TextIcon size={15} key="i" />, 'Texto', true],
  };
  const [icon, name, chevron] = identity[state];
  const Chip = ({ children }: { children: ReactNode }) => <span className="flex h-[30px] shrink-0 items-center gap-1.5 rounded-[10px] bg-panel-sunken px-2 text-[11.5px] font-semibold">{children}</span>;
  return (
    <div className="rounded-2xl bg-canvas p-4 ring-1 ring-line">
      <div className="mb-1 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{state}</div>
      <div className="od-panel relative inline-flex h-11 items-center gap-1 rounded-[14px] p-1 text-ink">
        <span className="absolute -top-[5px] left-12 h-[10px] w-[10px] rotate-45 border-s border-t border-line bg-panel" />
        <span className="flex h-[34px] items-center gap-1.5 rounded-[10px] bg-accent-soft px-2.5 text-[12.5px] font-bold text-[var(--od-accent)]">
          {icon}
          {name}
          {chevron && <ChevronDown size={13} />}
          {state === 'frame' && false}
        </span>
        <span className={cn('flex items-center gap-0.5', locked && 'pointer-events-none opacity-40')}>
          {(state === 'texto' || state === 'varios' || state === 'travado') && (
            <>
              <Chip>
                <span className="font-bold">Aa</span> {state === 'varios' ? 'Misto' : 'Fraunces 56'} <ChevronDown size={12} className="text-ink-subtle" />
              </Chip>
              <span className="od-tool h-8 w-8"><Bold size={15} /></span>
              <span className="od-tool h-8 w-8"><Type size={15} /></span>
              <span className="od-tool h-8 w-8"><Od.LinkIcon size={15} /></span>
            </>
          )}
          {state === 'conector' && (
            <>
              <Chip>Pontas · →</Chip>
              <span className="od-tool h-8 w-8"><Od.SwapIcon size={15} /></span>
              <Chip>Traço 2 px</Chip>
              <span className="od-tool h-8 w-8"><Od.LineLabelIcon size={15} /></span>
            </>
          )}
          {state === 'frame' && (
            <>
              <Chip><Od.RatioIcon size={14} /> 16:9</Chip>
              <span className="od-tool h-8 w-8"><Od.ExportIcon size={15} /></span>
              <span className="od-btn od-btn-primary h-[30px] gap-1 px-2 text-[11.5px]"><Play size={12} className="fill-current" /> Apresentar</span>
            </>
          )}
        </span>
        <span className="od-divider-v" />
        <span className={cn('od-tool h-8 w-8', locked && 'opacity-40')}><Od.CommentPinIcon size={15} /></span>
        <span className={cn('od-tool h-8 w-8', locked && 'opacity-40')}><Od.AdvancedLockIcon size={15} /></span>
        {locked ? (
          <LockButton locked onLock={() => undefined} onUnlock={() => useAppStore.getState().toast('Exemplo: destravado após 2 s', 'success')} />
        ) : (
          <span className="od-tool h-8 w-8"><Od.LockIcon size={15} /></span>
        )}
        <span className="od-tool h-8 w-8"><Od.MoreIcon size={15} /></span>
      </div>
    </div>
  );
}

export function MenuMock() {
  return (
    <div className="od-pop w-[290px] p-1.5 text-ink">
      <div className="flex items-baseline gap-2 px-2.5 pb-1.5 pt-1">
        <span className="text-[13px] font-bold">Post-it</span>
        <span className="ms-auto text-[11.5px] text-ink-subtle">Canário</span>
      </div>
      <div className="grid grid-cols-5 gap-0.5 px-0.5 pb-1">
        {[
          [Od.CopyIcon, 'Copiar'],
          [Od.DuplicateIcon, 'Duplicar'],
          [Od.LockIcon, 'Bloquear'],
          [Od.BringFrontIcon, 'Frente'],
          [Od.TrashIcon, 'Excluir'],
        ].map(([I, l], i) => {
          const Icon = I as typeof Od.CopyIcon;
          return (
            <span key={l as string} className={cn('flex flex-col items-center gap-1 rounded-lg pb-1 pt-1.5 text-2xs font-semibold', i === 4 ? 'text-danger' : 'text-ink-muted')}>
              <Icon size={17} />
              {l as string}
            </span>
          );
        })}
      </div>
      <div className="mx-2 my-1 h-px bg-line" />
      {['Editar', 'Copiar como', 'Organizar', 'Bloqueio', 'Frame e modelo', 'Exportar e info'].map((x) => (
        <span key={x} className="od-menu-item">
          <span className="flex-1">{x}</span>
          <ChevronRight size={15} className="text-ink-subtle" />
        </span>
      ))}
    </div>
  );
}

export function TimelineMock() {
  const bars = [2, 4, 1, 0, 6, 9, 3, 2, 0, 5, 7, 4, 2, 8, 3, 1];
  return (
    <div className="od-pop w-full max-w-[420px] p-3 text-ink">
      <div className="flex items-center gap-2 text-[12px]">
        <Od.HourglassIcon size={15} className="text-[var(--od-selection)]" />
        <b>Linha do tempo</b>
        <span className="flex-1" />
        <span className="text-ink-subtle">versões: 6 · eventos: 142</span>
      </div>
      <div className="relative mt-3 h-10">
        <div className="absolute inset-x-0 bottom-3 flex h-6 items-end gap-[2px]">
          {bars.map((v, i) => (
            <i key={i} className="flex-1 rounded-t-[2px] bg-accent-soft" style={{ height: `${10 + v * 9}%` }} />
          ))}
        </div>
        <div className="absolute inset-x-0 bottom-2 h-[2px] bg-line" />
        {[8, 30, 52, 70, 92].map((p, i) => (
          <span key={p} className={cn('absolute bottom-[3px] h-[10px] w-[10px] -translate-x-1/2 rounded-full ring-2 ring-[var(--od-panel)]', i === 2 ? 'bg-warning' : 'bg-accent', i === 3 && 'scale-125 ring-[var(--od-selection)]')} style={{ left: `${p}%` }} />
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <span className="od-btn od-btn-primary od-btn-sm h-7">Restaurar esta versão</span>
        <span className="od-btn od-btn-ghost od-btn-sm h-7 text-danger">Excluir versão</span>
      </div>
    </div>
  );
}

export function TrayMock() {
  return (
    <div className="relative inline-block pb-3">
      <div className="od-pop w-[300px] text-ink">
        <div className="flex items-center gap-2 px-3.5 pb-1.5 pt-3">
          <span className="text-[13px] font-bold">Post-it</span>
          <span className="font-display text-[15px] font-bold">Canário</span>
          <span className="flex-1" />
          <span className="od-kbd">N</span>
        </div>
        <div className="grid grid-cols-8 gap-1.5 px-3.5 pb-2.5 pt-1">
          {STICKY_PALETTE.map((c) => (
            <span key={c.hex} className={cn('relative aspect-square rounded-[5px] shadow-[0_1px_1px_rgba(0,0,0,0.08),0_3px_6px_rgba(0,0,0,0.08)]', c.hex === '#FBED7C' && 'ring-2 ring-selection ring-offset-2 ring-offset-[var(--od-panel)]')} style={{ background: c.hex }}>
              <span className="absolute inset-x-[30%] -top-[3px] h-[6px] rounded-[2px] bg-white/65" />
            </span>
          ))}
        </div>
        <div className="border-t border-line px-3.5 py-2 text-[11px] text-ink-subtle">Passe o mouse para ver o nome da cor</div>
      </div>
      <span className="absolute -bottom-[4px] left-[60px] h-[14px] w-[14px] rotate-45 rounded-br-[3px] border-b border-r border-line bg-panel" />
    </div>
  );
}

export function ToolboxMock() {
  const sec: [string, [typeof Od.KanbanIcon, string, boolean][]][] = [
    ['Organizar', [[Od.KanbanIcon, 'Kanban', true], [Od.TableIcon, 'Tabela', true], [Od.TimelineIcon, 'Cronograma', false]]],
    ['Diagramar', [[Od.MindMapIcon, 'Mapa mental', true], [Od.TextDiagramIcon, 'Diagrama por texto', true], [Od.FlowchartIcon, 'Fluxograma', true]]],
    ['Apresentar', [[Od.SlidesIcon, 'Slides', true], [Od.PrototypeIcon, 'Protótipo', false], [Od.DocumentIcon, 'Documento', false]]],
    ['Trazer e levar', [[Od.TemplatesIcon, 'Templates', true], [Od.ImportIcon, 'Importar', true], [Od.ExportIcon, 'Exportar', true]]],
  ];
  return (
    <div className="od-pop w-full max-w-[460px] p-3 text-ink">
      <span className="flex h-9 items-center gap-2 rounded-lg bg-panel-sunken px-2.5 text-[12px] text-ink-subtle ring-1 ring-line">
        <Search size={14} /> Buscar ferramentas, modelos e extensões…
      </span>
      <div className="mt-2 grid grid-cols-2 gap-x-3">
        {sec.map(([title, items]) => (
          <div key={title}>
            <div className="px-1 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{title}</div>
            {items.map(([I, l, on]) => (
              <span key={l} className={cn('flex items-center gap-2 rounded-lg px-1 py-1 text-[12px] font-semibold', !on && 'opacity-60')}>
                <span className="grid h-7 w-7 place-items-center rounded-md bg-panel-sunken text-[var(--od-accent)]"><I size={15} /></span>
                {l}
                {!on && <span className="ms-auto rounded-full bg-panel-sunken px-1.5 text-2xs text-ink-subtle ring-1 ring-line">Em breve</span>}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CursorTable() {
  const rows: [string, string][] = [
    ['Mão (H) ou Espaço', 'grab → grabbing'],
    ['Objeto selecionado', 'move → grabbing ao arrastar'],
    ['Objeto não selecionado', 'seta (default)'],
    ['Alt + arrastar (duplica)', 'copy'],
    ['Objeto travado', 'seta; not-allowed ao tentar mover'],
    ['Alças de redimensionar', 'direção certa, girando com o objeto'],
    ['Alça de rotação', 'cursor próprio (SVG 1x/2x; fallback grab)'],
    ['Ferramentas de criar · pontos de conexão', 'crosshair'],
    ['Ferramenta Texto', 'text'],
  ];
  return (
    <table className="w-full text-[12px]">
      <tbody>
        {rows.map(([a, b]) => (
          <tr key={a} className="border-b border-line last:border-0">
            <td className="py-1.5 pe-3 text-ink">{a}</td>
            <td className="py-1.5 font-mono text-[11.5px] text-ink-muted">{b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function IconGrid() {
  const icons = Object.entries(Od).filter(([k]) => k.endsWith('Icon') && k !== 'OdIcon') as [string, (p: { size?: number }) => JSX.Element][];
  return (
    <div className="grid grid-cols-8 gap-1.5 rounded-2xl bg-panel p-3 text-ink ring-1 ring-line sm:grid-cols-10">
      {icons.map(([name, I], i) => (
        <span key={name} title={name.replace(/Icon$/, '')} className={cn('od-tool od-dock-tool h-9 w-9', i % 9 === 0 && '')} data-active={i === 1}>
          <I size={20} />
        </span>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Gavetas (barra do topo e Vista), bandejas, prévia da versão, janela de     */
/*  extensão e menus de botão direito — réplicas paradas com textos do app     */
/* -------------------------------------------------------------------------- */

/** Cabeçalho · conteúdo · rodapé, como `StudioDrawer`/`DockTray`. */
function Pop({ title, hint, footer, width = 300, children }: { title: ReactNode; hint?: ReactNode; footer?: ReactNode; width?: number; children: ReactNode }) {
  return (
    <div className="od-pop flex max-w-full flex-col rounded-2xl text-ink" style={{ width }}>
      <div className="flex items-center gap-2 px-3.5 pb-1.5 pt-3">
        <span className="text-[13px] font-bold">{title}</span>
        <span className="flex-1" />
        {hint}
      </div>
      <div className="pb-2">{children}</div>
      {footer && <div className="border-t border-line px-3.5 py-2 text-[11px] text-ink-subtle">{footer}</div>}
    </div>
  );
}

const CAP = 'px-3.5 pb-1 pt-1 text-2xs font-extrabold uppercase tracking-[0.06em] text-ink-subtle';

/** Ficha do board (lugar + nome na barra do topo): grade 4 × 2, detalhes e lixeira. */
export function FichaMock() {
  const items: [ReactNode, string][] = [
    [<span key="n" className="text-[18px] leading-none">+</span>, 'Novo board'],
    [<Od.DuplicateIcon size={18} key="d" />, 'Duplicar'],
    [<Od.ExportIcon size={18} key="e" />, 'Exportar…'],
    [<Od.ImportIcon size={18} key="i" />, 'Importar…'],
    [<Od.TemplatesIcon size={18} key="t" />, 'Salvar como modelo'],
    [<Od.HourglassIcon size={18} key="h" />, 'Histórico'],
    [<span key="b" className="h-4 w-4 rounded-full bg-[#F5F6F8] ring-1 ring-line-strong" />, 'Cor de fundo'],
    [<span key="g" className="text-[14px] font-bold">#</span>, 'Tags do board'],
  ];
  return (
    <Pop title="Ficha do board" hint={<span className="text-[11.5px] text-ink-subtle">Sprint 14</span>} width={320}>
      <div className="grid grid-cols-4 gap-1 px-2.5">
        {items.map(([icon, label]) => (
          <span key={label} className="flex flex-col items-center gap-1 rounded-[10px] px-0.5 py-2 text-center text-2xs font-semibold leading-tight text-ink-muted">
            <span className="grid h-6 place-items-center text-ink">{icon}</span>
            {label}
          </span>
        ))}
      </div>
      <div className="mx-3.5 my-2 h-px bg-line" />
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-3.5 text-[12px]">
        {[
          ['Dono', 'Ana Prado'],
          ['Criado em', '02/11/2026'],
          ['Editado', 'há 5 min por Bia Reis'],
          ['Tamanho', '142 objetos · 1,8 MB'],
        ].map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-ink-subtle">{k}</dt>
            <dd className="text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <span className="mx-2 mt-2 flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-[12.5px] font-semibold text-danger">
        <Od.TrashIcon size={16} /> Mover para a lixeira
      </span>
    </Pop>
  );
}

/** Conversas (botão com contador na Roda): filtros, cartões e “Ir até”. */
export function ConversationsMock() {
  const cards = [
    { who: 'Ana Prado', c: '#E5484D', when: 'há 4 min', text: 'Podemos juntar estes dois passos? O segundo repete o primeiro.', where: 'Post-it · Onboarding em 3 passos', replies: '2 respostas' },
    { who: 'João Reis', c: '#2C64A8', when: 'ontem', text: '@Ana Prado revisei a tabela de prazos.', where: 'Tabela · Prazos', replies: '1 resposta' },
  ];
  return (
    <Pop title="Conversas" hint={<span className="rounded-full bg-accent-soft px-2 text-[11px] font-bold text-[var(--od-accent)]">2 abertas</span>} width={320}>
      <div className="mx-3.5 mb-2 flex gap-0.5 rounded-[9px] bg-panel-sunken p-[3px] text-[11.5px] font-semibold">
        {['Abertas', 'Resolvidas', 'Todas', 'Menções'].map((x, i) => (
          <span key={x} className={cn('flex-1 rounded-[7px] py-1 text-center', i === 0 ? 'bg-panel text-ink shadow-panel' : 'text-ink-muted')}>
            {x}
          </span>
        ))}
      </div>
      <div className="space-y-1.5 px-2.5">
        {cards.map((c) => (
          <div key={c.who} className="rounded-xl bg-panel-sunken p-2.5 ring-1 ring-line">
            <div className="flex items-center gap-2 text-[12px]">
              <span className="grid h-6 w-6 place-items-center rounded-full text-2xs font-bold text-white" style={{ background: c.c }}>
                {c.who
                  .split(' ')
                  .map((p) => p[0])
                  .join('')}
              </span>
              <b>{c.who}</b>
              <span className="text-ink-subtle">{c.when}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-[12px] text-ink">{c.text}</p>
            <div className="mt-1.5 flex items-center gap-2 text-[11px] text-ink-subtle">
              <span className="truncate">{c.where}</span> · <span className="shrink-0">{c.replies}</span>
              <span className="ms-auto shrink-0 rounded-md bg-panel px-1.5 py-0.5 font-semibold text-ink ring-1 ring-line">Ir até</span>
            </div>
          </div>
        ))}
      </div>
    </Pop>
  );
}

/** Você (avatar na Roda): aparência, edição e avisos. */
export function YouMock() {
  const Row = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="flex items-center justify-between gap-3 px-3.5 py-1.5 text-[12.5px]">
      <span>{label}</span>
      {children}
    </div>
  );
  const Sw = ({ on }: { on?: boolean }) => (
    <span className={cn('relative h-5 w-9 shrink-0 rounded-full', on ? 'bg-accent' : 'bg-panel-sunken ring-1 ring-line')}>
      <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow', on ? 'end-0.5' : 'start-0.5')} />
    </span>
  );
  return (
    <Pop title="Você" hint={<span className="grid h-6 w-6 place-items-center rounded-full bg-[#2C64A8] text-2xs font-bold text-white">LP</span>} width={290}>
      <div className={CAP}>Aparência</div>
      <Row label="Tema escuro">
        <Sw />
      </Row>
      <div className={CAP}>Edição</div>
      <Row label="Navegar com">
        <span className="flex gap-0.5 rounded-[9px] bg-panel-sunken p-[3px] text-[11px] font-semibold">
          {['Automático', 'Mouse', 'Trackpad'].map((x, i) => (
            <span key={x} className={cn('rounded-[7px] px-1.5 py-0.5', i === 0 ? 'bg-panel text-ink shadow-panel' : 'text-ink-muted')}>
              {x}
            </span>
          ))}
        </span>
      </Row>
      <div className={CAP}>Avisos</div>
      <Row label="Seguir todas as conversas">
        <Sw on />
      </Row>
    </Pop>
  );
}

/** Roteiro (Vista): frames na ordem dos slides, ▷ por frame e “Usar esta vista como inicial”. */
export function ScriptMock() {
  const frames: [string, boolean][] = [
    ['Abertura', false],
    ['Descoberta', false],
    ['Votação', true],
    ['Próximos passos', false],
  ];
  return (
    <Pop title="Roteiro" footer="Arraste ou use ↑ ↓ para mudar a ordem dos slides." width={300}>
      {frames.map(([title, hidden], i) => (
        <div key={title} className={cn('mx-2 flex items-center gap-2 rounded-lg px-1.5 py-1.5 text-[12.5px]', i === 1 && 'bg-panel-hover')}>
          <span className="text-ink-subtle">⋮⋮</span>
          <span className="w-4 text-center font-mono text-[11px] text-ink-subtle">{i + 1}</span>
          <span className="flex-1 truncate font-semibold">{title}</span>
          {hidden && <span className="text-2xs text-ink-subtle">oculto</span>}
          <Play size={12} className="fill-current text-ink-muted" />
        </div>
      ))}
      <span className="mx-3.5 mt-1.5 block text-[12px] font-semibold text-[var(--od-accent)]">Usar esta vista como inicial</span>
    </Pop>
  );
}

/** Prévia somente leitura de uma versão (Linha do tempo): canvas em sépia e a faixa “Voltar ao agora”. */
export function PreviewMock() {
  return (
    <div className="relative h-[200px] overflow-hidden rounded-2xl ring-1 ring-line">
      <div className="od-dot-bg absolute inset-0 bg-canvas" style={{ filter: 'sepia(0.28) saturate(0.85)' }}>
        <div className="absolute left-[18%] top-[45%] h-16 w-16 rounded-[3px] bg-[#FBED7C] shadow-sm" />
        <div className="absolute left-[34%] top-[52%] h-16 w-16 rounded-[3px] bg-[#AACAFF] shadow-sm" />
        <div className="absolute left-[55%] top-[44%] h-[70px] w-[120px] rounded-lg border-2 border-[#194B32] bg-[#D0E4AE]" />
      </div>
      <div className="absolute start-1/2 top-4 flex max-w-[calc(100%-16px)] -translate-x-1/2 items-center gap-2.5 rounded-full bg-brand-900 py-1.5 pe-1.5 ps-3.5 text-[12.5px] font-semibold text-brand-100 shadow-pop">
        <Od.HourglassIcon size={15} className="shrink-0" />
        <span className="truncate">Vendo o board em 10/11, 14:02 — somente leitura</span>
        <span className="shrink-0 rounded-full bg-brand-100 px-3 py-1 text-[12px] font-bold text-brand-900">Voltar ao agora</span>
      </div>
    </div>
  );
}

/** Janela flutuante de extensão: cartão arrastável de 340 px com o iframe isolado. */
export function ExtensionWindowMock() {
  return (
    <div className="od-pop flex w-[340px] max-w-full flex-col overflow-hidden rounded-2xl text-ink">
      <div className="flex cursor-move items-center gap-2 border-b border-line px-3 py-2">
        <span className="text-ink-subtle">⠿</span>
        <Od.ExtensionIcon size={16} />
        <span className="flex-1 truncate text-[13px] font-bold">Painel de exemplo</span>
        <X size={14} className="text-ink-subtle" />
      </div>
      <div className="h-[110px] bg-panel p-3">
        <div className="mb-2 h-2.5 w-2/3 rounded bg-panel-sunken" />
        <div className="mb-2 h-2.5 w-1/2 rounded bg-panel-sunken" />
        <div className="h-2.5 w-3/4 rounded bg-panel-sunken" />
      </div>
      <div className="flex items-center gap-1.5 border-t border-line px-3 py-1.5 text-2xs text-ink-subtle">
        <ShieldCheck size={12} className="shrink-0" /> Isolado: sem acesso ao app, à rede nem ao armazenamento do navegador.
      </div>
    </div>
  );
}

/** Bandeja com a língua apontando para o botão da Dock. */
function Tray({ children }: { children: ReactNode }) {
  return (
    <div className="relative inline-block max-w-full pb-3">
      {children}
      <span className="absolute -bottom-[4px] left-[60px] h-[14px] w-[14px] rotate-45 rounded-br-[3px] border-b border-r border-line bg-panel" />
    </div>
  );
}

export function ShapesTrayMock() {
  const basic = ['M3 4h14v12H3z', 'M3 7a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z', 'M10 3a7 7 0 1 1 0 14a7 7 0 1 1 0-14z', 'M10 2.5l7.5 7.5-7.5 7.5-7.5-7.5z', 'M10 3l8 14H2z'];
  return (
    <Tray>
      <Pop title="Formas" hint={<span className="od-kbd">S</span>} footer="Arraste para desenhar · clique para o tamanho padrão" width={280}>
        <div className={CAP}>Linhas</div>
        <div className="grid grid-cols-4 gap-1 px-3.5 pb-2">
          {[Od.LineIcon, Od.ArrowLineIcon, Od.ElbowLineIcon, Od.CurveLineIcon].map((I, i) => (
            <span key={i} className="grid h-9 place-items-center rounded-[9px] bg-panel-sunken">
              <I size={18} />
            </span>
          ))}
        </div>
        <div className={CAP}>Básicas</div>
        <div className="grid grid-cols-5 gap-1 px-3.5">
          {basic.map((d) => (
            <span key={d} className="grid h-9 place-items-center rounded-[9px] text-ink">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d={d} />
              </svg>
            </span>
          ))}
        </div>
      </Pop>
    </Tray>
  );
}

export function PenTrayMock() {
  const tools: [typeof Od.PenIcon, string, boolean][] = [
    [Od.PenIcon, 'Caneta', true],
    [Od.HighlighterIcon, 'Marca-texto', false],
    [Od.EraserIcon, 'Borracha', false],
  ];
  const presets: [string, number][] = [
    ['#18211C', 2],
    ['#18211C', 4],
    ['#2C64A8', 3],
    ['#BC3F2C', 3],
    ['#3A8156', 6],
  ];
  return (
    <Tray>
      <Pop title="Pena" hint={<span className="od-kbd">P</span>} footer="E liga a borracha; Esc volta a selecionar" width={260}>
        <div className="grid grid-cols-3 gap-1 px-3.5 pb-2">
          {tools.map(([Icon, l, on]) => (
            <span key={l} className="od-dock-tool flex flex-col items-center gap-1 rounded-[10px] py-2 text-[11px] font-semibold text-ink-muted" data-active={on}>
              <Icon size={19} />
              {l}
            </span>
          ))}
        </div>
        <div className={CAP}>Espessura e cor</div>
        <div className="flex items-center gap-1.5 px-3.5">
          {presets.map(([c, w], i) => (
            <span key={i} className={cn('grid h-8 w-8 place-items-center rounded-lg', i === 0 && 'ring-2 ring-[var(--od-selection)]')}>
              <span className="rounded-full" style={{ background: c, width: 18, height: w }} />
            </span>
          ))}
        </div>
      </Pop>
    </Tray>
  );
}

export function FrameTrayMock() {
  const ratios: [string, number, number][] = [
    ['Livre', 26, 17],
    ['16:9', 28, 16],
    ['4:3', 24, 18],
    ['1:1', 20, 20],
    ['A4', 16, 22],
    ['Mobile', 12, 24],
  ];
  return (
    <Tray>
      <Pop title="Frame" hint={<span className="od-kbd">F</span>} footer="Roteiro na Vista ↙" width={260}>
        <div className="grid grid-cols-3 gap-1 px-3.5">
          {ratios.map(([l, w, h], i) => (
            <span key={l} className={cn('flex flex-col items-center gap-1 rounded-[10px] py-2 text-[11px] font-semibold text-ink-muted', i === 1 && 'bg-panel-hover text-ink')}>
              <span className="grid h-7 place-items-center">
                <span className={cn('rounded-[3px] border-[1.5px] border-current', l === 'Livre' && 'border-dashed')} style={{ width: w, height: h }} />
              </span>
              {l}
            </span>
          ))}
        </div>
      </Pop>
    </Tray>
  );
}

export function EmojiTrayMock() {
  return (
    <Tray>
      <Pop title="Emojis e adesivos" hint={<span className="od-kbd">Shift + E</span>} footer="Clique para colocar no centro · arraste para o lugar" width={300}>
        <span className="mx-3.5 mb-2 flex h-8 items-center gap-2 rounded-lg bg-panel-sunken px-2.5 text-[12px] text-ink-subtle ring-1 ring-line">
          <Search size={13} /> Buscar emoji ou adesivo…
        </span>
        <div className="mx-3.5 mb-2 flex gap-0.5 rounded-[9px] bg-panel-sunken p-[3px] text-[11.5px] font-semibold">
          {['Emojis', 'Adesivos', 'Das extensões'].map((x, i) => (
            <span key={x} className={cn('flex-1 rounded-[7px] py-1 text-center', i === 0 ? 'bg-panel text-ink shadow-panel' : 'text-ink-muted')}>
              {x}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-8 gap-0.5 px-3 text-[20px] leading-none">
          {['👍', '❤️', '🔥', '💡', '✅', '❌', '🎉', '⭐', '🚀', '⚠️', '❓', '😊', '😂', '🤔', '👏', '🎯'].map((e) => (
            <span key={e} className="grid h-8 place-items-center rounded-lg">
              {e}
            </span>
          ))}
        </div>
      </Pop>
    </Tray>
  );
}

/** Menus de botão direito: canvas vazio (“Neste ponto”) e tabela (“Tabela · B3”), mesma anatomia do menu do objeto. */
export function ContextMenuMock({ kind }: { kind: 'canvas' | 'table' }) {
  const quick: [typeof Od.CopyIcon, string][] =
    kind === 'canvas'
      ? [
          [Od.PasteIcon, 'Colar'],
          [Od.StickyIcon, 'Post-it'],
          [Od.TextIcon, 'Texto'],
          [Od.FrameIcon, 'Frame'],
          [Od.CommentPinIcon, 'Conversa'],
        ]
      : [
          [Od.CopyIcon, 'Copiar'],
          [Od.PencilIcon, 'Limpar'],
          [Od.TableIcon, 'Mesclar'],
          [Od.LockIcon, 'Bloquear'],
          [Od.TrashIcon, 'Excluir'],
        ];
  const rows = kind === 'canvas' ? ['Inserir aqui', 'Seleção', 'Vista', 'Grade e navegação'] : ['Linhas e colunas', 'Texto e alinhamento', 'Fundo e bordas', 'Ordenar', 'Levar para planilhas', 'Objeto'];
  return (
    <div className="od-pop w-[290px] max-w-full p-1.5 text-ink">
      <div className="flex items-baseline gap-2 px-2.5 pb-1.5 pt-1">
        <span className="text-[13px] font-bold">{kind === 'canvas' ? 'Neste ponto' : 'Tabela'}</span>
        <span className="ms-auto font-mono text-[11.5px] text-ink-subtle">{kind === 'canvas' ? 'x 1 240 · y 380' : 'B3'}</span>
      </div>
      <div className="grid grid-cols-5 gap-0.5 px-0.5 pb-1">
        {quick.map(([Icon, l], i) => (
          <span key={l} className={cn('flex flex-col items-center gap-1 rounded-lg pb-1 pt-1.5 text-2xs font-semibold', kind === 'table' && i === 4 ? 'text-danger' : 'text-ink-muted')}>
            <Icon size={17} />
            {l}
          </span>
        ))}
      </div>
      <div className="mx-2 my-1 h-px bg-line" />
      {rows.map((x) => (
        <span key={x} className="od-menu-item">
          <span className="flex-1">{x}</span>
          <ChevronRight size={15} className="text-ink-subtle" />
        </span>
      ))}
    </div>
  );
}
