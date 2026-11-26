/**
 * Design System · 1. Fundamentos — cor (marca, superfícies, semânticas, contraste, conteúdo do board), tipografia
 * (com as 40 fontes do conteúdo e o seletor real), forma e movimento, ícones e cursores.
 */
import { ArrowLeft, Check, ChevronRight, Info, Mail, Plus, Search, Settings, Users, X } from 'lucide-react';
import { contrastRatio } from '../../../utils/color';
import { CONTRAST_PAIRS, MIN_RATIO, contrastGrade, measurePair, pairId, parseTokenCss, tokenValue, type TokenTheme } from '../../../utils/designTokens';
// Chat 08.6 · B (D-08): os valores desta tela vêm do tokens.css REAL (texto do arquivo), nunca de hex copiados
import tokensCss from '../../../styles/tokens.css?raw';
import { DEFAULT_STICKY_COLOR, INK_COLORS, STICKY_PALETTE, STICKY_TEXT_COLOR, STICKY_TEXT_COLOR_ON_DARK } from '../../../utils/factory';
import { TAG_COLORS, tagTextColor } from '../../../utils/stickyMeta';
import { COLLABORATOR_PALETTE } from '../../../collab/protocol';
import { BOARD_FONTS, type FontCategory } from '../../../utils/text';
import { cn } from '../../../utils/cn';
import { LogoMark } from '../../ui/Logo';
import { FontPicker } from '../../strip/FontPicker';
import { Block, Code, Frame, SubTitle, TokenTable, TypeRow } from '../dsKit';
import { CursorTable, IconGrid, TrayMock } from '../studioMocks';

const BRAND_SCALE: { step: string; hex: string; note?: string }[] = [
  { step: '50', hex: '#F4F9EC' },
  { step: '100', hex: '#E7F1D6' },
  { step: '200', hex: '#D0E4AE', note: 'Secundária' },
  { step: '300', hex: '#B4D38A' },
  { step: '400', hex: '#8FBE72' },
  { step: '500', hex: '#5FA067' },
  { step: '600', hex: '#3A8156' },
  { step: '700', hex: '#2A6646' },
  { step: '800', hex: '#20573B' },
  { step: '900', hex: '#194B32', note: 'Primária' },
  { step: '950', hex: '#0F2E1F' },
];

const TOKENS = parseTokenCss(tokensCss);
const tokenRow = (name: string, label: string) => ({ token: `--od-${name}`, label, light: tokenValue(TOKENS.light, name), dark: tokenValue(TOKENS.dark, name) });

const SURFACES = [
  tokenRow('canvas', 'Canvas do board'),
  tokenRow('canvas-dot', 'Pontos da grade'),
  tokenRow('app-bg', 'Fundo de telas'),
  tokenRow('panel', 'Painéis flutuantes'),
  tokenRow('panel-hover', 'Hover'),
  tokenRow('panel-active', 'Ativo / pressionado'),
  tokenRow('border', 'Borda'),
  tokenRow('text', 'Texto principal'),
  tokenRow('text-muted', 'Texto secundário'),
  tokenRow('text-subtle', 'Texto terciário (mínimo 4,5:1)'),
];

const INTERACTION = [
  tokenRow('accent', 'Ação primária'),
  tokenRow('accent-contrast', 'Texto sobre ação'),
  tokenRow('accent-soft', 'Ferramenta ativa'),
  tokenRow('selection', 'Seleção / alças'),
  tokenRow('on-selection', 'Texto sobre a seleção'),
  tokenRow('guide', 'Smart guides'),
  tokenRow('focus-color', 'Anel de foco (traço de 2 px)'),
  tokenRow('input-border', 'Borda de campo'),
  tokenRow('favorite', 'Estrela de favorito'),
  tokenRow('danger-on-inverse', 'Erro sobre superfície invertida'),
];

/** Seguem o tema da página (variáveis CSS), com o nome do token. */
const SEMANTIC: { label: string; name: string }[] = [
  { label: 'Sucesso', name: 'success' },
  { label: 'Atenção', name: 'warning' },
  { label: 'Perigo', name: 'danger' },
  { label: 'Informação', name: 'info' },
];

