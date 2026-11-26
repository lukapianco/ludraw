/**
 * Design System · 4. Canvas e objetos — seleção, laço e imagens, post-it (tags, reações, adesivo, nota privada),
 * conectores e mapa mental, frames e apresentação, Kanban, Tabela e Comentários (Views reais).
 */
import { useMemo } from 'react';
import { ChevronLeft, ChevronRight, CircleCheck, EyeOff, LayoutList, RotateCw } from 'lucide-react';
import { TAG_COLORS, tagTextColor } from '../../../utils/stickyMeta';
import { cn } from '../../../utils/cn';
import { createComment, createFrame, createKanban, createMindMap, createTable } from '../../../utils/factory';
import { createKanbanCard, createKanbanColumn } from '../../../utils/kanban';
import { buildOrthogonalPath, routeAroundObstacles } from '../../../utils/connectors';
import { ConnectorLabelPill } from '../../elements/ConnectorView';
import { MindMapView } from '../../elements/MindMapView';
import { FrameView } from '../../elements/FrameView';
import { KanbanView } from '../../elements/KanbanView';
import { TableView } from '../../elements/TableView';
import { CommentPinView } from '../../elements/CommentPinView';
import { Block, Code, Frame, Legend, SubTitle } from '../dsKit';

export function Canvas() {
  return (
    <>
      <Frame title="Seleção, guias, laço e soltar imagens">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <SubTitle>Seleção, alças, smart guide e marquee</SubTitle>
            <div className="od-dot-bg relative h-[230px] overflow-hidden rounded-xl ring-1 ring-line">
              <div className="absolute left-[12%] top-[22%] h-[96px] w-[96px] rounded-[3px] bg-[#FBED7C] shadow-[0_6px_14px_-6px_rgba(20,30,24,0.28)]" />
              <div className="absolute left-[12%] top-[22%] h-[96px] w-[96px] outline outline-[1.5px] outline-[var(--od-selection)]">
                {['-left-1.5 -top-1.5', '-right-1.5 -top-1.5', '-bottom-1.5 -right-1.5', '-bottom-1.5 -left-1.5'].map((p) => (
                  <span key={p} className={cn('absolute h-3 w-3 rounded-full border-[1.5px] border-[var(--od-selection)] bg-white', p)} />
                ))}
                <span className="absolute -left-7 -bottom-7 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-panel text-ink-muted shadow-panel">
                  <RotateCw size={12} />
                </span>
              </div>
              <div className="absolute left-[46%] top-[22%] h-[64px] w-[120px] rounded-md border-2 border-[#194B32] bg-[#D0E4AE]" />
              <div className="absolute left-0 right-0 top-[22%] h-px bg-[var(--od-guide)]" />
              <div className="absolute bottom-4 left-[40%] h-[60px] w-[150px] rounded-sm border border-[var(--od-selection)] bg-[var(--od-selection-fill)]" />
              <span className="absolute bottom-3 right-3 rounded-md bg-[#18211c] px-2 py-1 text-xs font-semibold text-white dark:bg-[#eceee9] dark:text-[#12301f]">45°</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
              <Legend color="var(--od-selection)">Seleção + alças</Legend>
              <Legend color="var(--od-guide)">Smart guide</Legend>
              <Legend color="var(--od-selection-fill)" outline>Marquee</Legend>
            </div>
          </div>
          <div>
            <SubTitle>Laço e soltar imagens</SubTitle>
            <div className="flex flex-wrap gap-4">
              <svg width="170" height="110" viewBox="0 0 170 110" className="rounded-xl bg-canvas ring-1 ring-line">
                <rect x="28" y="28" width="34" height="34" rx="2" fill="#AACAFF" />
                <rect x="92" y="40" width="34" height="34" rx="2" fill="#FFB9D9" />
                <path d="M20 20 C 60 4, 140 14, 148 44 S 120 100, 70 92 S 6 60, 20 20 Z" fill="var(--od-selection-fill)" stroke="var(--od-selection)" strokeWidth="1.5" strokeDasharray="6 4" />
              </svg>
              <div className="flex h-[110px] w-[170px] items-center justify-center rounded-xl border-2 border-dashed border-selection bg-[var(--od-selection-fill)] px-3 text-center text-xs font-semibold text-ink">
                Solte para inserir as imagens aqui
              </div>
            </div>
            <p className="mt-2 text-xs text-ink-subtle">Imagens: ≤ 1600 px, WebP/JPEG 0.85 (utils/images.ts). Laço: centro dentro ou contorno cruzando a caixa.</p>
          </div>
        </div>
      </Frame>

      <Frame title="Post-it: tags, reações, adesivo e nota privada">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div>
            <SubTitle>Tags, reações (normal · minha reação) e adesivo</SubTitle>
            <div className="od-dot-bg flex flex-wrap items-start gap-6 rounded-xl p-5 ring-1 ring-line">
              <div className="relative h-[180px] w-[180px] rounded-[2px] bg-[#FBED7C] p-4 shadow-[0_1px_1px_rgba(20,30,24,0.06),0_6px_14px_-6px_rgba(20,30,24,0.28)]">
                <div className="flex h-[96px] items-center justify-center text-center text-[17px] text-[#1C1C1E]">Onboarding em 3 passos</div>
                <div className="absolute inset-x-4 bottom-4 flex flex-col gap-1.5">
                  <div className="flex gap-1.5">
                    {[{ l: 'Produto', c: TAG_COLORS[2] }, { l: 'Urgente', c: TAG_COLORS[5] }].map((t) => (
                      <span key={t.l} className="rounded-full px-2 py-[3px] text-2xs font-semibold leading-none" style={{ background: t.c, color: tagTextColor(t.c) }}>
                        {t.l}
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/60 px-1.5 py-[3px] text-2xs font-semibold leading-none text-[#1C1C1E]">👍 3</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(25,75,50,0.16)] px-1.5 py-[3px] text-2xs font-semibold leading-none text-[#1C1C1E] ring-1 ring-[#194B32]">🔥 1</span>
                  </div>
                </div>
              </div>
              <div className="flex h-[120px] w-[150px] items-center justify-center text-[64px] leading-none" title="Sticker (emoji como objeto)">🚀</div>
            </div>
          </div>
          <div>
            <SubTitle>Nota privada (Modo Privado): autor × outros</SubTitle>
            <div className="od-dot-bg flex gap-5 rounded-xl p-5 ring-1 ring-line">
              <div className="relative flex h-[120px] w-[120px] items-center justify-center rounded-[2px] bg-[#AACAFF] p-3 text-center text-[14px] text-[#1C1C1E] shadow-[0_6px_14px_-6px_rgba(20,30,24,0.28)]">
                Ideia secreta
                <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full bg-[rgba(25,75,50,0.14)] px-1.5 py-0.5 text-2xs font-semibold text-[#194B32]">
                  <EyeOff size={9} /> Privada
                </span>
              </div>
              <div className="flex h-[120px] w-[120px] flex-col items-center justify-center gap-1.5 rounded-[2px] bg-[#AACAFF] p-3 shadow-[0_6px_14px_-6px_rgba(20,30,24,0.28)]">
                <div className="flex w-full flex-col items-center gap-1 blur-[3px]">
                  {[78, 62, 70].map((f) => (
                    <span key={f} className="block h-2 rounded-full bg-[#1C1C1E] opacity-30" style={{ width: `${f}%` }} />
                  ))}
                </div>
                <span className="text-[18px] font-bold tracking-[3px] text-[#1C1C1E] opacity-75">••••</span>
                <span className="flex items-center gap-1 text-2xs font-semibold text-[#1C1C1E] opacity-60">
                  <EyeOff size={9} /> Nota privada
                </span>
              </div>
            </div>
          </div>
        </div>
      </Frame>

      <Frame title="Conectores e mapa mental">
        <ConnectorsDemo />
      </Frame>

      <Frame title="Frames e apresentação">
        <FramesDemo />
      </Frame>

      <Frame title="Kanban, Tabela e Comentários">
        <WidgetsDemo />
      </Frame>
    </>
  );
}

/** Kanban, Tabela e pins de comentário com as Views reais. */
function WidgetsDemo() {
  const kanban = useMemo(
    () =>
      createKanban(
        { x: 0, y: 0 },
        {
          title: 'Sprint 12',
          columnWidth: 220,
          columns: [
            createKanbanColumn('A fazer', '#2C64A8', [createKanbanCard({ title: 'Login com e-mail', priority: 'high', storyPoints: 5, assignee: 'Ana Lima', tags: ['auth'] })]),
            { ...createKanbanColumn('Em andamento', '#E0A21B', [createKanbanCard({ title: 'Tempo real', priority: 'medium', storyPoints: 8, dueDate: '2026-11-20' })]), wipLimit: 3 },
            createKanbanColumn('Concluído', '#3A8156', [createKanbanCard({ title: 'Ambiente de testes', priority: 'low', storyPoints: 3 })]),
          ],
        },
      ),
    [],
  );
  const table = useMemo(() => createTable({ x: 0, y: 0 }, { data: [['Ação', 'Dono', 'Prazo'], ['Revisar fluxo', 'Ana', 'sex'], ['Testar export', 'Bruno', 'seg']], colWidths: [150, 90, 80], rowHeight: 34 }), []);
  const pins = useMemo(
    () => [
      createComment({ x: 0, y: 0 }, { id: 'a', author: 'Ana Lima', text: 'Revisar', createdAt: 0 }),
      { ...createComment({ x: 0, y: 0 }, { id: 'b', author: 'Bruno Reis', text: 'Ok', createdAt: 0 }), messages: [{ id: 'b', author: 'Bruno Reis', text: 'Ok', createdAt: 0 }, { id: 'c', author: 'Ana Lima', text: 'Feito', createdAt: 0 }] },
      { ...createComment({ x: 0, y: 0 }, { id: 'd', author: 'Carla Dias', text: 'Resolvido', createdAt: 0 }), resolved: true },
    ],
    [],
  );
  const k = Math.min(0.52, 300 / kanban.width);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Block title="Kanban · colunas, WIP, prioridade e pontos" note="Conteúdo com cores fixas (iguais nos dois temas). Barra de prioridade à esquerda; pílulas Alta/Média/Baixa, prazo (vermelho quando vencido) e pontos; avatar do responsável; contador “1/3” da coluna fica vermelho acima do WIP.">
        <div className="relative overflow-hidden rounded-xl bg-canvas p-3" style={{ height: kanban.height * k + 24 }}>
          <div className="relative origin-top-left" style={{ width: kanban.width, height: kanban.height, transform: `scale(${k})` }}>
            <KanbanView element={kanban} isEditing={false} />
          </div>
        </div>
      </Block>
      <Block title="Tabela · cabeçalho sálvia, grade e seleção" note="1ª linha como cabeçalho (fundo #E7F1D6, negrito). Intervalo selecionado com contorno --od-selection; bordas arrastáveis para redimensionar; “+” nos cantos cria linha/coluna.">
        <div className="flex h-[170px] items-center justify-center rounded-xl bg-canvas">
          <div className="relative" style={{ width: table.width, height: table.height }}>
            <TableView element={table} isEditing={false} />
            <div className="pointer-events-none absolute" style={{ left: table.colWidths[0], top: 34, width: table.colWidths[1], height: 34, boxShadow: 'inset 0 0 0 2px var(--od-selection)' }} />
          </div>
        </div>
      </Block>
      <Block title="Comentários · pins e conversa" note="Silhueta do ícone próprio de comentário (ponta no canto inferior esquerdo = posição), na cor do autor e escurecida quando preciso para as iniciais terem contraste AA; contador de mensagens e ✓ quando resolvido. A conversa flutua ao lado do pin; @menções em destaque.">
        <div className="flex h-[170px] items-center justify-center gap-6 rounded-xl bg-canvas">
          {pins.map((p) => (
            <div key={p.id} className="relative h-[40px] w-[40px]">
              <div className="absolute left-1 top-[36px] h-0 w-0">
                <CommentPinView element={p} isEditing={false} />
              </div>
            </div>
          ))}
          <div className="od-pop w-[150px] p-2.5 text-[11.5px] leading-snug text-ink">
            Vamos revisar com <span className="rounded bg-accent-soft px-0.5 font-semibold text-brand-900 dark:text-brand-200">@Ana Lima</span>
            <div className="mt-1.5 flex items-center gap-1 text-2xs text-ink-subtle">
              <CircleCheck size={11} /> Resolver
            </div>
          </div>
        </div>
      </Block>
    </div>
  );
}

/** Rótulo do conector, saltos de linha, desvio de objetos e mapa mental (componentes reais). */
function ConnectorsDemo() {
  const ink = 'var(--od-text)';
  const jumpH = [
    { x: 16, y: 70 },
    { x: 284, y: 70 },
  ];
  const vert = [
    { x: 150, y: 14 },
    { x: 150, y: 126 },
  ];
  const detour = routeAroundObstacles({ x: 96, y: 40 }, { x: 1, y: 0 }, { x: 64, y: 120 }, { x: 0, y: -1 }, [
    { x: 24, y: 20, width: 72, height: 40 },
    { x: 28, y: 120, width: 72, height: 40 },
  ]);
  const mindmap = useMemo(() => createMindMap({ x: 0, y: 0 }, { rootText: 'Tema', branches: ['Ideias', 'Riscos', 'Metas'] }), []);
  const mmScale = Math.min(1, 300 / Math.max(1, mindmap.width), 130 / Math.max(1, mindmap.height));
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div>
        <SubTitle>Rótulo na linha</SubTitle>
        <div className="relative flex h-[140px] items-center justify-center rounded-xl bg-canvas">
          <svg width="300" height="140" className="absolute inset-0 m-auto" aria-hidden="true">
            <path d="M 20 70 H 270" stroke={ink} strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M 260 64 L 272 70 L 260 76" stroke={ink} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="relative h-[140px] w-[300px]">
            {(
              [
                { at: 22, text: 'aprova', style: undefined },
                { at: 52, text: 'sim', style: { fillColor: '#FFF6A5', borderColor: '#B07D0A', borderWidth: 2, borderRadius: 0, fontWeight: 'bold', fontSize: 16 } },
                { at: 78, text: '2 dias', style: { fillColor: '#D0E4AE', textColor: '#194B32', borderWidth: 0, borderRadius: 999, fontSize: 12 } },
              ] as const
            ).map((p) => (
              <span key={p.text} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${p.at}%` }}>
                <ConnectorLabelPill text={p.text} borderColor={ink} labelStyle={p.style} />
              </span>
            ))}
          </div>
        </div>
        <p className="mt-2 text-xs text-ink-subtle">
          Padrão: pílula <Code>--od-panel</Code>, borda na cor da linha, texto <Code>--od-text</Code> (Figtree 600 14). Duplo clique fixa o texto no ponto clicado; arrastar a pílula desliza pela linha. <b>Aa · Texto</b> muda fonte, tamanho, cores, fundo (ou sem fundo), borda e cantos.
        </p>
      </div>
      <div>
        <SubTitle>Saltos de linha · desvio de objetos</SubTitle>
        <div className="flex h-[140px] items-center justify-around rounded-xl bg-canvas">
          <svg width="150" height="100" viewBox="75 20 150 100" aria-hidden="true">
            <path d={buildOrthogonalPath(vert, undefined, 2)} stroke={ink} strokeWidth="2" fill="none" />
            <path d={buildOrthogonalPath(jumpH, { 0: [150] }, 2)} stroke="var(--od-selection)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          </svg>
          <svg width="130" height="140" viewBox="0 0 160 170" aria-hidden="true">
            <rect x="24" y="20" width="72" height="40" rx="8" fill="var(--od-panel)" stroke={ink} strokeWidth="1.5" />
            <rect x="28" y="120" width="72" height="40" rx="8" fill="var(--od-panel)" stroke={ink} strokeWidth="1.5" />
            {detour && <path d={buildOrthogonalPath(detour, undefined, 2)} stroke="var(--od-selection)" strokeWidth="2.5" fill="none" strokeLinecap="round" />}
          </svg>
        </div>
        <p className="mt-2 text-xs text-ink-subtle">Trecho horizontal pula o vertical de outra linha em cotovelo (arco). A rota em cotovelo contorna a caixa dos objetos ligados.</p>
      </div>
      <div>
        <SubTitle>Mapa mental</SubTitle>
        <div className="flex h-[140px] items-center justify-center overflow-hidden rounded-xl bg-canvas">
          <div style={{ width: mindmap.width * mmScale, height: mindmap.height * mmScale }}>
            <div className="relative origin-top-left" style={{ width: mindmap.width, height: mindmap.height, transform: `scale(${mmScale})` }}>
              <MindMapView element={mindmap} isEditing={false} />
            </div>
          </div>
        </div>
        <p className="mt-2 text-xs text-ink-subtle">
          <span className="od-kbd">Tab</span> filho · <span className="od-kbd">Enter</span> irmão · <span className="od-kbd">Delete</span> remove o ramo · <span className="od-kbd">+</span>/<span className="od-kbd">−</span> recolhe/expande · setas navegam. Cores de ramo fixas (conteúdo do board).
        </p>
      </div>
    </div>
  );
}

/** FrameView real (normal e com conteúdo oculto), exportar e controles da apresentação. */
function FramesDemo() {
  const normal = useMemo(() => createFrame({ x: 0, y: 0, width: 150, height: 84 }, { title: 'Descoberta', ratioPreset: '16:9' }), []);
  const hidden = useMemo(() => ({ ...createFrame({ x: 0, y: 0, width: 150, height: 84 }, { title: 'Votação', ratioPreset: '16:9', fillColor: '#F4F9EC' }), hiddenContent: true }), []);
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div>
        <SubTitle>Frame · cabeçalho com título e olhinho</SubTitle>
        <div className="flex h-[200px] items-center justify-center gap-4 rounded-xl bg-canvas px-4 pt-6">
          {[normal, hidden].map((f) => (
            <div key={f.id} className="relative shrink-0" style={{ width: f.width, height: f.height }}>
              <FrameView element={f} isEditing={false} />
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-subtle">
          Cabeçalho em tamanho fixo de tela (Figtree 600 13, <Code>text-ink-muted</Code>); corpo com a cor do frame e contorno sutil. O olhinho só aparece para quem pode (<Code>frame.toggleHidden</Code>); oculto = capa “Conteúdo oculto”, também no export e nas miniaturas.
        </p>
      </div>
      <div>
        <SubTitle>Exportar frame (Cinta / menu do objeto)</SubTitle>
        <div className="flex h-[200px] items-center justify-center rounded-xl bg-canvas">
          <div className="od-pop flex w-[220px] flex-col p-1.5">
            <div className="px-2 pb-1 pt-0.5 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">Exportar “Descoberta”</div>
            <span className="od-menu-item">PDF (alta resolução)</span>
            <span className="od-menu-item is-hover">PNG — Alta qualidade (2x)</span>
            <span className="od-menu-item">PNG — Ultra HD (4x)</span>
            <span className="od-menu-item">SVG vetorial</span>
          </div>
        </div>
        <p className="mt-2 text-xs text-ink-subtle">
          Recorte exato da área do frame, com <Code>allowExport()</Code> (permissão + registro “exportou”) e a máscara do Modo Privado. Frame A4 vira página A4 no PDF.
        </p>
      </div>
      <div>
        <SubTitle>Modo Apresentação</SubTitle>
        <div className="relative flex h-[200px] items-center justify-center overflow-hidden rounded-xl bg-canvas">
          <div className="-mt-10 h-[90px] w-[160px] rounded-[3px] bg-white shadow-panel" />
          <div className="od-pop absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-1">
            <span className="od-tool h-7 w-7 rounded-full">
              <LayoutList size={14} />
            </span>
            <span className="od-divider-v" />
            <span className="od-tool h-7 w-7 rounded-full">
              <ChevronLeft size={16} />
            </span>
            <span className="whitespace-nowrap px-1.5 text-[12px] text-ink">
              <b className="tabular-nums">2/5</b>
              <span className="text-ink-muted"> · Descoberta</span>
            </span>
            <span className="od-tool h-7 w-7 rounded-full">
              <ChevronRight size={16} />
            </span>
          </div>
          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-[var(--od-border)]">
            <div className="h-full w-2/5 bg-accent" />
          </div>
        </div>
        <p className="mt-2 text-xs text-ink-subtle">
          Tela cheia, um frame por slide (ordem do Roteiro). <span className="od-kbd">←</span>/<span className="od-kbd">→</span>, espaço, <span className="od-kbd">Esc</span> sai; controles em pílula <Code>.od-pop</Code> somem com o mouse parado; barra de progresso <Code>bg-accent</Code>. Sem edição.
        </p>
      </div>
    </div>
  );
}
