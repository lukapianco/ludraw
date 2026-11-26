/**
 * Design System · 3. Estúdio (o board por fora) — os quatro módulos, os selos de estado da barra do topo, Dock e
 * Caixa de ferramentas, Cinta do objeto (com bloqueio e tags) e a Linha do tempo com a atividade.
 */
import { Check, Layers, Search } from 'lucide-react';
import { AdvancedLockIcon, LockIcon } from '../../icons/od';
import { TAG_COLORS, tagTextColor } from '../../../utils/stickyMeta';
import { cn } from '../../../utils/cn';
import { LiveBadge, SyncBadge } from '../../toolbar/TopBar';
import { Block, Code, Frame } from '../dsKit';
import { LocalModeNotice, LocalOnlyBadge } from '../../dashboard/LocalModeBanner';
import { useState } from 'react';
import type { TextualElement } from '../../../types/canvas';
import { TextStyleDrawer } from '../../toolbar/FloatingContextToolbar';
import { ConversationsMock, EmojiTrayMock, ExtensionWindowMock, FichaMock, FrameTrayMock, PenTrayMock, PreviewMock, ScriptMock, ShapesTrayMock, StripMock, StudioMock, ThemePane, TimelineMock, ToolboxMock, YouMock } from '../studioMocks';

export function Studio() {
  return (
    <>
      <Frame title="Visão geral: barra do topo, Vista, Tempo, Dock e gaveta">
        <div className="grid gap-6 xl:grid-cols-2">
          <ThemePane title="Tema da página (troque em “Modo claro/escuro” no topo)">
            <StudioMock />
          </ThemePane>
          <ThemePane title="Escuro (sempre)" dark>
            <StudioMock />
          </ThemePane>
        </div>
        <p className="mt-3 text-xs text-ink-subtle">
          Regras em <Code>docs/DESIGN_SYSTEM.md</Code> §4 (Estúdio v2). Uma função, um lugar: cada módulo abre as próprias gavetas, presas ao botão que as abriu (cabeçalho · conteúdo · rodapé; <span className="od-kbd">Esc</span> devolve o foco). Vista e Tempo são medidos contra a Dock e ficam compactos quando falta espaço.
        </p>
      </Frame>

      <Frame title="Gavetas da barra do topo e da Vista">
        <div className="grid items-start gap-6 md:grid-cols-2">
          <Block title="Ficha do board (lugar + nome)" note="Grade 4 × 2, detalhes e lixeira. Exportar… e Importar… abrem o modal de sempre.">
            <FichaMock />
          </Block>
          <Block title="Conversas (Roda)" note="Filtros, cartões com onde está, respostas e “Ir até” (a câmera vai ao pin, que pisca).">
            <ConversationsMock />
          </Block>
          <Block title="Você (avatar)" note="Aparência, edição, acessibilidade e avisos; Configurações completas ficam em #/settings.">
            <YouMock />
          </Block>
          <Block title="Roteiro (Vista)" note="Ordem dos slides, ▷ por frame e a vista inicial do board.">
            <ScriptMock />
          </Block>
        </div>
      </Frame>

      <Frame title="Selos de estado da barra do topo">
        <div className="grid gap-6 lg:grid-cols-3">
          <Block title="Modo Local" note="Salvo neste navegador; pulsa enquanto grava.">
            <div className="flex flex-wrap items-center gap-4 rounded-xl bg-panel p-3 text-[12px] font-semibold text-ink-subtle ring-1 ring-line">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success" /> Salvo</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 animate-pulse rounded-full bg-warning" /> Salvando…</span>
            </div>
          </Block>
          <Block title="Envio ao servidor" note="Mesmo lugar e forma do selo local; cor pelo estado (success, warning, danger).">
            <div className="flex flex-wrap gap-2 rounded-xl bg-panel p-3 ring-1 ring-line">
              {(['saved', 'saving', 'offline', 'conflict', 'denied'] as const).map((s) => (
                <SyncBadge key={s} status={s} />
              ))}
            </div>
          </Block>
          <Block title="Edição ao vivo" note="Ao vivo success; conectando/sincronizando warning pulsando; sem conexão warning (“Sem conexão”, frase longa na dica); somente leitura ink-subtle. Abaixo de 1180 px fica só o ponto.">
            <div className="flex flex-wrap gap-2 rounded-xl bg-panel p-3 ring-1 ring-line">
              {(['live', 'syncing', 'connecting', 'offline', 'readOnly'] as const).map((s) => (
                <LiveBadge key={s} status={s} />
              ))}
            </div>
          </Block>
          <Block title="Só neste navegador" note="Modo Local com servidor disponível: pílula accent-soft com HardDrive logo depois do selo de estado da Ficha (abaixo de 1180 px fica só o ícone). Abre a gaveta Você, que traz no topo o bloco Modo Local com “Entrar no servidor “<organização>””.">
            <div className="space-y-3 rounded-xl bg-panel p-3 ring-1 ring-line">
              <div className="flex items-center gap-1 text-[12px] font-semibold text-ink-subtle">
                <span className="inline-flex items-center gap-1.5 px-2"><span className="h-2 w-2 rounded-full bg-success" /> Salvo</span>
                <LocalOnlyBadge demo />
              </div>
              <div className="-mx-3 max-w-[320px] pb-1">
                <LocalModeNotice demo />
              </div>
            </div>
          </Block>
        </div>
      </Frame>

      <Frame title="Dock e Caixa de ferramentas">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="space-y-3 text-sm text-ink-muted">
            <p>
              <strong className="text-ink">Dock</strong> (base, centro): Inserção rápida · Mão · Selecionar · Laço │ Post-it · Texto · Formas · Conector · Pena │ Frame · Imagem · Emojis e adesivos · Comentário │ Caixa de ferramentas. Botão com bandeja leva um ponto de 4 px no canto.
            </p>
            <p>
              <strong className="text-ink">Bandejas</strong> abrem acima do botão, com língua de 14 px apontando para o centro dele (até nas bordas). Exemplo: a bandeja Post-it, em Fundamentos › Cores de conteúdo.
            </p>
            <p className="text-xs text-ink-subtle">“Reduzir movimento” troca o deslize das bandejas por opacidade.</p>
          </div>
          <Block title="Caixa de ferramentas (/)" note="Busca já focada, filtro Tudo · Do LuDraw · Extensões, seções por intenção e “Das extensões ativas”; itens “Em breve” visíveis e desabilitados.">
            <ToolboxMock />
          </Block>
        </div>
        <div className="mt-8 grid items-start gap-6 md:grid-cols-2 xl:grid-cols-4">
          <Block title="Bandeja Formas">
            <ShapesTrayMock />
          </Block>
          <Block title="Bandeja Pena">
            <PenTrayMock />
          </Block>
          <Block title="Bandeja Frame (proporções desenhadas)">
            <FrameTrayMock />
          </Block>
          <Block title="Emojis e adesivos (Shift + E)">
            <EmojiTrayMock />
          </Block>
        </div>
      </Frame>

      <Frame title="Cinta do objeto">
        <Block title="Cinta do objeto — 5 estados" note="Peça única 44 px, raio 14, lingueta para a seleção, segue o tema (frame incluído). Identidade · chips de valor · alternâncias · | Comentar · Bloqueio avançado · Bloquear · ⋯. Travado: o meio esmaece e fica inerte; o cadeado destrava segurando 2 s (mouse ou Enter/Espaço) — o cadeado abaixo é o real.">
          <div className="grid gap-4 lg:grid-cols-2">
            <StripMock state="texto" />
            <StripMock state="conector" />
            <StripMock state="frame" />
            <StripMock state="varios" />
            <StripMock state="travado" />
          </div>
        </Block>
        <div className="mt-8 grid gap-6 lg:grid-cols-2 xl:grid-cols-[360px_minmax(0,1fr)_minmax(0,1fr)]">
          <Block title="Gaveta Estilo do texto (a real)" note="Lista de fontes curta (só ela encolhe quando falta altura), tamanho, ênfase, lista, alinhamento, recuo e marca-texto à vista sem rolar.">
            <TextStyleDemo />
          </Block>
          <div>
            <div className="mb-3 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">Bloqueio em 3 níveis (selo na seleção + Cinta: Bloquear e Bloqueio avançado)</div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex h-6 items-center gap-1 rounded-full bg-panel px-1.5 text-ink-muted shadow-panel">
                <LockIcon size={12} strokeWidth={2.4} />
              </span>
              <span className="inline-flex h-6 items-center gap-1 rounded-full bg-brand-900 px-1.5 text-brand-200 shadow-panel dark:bg-brand-200 dark:text-brand-900">
                <AdvancedLockIcon size={12} strokeWidth={2.4} />
              </span>
              <span className="inline-flex h-6 items-center gap-1 rounded-full bg-brand-900 px-1.5 text-brand-200 shadow-panel dark:bg-brand-200 dark:text-brand-900">
                <AdvancedLockIcon size={12} strokeWidth={2.4} />
                <Layers size={12} strokeWidth={2.4} />
              </span>
              <span className="od-panel inline-flex h-11 items-center gap-2 px-3 text-[12.5px] font-semibold text-brand-900 dark:text-brand-200">
                <AdvancedLockIcon size={17} /> Bloqueio protegido
              </span>
            </div>
            <p className="mt-2 text-xs text-ink-subtle">Padrão: segurar 2 s · Protegido: só facilitador/admin/quem travou (confirmação) · Estrutura de fundo: atrás das notas, fora do marquee e do laço.</p>
          </div>
          <div>
            <div className="mb-3 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">Gaveta de tags (post-it)</div>
            <div className="od-pop w-[250px] p-2">
              <span className="flex h-8 items-center gap-2 rounded-md px-2.5 text-[13px] text-ink-subtle ring-1 ring-line-strong">
                <Search size={14} /> Buscar ou criar tag…
              </span>
              {[
                { l: 'Produto', c: TAG_COLORS[2], st: 'all' },
                { l: 'Urgente', c: TAG_COLORS[5], st: 'some' },
                { l: 'Ideia', c: TAG_COLORS[1], st: 'none' },
              ].map((t) => (
                <div key={t.l} className="od-menu-item min-h-[32px] gap-2 text-[13px]">
                  <span className={cn('flex h-4 w-4 items-center justify-center rounded-[4px] ring-1', t.st === 'none' ? 'ring-line-strong' : 'bg-selection text-on-selection ring-selection')}>
                    {t.st === 'all' && <Check size={12} strokeWidth={3} />}
                    {t.st === 'some' && <span className="h-0.5 w-2 rounded bg-current" />}
                  </span>
                  <span className="rounded-full px-2 py-0.5 text-[12px] font-semibold" style={{ background: t.c, color: tagTextColor(t.c) }}>
                    {t.l}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Frame>

      <Frame title="Linha do tempo e atividade">
        <div className="grid gap-6 lg:grid-cols-2">
          <Block title="Linha do tempo (Tempo → ampulheta)" note="Versões como pontos (segurança em warning), atividade como barras; escolher um ponto mostra a prévia somente leitura no próprio canvas.">
            <TimelineMock />
          </Block>
          <div>
            <div className="mb-3 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">Atividade (Linha do tempo → Ver eventos)</div>
            <div className="od-pop w-full max-w-[320px] p-2">
              {[
                { n: 'Luka Piancó', c: '#3A8156', t: 'Luka Piancó adicionou 3 post-its', m: 'agora mesmo · Administrador' },
                { n: 'Ana Souza', c: '#2C64A8', t: 'Ana Souza travou 2 formas como estrutura de fundo', m: 'há 4 min · Membro' },
                { n: 'Luka Piancó', c: '#3A8156', t: 'Luka Piancó encerrou o Modo Privado e revelou 6 notas', m: 'há 12 min · Administrador' },
              ].map((e) => (
                <div key={e.t} className="flex items-start gap-2.5 rounded-lg px-1.5 py-2">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-2xs font-bold text-white" style={{ background: e.c }}>
                    {e.n.split(' ').map((p) => p[0]).join('').slice(0, 2)}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] leading-snug text-ink">{e.t}</span>
                    <span className="text-[11px] text-ink-subtle">{e.m}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
          <Block wide title="Prévia de uma versão (somente leitura)" note="Escolher um ponto da linha do tempo mostra o board daquele momento no próprio canvas, em sépia, com câmera própria e fade entre versões; Esc ou “Voltar ao agora” sai.">
            <PreviewMock />
          </Block>
        </div>
      </Frame>

      <Frame title="Janela flutuante de extensão">
        <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <ExtensionWindowMock />
          <p className="text-xs leading-relaxed text-ink-subtle">
            O painel de uma extensão (<Code>ludraw.ui.showPanel</Code>) abre num cartão <Code>.od-pop</Code> de 340 px, arrastável pelo cabeçalho e sempre dentro da tela; <span className="od-kbd">Esc</span> fecha e as setas movem a janela (Shift = passo maior). O iframe continua isolado. Também abre pela Caixa de ferramentas → Das extensões ativas e pelo <span className="od-kbd">Ctrl K</span>.
          </p>
        </div>
      </Frame>
    </>
  );
}

/** A gaveta real da Cinta, com estado local (nada vai para o board). */
function TextStyleDemo() {
  const [font, setFont] = useState('Fraunces');
  const [size, setSize] = useState<number | 'auto'>(56);
  const [el, setEl] = useState({ fontWeight: 'bold', fontStyle: 'normal', underline: false, strikethrough: false, listStyle: 'none', textAlign: 'left', indent: 0, highlightColor: null } as unknown as TextualElement);
  return (
    <div className="od-pop flex w-[340px] max-w-full flex-col overflow-hidden rounded-2xl">
      <div className="flex items-center gap-2 px-3 pb-1 pt-2.5">
        <span className="text-[12.5px] font-bold text-ink">Estilo do texto</span>
        <span className="flex-1" />
        <span className="text-[11px] font-semibold text-ink-subtle">Ctrl B · I · U</span>
      </div>
      <div className="flex max-h-[520px] flex-col">
        <TextStyleDrawer
          fontName={font}
          size={size}
          allowAuto={false}
          first={el}
          onFont={setFont}
          onSize={setSize}
          onStep={(d) => setSize((s) => (typeof s === 'number' ? Math.max(1, s + d * 2) : 16))}
          onPatch={(fn) => setEl((cur) => ({ ...cur, ...fn(cur) }) as TextualElement)}
        />
      </div>
      <div className="flex justify-between gap-3 border-t border-line px-3.5 py-2 text-[11.5px] text-ink-subtle">
        <span>Fonte, tamanho e posição num só lugar</span>
        <span className="font-mono">Esc fecha</span>
      </div>
    </div>
  );
}