const THEMES: { id: TokenTheme; label: string }[] = [
  { id: 'light', label: 'Claro' },
  { id: 'dark', label: 'Escuro' },
];

/** Nome de cada par de contraste (a lista e as medidas vêm de utils/designTokens.ts). */
const PAIR_LABELS: Record<string, string> = {
  'text/panel': 'Texto principal · painel',
  'text/app-bg': 'Texto principal · fundo do app',
  'text-muted/panel': 'Texto secundário · painel',
  'text-muted/panel-sunken': 'Texto secundário · fundo rebaixado',
  'text-muted/panel-hover': 'Texto secundário · hover',
  'text-subtle/panel': 'Texto terciário · painel',
  'text-subtle/app-bg': 'Texto terciário · fundo do app',
  'text-subtle/panel-sunken': 'Texto terciário · fundo rebaixado',
  'text-subtle/panel-hover': 'Texto terciário · hover',
  'text-subtle/panel-active': 'Texto terciário · item ativo',
  'text-subtle/accent-soft': 'Texto terciário · acento suave',
  'text-subtle/canvas': 'Texto terciário · canvas',
  'accent-contrast/accent': 'Botão primário',
  'accent/accent-soft': 'Ferramenta ativa / identidade da Cinta',
  'text-inverse/text': 'Superfície invertida (toast, etiqueta de rotação)',
  'on-selection/selection': 'Texto sobre a cor de seleção (medidas)',
  'success/success-soft': 'Sucesso · fundo suave',
  'warning/panel': 'Aviso · painel',
  'warning/warning-soft': 'Aviso · fundo suave',
  'danger/panel': 'Erro · painel',
  'danger/danger-soft': 'Erro · fundo suave',
  'info/info-soft': 'Informação · fundo suave',
  'focus-color/panel': 'Anel de foco · painel',
  'focus-color/app-bg': 'Anel de foco · fundo do app',
  'focus-color/canvas': 'Anel de foco · canvas',
  'input-border/panel': 'Borda de campo · painel',
  'input-border/panel-sunken': 'Borda de campo · fundo rebaixado',
  'selection/canvas': 'Seleção · canvas',
  'guide/canvas': 'Guias inteligentes · canvas',
  'danger-on-inverse/text': 'Ícone de erro · superfície invertida',
  'favorite/panel': 'Estrela de favorito · painel',
  'favorite/panel-hover': 'Estrela de favorito · hover',
};

const FONT_GROUPS: [FontCategory, string][] = [
  ['sans', 'Sem serifa'],
  ['serif', 'Serifa'],
  ['hand', 'Manuscrita'],
  ['display', 'Display'],
  ['mono', 'Mono'],
];

export function Foundations() {
  return (
    <>
      <Frame title="Cores da marca">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-11">
          {BRAND_SCALE.map((c) => (
            <div key={c.step} className="min-w-0">
              <div
                className={cn('flex aspect-square items-end rounded-xl p-2 ring-1 ring-black/5', c.note && 'ring-2 ring-brand-400 ring-offset-2 ring-offset-[var(--od-panel)]')}
                style={{ background: c.hex }}
              >
                {c.note && (
                  <span className="rounded-md bg-black/25 px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wide text-white backdrop-blur-sm">{c.note}</span>
                )}
              </div>
              <div className="mt-1.5 text-xs font-semibold text-ink">brand-{c.step}</div>
              <div className="font-mono text-[11px] text-ink-subtle">{c.hex}</div>
            </div>
          ))}
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="flex items-center gap-4 rounded-2xl bg-brand-900 p-5 text-brand-200">
            <LogoMark size={48} inverted />
            <div>
              <div className="font-display text-2xl font-semibold">Verde-floresta</div>
              <div className="text-sm opacity-80">#194B32 · ações primárias, marca, títulos de destaque</div>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-2xl bg-brand-200 p-5 text-brand-900">
            <LogoMark size={48} />
            <div>
              <div className="font-display text-2xl font-semibold">Verde-pistache</div>
              <div className="text-sm opacity-80">#D0E4AE · texto sobre primária, estados ativos, realces</div>
            </div>
          </div>
        </div>
      </Frame>

      <Frame title="Superfícies, texto e interação (claro × escuro)">
        <TokenTable rows={[...SURFACES, ...INTERACTION]} />
      </Frame>

      <div className="grid gap-6 lg:grid-cols-2">
        <Frame title="Cores semânticas">
          <div className="grid grid-cols-2 gap-3">
            {SEMANTIC.map((s) => (
              <div key={s.label} className="rounded-xl p-4" style={{ background: `var(--od-${s.name}-soft)` }}>
                <div className="flex items-center gap-2 text-sm font-bold" style={{ color: `var(--od-${s.name})` }}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: `var(--od-${s.name})` }} /> {s.label}
                </div>
                <div className="mt-1 font-mono text-[11px]" style={{ color: `var(--od-${s.name})` }}>
                  --od-{s.name}
                </div>
              </div>
            ))}
          </div>
        </Frame>
        <Frame title="Contraste (WCAG 2.1)">
          <p className="mb-3 text-xs text-ink-subtle">
            Medido nos tokens reais de <Code>tokens.css</Code> (claro e escuro), com as cores translúcidas compostas sobre o painel. Texto ≥ {MIN_RATIO.text}:1 · bordas, foco e ícones de estado ≥ {MIN_RATIO.ui}:1. Mesma lista do <Code>npm run test:design</Code>.
          </p>
          <div className="space-y-1.5" data-contrast-table>
            {CONTRAST_PAIRS.map((p) => (
              <div key={pairId(p)} className="flex items-center gap-2" data-contrast-pair={pairId(p)}>
                {THEMES.map((th) => {
                  const r = measurePair(TOKENS[th.id], p);
                  return (
                    <span key={th.id} className="flex h-8 w-11 shrink-0 items-center justify-center rounded-lg text-sm font-bold ring-1 ring-line" style={{ background: r.bg, color: r.fg }} title={`${th.label}: ${r.fg} sobre ${r.bg}`} aria-hidden="true">
                      {p.kind === 'text' ? 'Aa' : '◼'}
                    </span>
                  );
                })}
                <span className="min-w-0 flex-1 truncate text-sm text-ink" title={`--od-${p.fg} sobre --od-${p.bg}`}>{PAIR_LABELS[pairId(p)] ?? pairId(p)}</span>
                {THEMES.map((th) => {
                  const r = measurePair(TOKENS[th.id], p);
                  const grade = contrastGrade(r.ratio, p.kind);
                  return (
                    <span key={th.id} className="flex shrink-0 items-center gap-1.5" data-theme-result={th.id} data-grade={grade}>
                      <span className="w-12 text-end text-sm font-semibold tabular-nums text-ink">{r.ratio.toFixed(1)}:1</span>
                      <span className={cn('w-12 rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold', grade === 'Falha' ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success')}>
                        <span className="sr-only">{th.label}: </span>{grade}
                      </span>
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
        </Frame>
      </div>

      <Frame title="Cores de conteúdo do board">
        <div>
          <div>
            <SubTitle>Post-its (16) · texto {STICKY_TEXT_COLOR}</SubTitle>
            <p className="-mt-1 mb-3 text-xs text-ink-subtle">
              16 matizes a cada 22,5° (OKLCH), claridade pastel alternada. Post-its são conteúdo: mesmas cores nos dois temas. Contraste = texto {STICKY_TEXT_COLOR} sobre a nota (mínimo exigido 4,5:1).
            </p>
            <div className="grid gap-4 lg:grid-cols-2">
              {(['light', 'dark'] as const).map((tone) => (
                <div key={tone} className="rounded-xl p-3 ring-1 ring-line" style={{ background: tone === 'light' ? '#F5F6F8' : '#16161A' }}>
                  <div className="mb-2 text-2xs font-semibold uppercase tracking-wide" style={{ color: tokenValue(TOKENS[tone], 'text-muted') }}>
                    Canvas {tone === 'light' ? 'claro #F5F6F8' : 'escuro #16161A'}
                  </div>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                    {STICKY_PALETTE.map((c) => {
                      const ratio = contrastRatio(STICKY_TEXT_COLOR, c.hex);
                      return (
                        <div
                          key={c.id}
                          className="flex aspect-square flex-col justify-between rounded-[3px] p-1.5 text-[#1C1C1E] shadow-[0_1px_2px_rgba(0,0,0,0.12),0_4px_8px_-4px_rgba(0,0,0,0.25)]"
                          style={{ background: c.hex }}
                          title={`${c.name} ${c.hex} · contraste ${ratio.toFixed(1)}:1`}
                        >
                          <span className="text-2xs font-semibold leading-tight">{c.name}</span>
                          <span className="font-mono text-2xs leading-tight opacity-80">
                            {c.hex}
                            <br />
                            {ratio.toFixed(1)}:1{c.hex === DEFAULT_STICKY_COLOR ? ' · padrão' : ''}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-8 grid gap-8 lg:grid-cols-[316px_minmax(0,1fr)]">
          <Block title="Onde se escolhe: bandeja Post-it (Dock)" note="Mesmas 16 cores, em 8 × 2 mini-notas com fita; o nome da cor aparece no cabeçalho ao passar o mouse. Na Cinta, a gaveta de cor usa a mesma ordem.">
            <TrayMock />
          </Block>
          <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <SubTitle>Boards antigos</SubTitle>
            <p className="text-xs text-ink-subtle">
              Post-its gravados com a paleta anterior mantêm a cor salva (nada é migrado). A nota escura antiga continua com texto claro ({STICKY_TEXT_COLOR_ON_DARK}) via <code className="font-mono">isDarkSticky</code>.
            </p>
          </div>
          <div>
            <SubTitle>Tinta (texto / contorno)</SubTitle>
            <div className="grid grid-cols-12 gap-1.5">
              {INK_COLORS.map((c) => (
                <div key={c} className="aspect-square rounded-full ring-1 ring-black/10 dark:ring-white/15" style={{ background: c }} title={c} />
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-subtle">No modo escuro, tinta quase preta sobre o canvas é exibida clara automaticamente (adaptInk).</p>
          </div>
          <div>
            <SubTitle>Tags (texto escolhido por contraste)</SubTitle>
            <div className="flex flex-wrap gap-1.5">
              {TAG_COLORS.map((c, i) => (
                <span key={c} className="rounded-full px-2.5 py-1 text-[12px] font-semibold" style={{ background: c, color: tagTextColor(c) }}>
                  Tag {i + 1}
                </span>
              ))}
            </div>
          </div>
          <div>
            <SubTitle>Cores das pessoas (ao vivo)</SubTitle>
            <div className="flex flex-wrap gap-1.5">
              {COLLABORATOR_PALETTE.map((c) => (
                <span key={c} className="h-6 w-6 rounded-full ring-2 ring-[var(--od-panel)]" style={{ background: c }} title={c} />
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-subtle">Cursor, caixa de seleção, etiqueta e pin de comentário de cada pessoa. A etiqueta escurece a cor quando preciso para o texto ter contraste AA.</p>
          </div>
          </div>
        </div>
      </Frame>

      <Frame title="Tipografia">
        <div className="grid gap-8 md:grid-cols-[1.2fr_1fr]">
          <div className="space-y-4">
            <TypeRow meta="Display · Fraunces 600 · 44/50">
              <span className="font-display text-4xl font-semibold tracking-[-0.02em]">Boa noite, Luka</span>
            </TypeRow>
            <TypeRow meta="Título · Fraunces 600 · 32/38">
              <span className="font-display text-3xl font-semibold">Comece algo novo</span>
            </TypeRow>
            <TypeRow meta="Seção · Figtree 700 · 17/24">
              <span className="text-lg font-bold">Confira os mais recentes</span>
            </TypeRow>
            <TypeRow meta="Corpo · Figtree 400 · 14/20">
              <span className="text-base">Painéis, menus e formulários usam 14 px como base.</span>
            </TypeRow>
            <TypeRow meta="Rótulo · Figtree 600 · 13/18">
              <span className="text-sm font-semibold">Exportar como imagem</span>
            </TypeRow>
            <TypeRow meta="Legenda · Figtree 400 · 12/16">
              <span className="text-xs text-ink-muted">Modificado por Luka · Hoje</span>
            </TypeRow>
            <TypeRow meta="Mono · IBM Plex Mono · 12">
              <span className="font-mono text-xs">--od-selection: #1F7A4C</span>
            </TypeRow>
          </div>
          <div className="rounded-2xl bg-panel-sunken p-5">
            <SubTitle>Princípios</SubTitle>
            <ul className="space-y-2 text-sm text-ink-muted">
              <li>• <strong className="text-ink">Figtree</strong> na interface: amigável, legível em tamanhos pequenos.</li>
              <li>• <strong className="text-ink">Fraunces</strong> só em títulos de destaque (saudações, telas de entrada).</li>
              <li>• Números tabulares (<Code>tabular-nums</Code>) em zoom, tamanhos e contagens.</li>
              <li>• O conteúdo do board tem {BOARD_FONTS.length} fontes em 5 categorias (Open Sans é a padrão).</li>
            </ul>
          </div>
        </div>
        <div className="mt-8 grid gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
          <Block title={`Fontes do conteúdo (${BOARD_FONTS.length})`} note="Categorias do seletor. Cada família só é baixada quando um texto a usa ou quando o nome aparece na tela no seletor (as declarações ficam em src/styles/fonts.css).">
            <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {FONT_GROUPS.map(([cat, label]) => (
                <div key={cat}>
                  <div className="text-[12.5px] font-semibold text-ink">
                    {label} <span className="font-normal text-ink-subtle">· {BOARD_FONTS.filter((f) => f.category === cat).length}</span>
                  </div>
                  <div className="text-xs leading-relaxed text-ink-muted">{BOARD_FONTS.filter((f) => f.category === cat).map((f) => f.name).join(' · ')}</div>
                </div>
              ))}
            </div>
          </Block>
          <Block title="Seletor de fontes (o real, versão compacta)" note="Busca, recentes e a categoria à direita; o nome vem escrito na própria fonte só nos itens visíveis. É o mesmo da gaveta Estilo do texto da Cinta.">
            <div className="od-pop w-full p-3">
              <FontPicker variant="compact" className="w-full" value="Open Sans" onPick={() => undefined} />
            </div>
          </Block>
        </div>
      </Frame>

      <div className="grid gap-6 lg:grid-cols-2">
        <Frame title="Raios e elevação">
          <div className="grid grid-cols-3 gap-4">
            {[
              { r: 6, label: 'sm · 6' },
              { r: 8, label: 'md · 8 (botões)' },
              { r: 12, label: 'xl · 12 (barras)' },
              { r: 16, label: '2xl · 16 (popovers)' },
              { r: 22, label: '3xl · 22 (seções)' },
              { r: 999, label: 'full (avatares)' },
            ].map((x) => (
              <div key={x.label}>
                <div className="h-14 bg-accent-soft ring-1 ring-brand-300/60" style={{ borderRadius: x.r }} />
                <div className="mt-1.5 text-xs text-ink-muted">{x.label}</div>
              </div>
            ))}
          </div>
          <div className="mt-6 grid grid-cols-3 gap-4">
            {[
              { cls: 'shadow-panel', label: 'panel — barras' },
              { cls: 'shadow-pop', label: 'pop — menus' },
              { cls: 'shadow-modal', label: 'modal — diálogos' },
            ].map((x) => (
              <div key={x.label}>
                <div className={cn('h-16 rounded-xl bg-panel', x.cls)} />
                <div className="mt-2 text-xs text-ink-muted">{x.label}</div>
              </div>
            ))}
          </div>
        </Frame>
        <Frame title="Espaçamento e movimento">
          <SubTitle>Grade de 4 px</SubTitle>
          <div className="flex items-end gap-3">
            {[4, 8, 12, 16, 24, 32].map((s) => (
              <div key={s} className="flex flex-col items-center gap-1">
                <div className="rounded-sm bg-brand-500" style={{ width: s, height: s }} />
                <span className="text-[11px] tabular-nums text-ink-subtle">{s}</span>
              </div>
            ))}
          </div>
          <SubTitle className="mt-6">Curvas e durações (passe o mouse)</SubTitle>
          <div className="space-y-2.5">
            {[
              { label: 'fast 120 ms · ease-out', dur: 120, ease: 'cubic-bezier(0.22,1,0.36,1)' },
              { label: 'base 180 ms · ease-out', dur: 180, ease: 'cubic-bezier(0.22,1,0.36,1)' },
              { label: 'slow 260 ms · ease-out', dur: 260, ease: 'cubic-bezier(0.22,1,0.36,1)' },
              { label: 'câmera 340 ms · easeOutCubic', dur: 340, ease: 'cubic-bezier(0.33,1,0.68,1)' },
              { label: 'spring 260 ms · overshoot leve', dur: 260, ease: 'cubic-bezier(0.34,1.36,0.64,1)' },
            ].map((m) => (
              <div key={m.label} className="group flex items-center gap-3">
                <div className="relative h-7 flex-1 rounded-full bg-panel-sunken">
                  <span
                    className="absolute left-1 top-1 h-5 w-5 rounded-full bg-brand-700 group-hover:left-[calc(100%-24px)] dark:bg-brand-300"
                    style={{ transition: `left ${m.dur}ms ${m.ease}` }}
                  />
                </div>
                <span className="w-[200px] text-xs text-ink-muted">{m.label}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-subtle">“Reduzir movimento” (Preferências → Acessibilidade) zera as transições.</p>
        </Frame>
      </div>

      <Frame title="Ícones">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <Block title="Genéricos — lucide-react" note="Só o que não é identidade do board: setas, fechar, busca, check, mais, informação, pessoas, e-mail, ajustes e afins; 18–20 px nas barras. Objeto, ferramenta ou ação do board (post-it, texto, cadeado, copiar, excluir, modelos, importar/exportar…) usa o ícone próprio. Todo ícone de botão tem tooltip com nome e atalho.">
            <div className="flex flex-wrap items-center gap-2">
              {[ArrowLeft, ChevronRight, X, Search, Check, Plus, Info, Users, Mail, Settings].map((Icon, i) => (
                <span key={i} className="flex h-11 w-11 items-center justify-center rounded-xl bg-panel-sunken text-ink">
                  <Icon size={20} />
                </span>
              ))}
            </div>
          </Block>
          <Block title="Próprios — “traço da pena” (tema da página e escuro)" note={<>Identidade do board: Dock, módulos, pin de comentário, bandejas, Caixa de ferramentas, Cinta e linha rápida dos menus. Grade 24, traço 1,75, pontas e junções redondas, UM detalhe de acento (<Code>acc</Code>: <Code>--od-accent-soft</Code>; ativo: <Code>--od-accent-contrast</Code>). Obra do projeto (MIT), um arquivo por ícone em <Code>src/components/icons/od/</Code>.</>}>
            <div className="grid gap-4 xl:grid-cols-2">
              <IconGrid />
              <div className="dark rounded-2xl">
                <IconGrid />
              </div>
            </div>
          </Block>
        </div>
      </Frame>

      <Frame title="Cursores por situação">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <CursorTable />
          <p className="text-xs leading-relaxed text-ink-subtle">
            Decididos num lugar só (<Code>cursorFor()</Code> em <Code>src/utils/cursors.ts</Code>); o DOM só muda quando o cursor muda. O cursor de rotação é um SVG próprio (24 px com versão 2x, ponto ativo no centro, fallback nativo <Code>grab</Code>).
          </p>
        </div>
      </Frame>
    </>
  );
}
