/**
 * LuDraw — Exportação: PNG (1x/2x/4x), PDF, backup `.ludraw` (JSON), CSV,
 * "copiar como imagem" e miniaturas do dashboard.
 *
 * O renderizador abaixo desenha os elementos em Canvas 2D usando a MESMA geometria
 * (utils/shapes.ts) e a MESMA tipografia (utils/text.ts) do DOM — o resultado é fiel à tela.
 * Chat 05: SVG vetorial (mesmo desenho gravado por `SvgRecorderContext`), PDF de várias páginas
 * (por frames) e CSV sempre protegido contra injeção de fórmulas.
 */

import type { BoardData, CanvasElement, ConnectorLabelStyle, TextualElement } from '../types/canvas';
import type { BoardBackupFile, ThemeMode } from '../types/workspace';
import { adaptInk, CANVAS_COLORS, isTransparent, withAlpha } from './color';
import {
  arrowheadPath,
  arrowSize,
  buildOrthogonalPath,
  computeLineJumps,
  computeRoute,
  connectorLabelPoint,
  connectorLabelBox,
  type ElementLookup,
  type SegmentJumps,
  strokeDasharray,
} from './connectors';
import { drawMindMapToCanvas } from './mindmap';
import { drawKanbanToCanvas } from './kanban';
import { drawTableToCanvas } from './table';
import { frameTitleFontSize, isHiddenByFrame } from './frames';
import { getElementText, isDarkSticky, stickyTextColor } from './factory';
import { ensureFontsForElements } from './fontLoading';
import { expandRect, getBoundsOfElements, type Rect } from './math';
import { shapeElementDecoration, shapeElementPath, shapeElementTextInsets } from './shapes';
import {
  canvasFont,
  fitFontSize,
  formatListLines,
  LINE_HEIGHT,
  measureTextWidth,
  resolveTextStyle,
  type ResolvedTextStyle,
  wrapText,
} from './text';
import { slugifyFileName } from './format';
import { pathFromSvg } from './path2d';
import { isValidComposite, layoutComposite } from './composite';
import { SvgRecorderContext } from './svgContext';
import { toCsv } from './csv';
import { preloadImages } from './images';
import { stickyFooterLayout, tagTextColor } from './stickyMeta';
import { isPrivateDraftHidden } from './permissions';
import { t } from '../i18n';

export interface RenderOptions {
  scale: number;
  padding: number;
  background: string | null;
  theme: ThemeMode;
  /** Limite de pixels por lado (navegadores costumam limitar canvas em ~16k) */
  maxSide?: number;
  bounds?: Rect;
  /** Modo Privado: mascara as notas que o espectador não pode ver (mesma regra da tela) */
  privacy?: { viewerId: string; simulateParticipant: boolean };
}

const STICKY_PADDING_RATIO = 0.09;

function stickyPadding(w: number, h: number): number {
  return Math.min(w, h) * STICKY_PADDING_RATIO;
}

/** Desenha um bloco de texto já quebrado em linhas dentro de uma caixa. */
function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  text: string,
  box: Rect,
  fontSize: number,
  style: ResolvedTextStyle,
  verticalAlign: 'top' | 'middle' | 'bottom',
): void {
  if (!text) return;
  const font = canvasFont(fontSize, style);
  const formatted = formatListLines(text, style.listStyle, style.indent).join('\n');
  const lines = wrapText(formatted, Math.max(1, box.width), font);
  const lineH = fontSize * LINE_HEIGHT;
  const totalH = lines.length * lineH;
  let y = verticalAlign === 'middle' ? box.y + (box.height - totalH) / 2 : verticalAlign === 'bottom' ? box.y + box.height - totalH : box.y;
  ctx.font = font;
  ctx.textBaseline = 'middle';
  for (const line of lines) {
    const w = measureTextWidth(line, font);
    let x = box.x;
    if (style.textAlign === 'center') x = box.x + (box.width - w) / 2;
    if (style.textAlign === 'right') x = box.x + box.width - w;
    const cy = y + lineH / 2;
    if (style.highlightColor && line.trim()) {
      ctx.fillStyle = style.highlightColor;
      ctx.fillRect(x - 2, y + lineH * 0.1, w + 4, lineH * 0.8);
    }
    ctx.fillStyle = style.color;
    ctx.fillText(line, x, cy);
    if (style.underline || style.link) {
      ctx.fillRect(x, cy + fontSize * 0.42, w, Math.max(1, fontSize / 14));
    }
    if (style.strikethrough) {
      ctx.fillRect(x, cy - fontSize * 0.02, w, Math.max(1, fontSize / 14));
    }
    y += lineH;
  }
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Corta o texto com "…" para caber em `maxWidth`. */
function ellipsize(text: string, maxWidth: number, font: string): string {
  if (measureTextWidth(text, font) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && measureTextWidth(`${out}…`, font) > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}

const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

/** Rodapé do post-it (tags + reações) — mesma geometria de `stickyFooterLayout` usada no DOM. */
function drawStickyFooter(ctx: CanvasRenderingContext2D, el: Extract<CanvasElement, { type: 'sticky' }>, pad: number, dark: boolean): void {
  const f = stickyFooterLayout(el);
  if (!f.height) return;
  const maxX = el.width - pad;
  const fontUi = `600 ${f.fontSize}px Figtree, system-ui, sans-serif`;
  let y = el.height - pad - f.height + f.gap;
  ctx.textBaseline = 'middle';
  if (f.tags.length) {
    let x = pad;
    const items = [...f.tags.map((t) => ({ label: t.label, bg: t.color, fg: tagTextColor(t.color) }))];
    if (f.extraTags) items.push({ label: `+${f.extraTags}`, bg: dark ? 'rgba(255,255,255,0.22)' : 'rgba(20,30,24,0.12)', fg: dark ? '#F4F5F2' : '#1C1C1E' });
    for (const it of items) {
      const padX = f.fontSize * 0.6;
      const room = maxX - x;
      if (room < f.fontSize * 2) break;
      const label = ellipsize(it.label, Math.min(room, (el.width - pad * 2) * 0.62) - padX * 2, fontUi);
      const w = measureTextWidth(label, fontUi) + padX * 2;
      ctx.fillStyle = it.bg;
      roundRectPath(ctx, x, y, w, f.pillHeight, f.pillHeight / 2);
      ctx.fill();
      ctx.fillStyle = it.fg;
      ctx.font = fontUi;
      ctx.fillText(label, x + padX, y + f.pillHeight / 2);
      x += w + f.gap;
    }
    y += f.pillHeight + f.gap;
  }
  if (f.reactions.length) {
    let x = pad;
    const fontEmoji = `${f.fontSize * 1.05}px ${EMOJI_FONT}`;
    for (const [emoji, count] of f.reactions) {
      const countText = String(count);
      const padX = f.fontSize * 0.45;
      const w = measureTextWidth(emoji, fontEmoji) + measureTextWidth(countText, fontUi) + padX * 2 + f.fontSize * 0.3;
      if (x + w > maxX) break;
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.62)';
      roundRectPath(ctx, x, y, w, f.pillHeight, f.pillHeight / 2);
      ctx.fill();
      ctx.font = fontEmoji;
      ctx.fillStyle = '#1C1C1E';
      ctx.fillText(emoji, x + padX, y + f.pillHeight / 2);
      ctx.font = fontUi;
      ctx.fillStyle = dark ? '#F4F5F2' : '#1C1C1E';
      ctx.fillText(countText, x + w - padX - measureTextWidth(countText, fontUi), y + f.pillHeight / 2);
      x += w + f.gap;
    }
  }
}

/** Imagens decodificadas para o render atual (preenchido por `renderElementsToCanvas`). */
let renderImages = new Map<string, HTMLImageElement>();
/** Regra de privacidade do render atual (preenchida por `renderElementsToCanvas`). */
let renderPrivacy: RenderOptions['privacy'];
/** Saltos de linha entre as linhas exportadas (mesma regra da tela — `computeLineJumps`). */
let renderJumps = new Map<string, SegmentJumps>();

/** Cores de "painel" do Design System por tema (espelham --od-panel / --od-text). */
const PANEL_INK = {
  light: { panel: '#FFFFFF', text: '#18211C' },
  dark: { panel: '#212126', text: '#ECEEE9' },
} as const;

/** Pílula do rótulo do conector — mesma geometria de `connectorLabelBox` usada na tela. */
function drawConnectorLabel(ctx: CanvasRenderingContext2D, label: string, at: { x: number; y: number }, lineColor: string, theme: ThemeMode, labelStyle?: ConnectorLabelStyle): void {
  const box = connectorLabelBox(label, labelStyle);
  const st = box.style;
  const x = at.x - box.width / 2;
  const y = at.y - box.height / 2;
  const radius = Math.min(st.borderRadius, box.height / 2, box.width / 2);
  const fill = st.fillColor ?? PANEL_INK[theme].panel;
  if (fill !== 'transparent') {
    ctx.save();
    ctx.shadowColor = theme === 'dark' ? 'rgba(0,0,0,0.35)' : 'rgba(20,36,26,0.10)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 1;
    roundRectPath(ctx, x, y, box.width, box.height, radius);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();
  }
  if (st.borderWidth > 0) {
    const bw = st.borderWidth;
    roundRectPath(ctx, x + bw / 2, y + bw / 2, box.width - bw, box.height - bw, Math.max(0, radius - bw / 2));
    ctx.lineWidth = bw;
    ctx.strokeStyle = st.borderColor ? adaptInk(st.borderColor, theme) : lineColor;
    ctx.setLineDash([]);
    ctx.stroke();
  }
  ctx.font = st.font;
  ctx.fillStyle = st.textColor ? adaptInk(st.textColor, theme) : PANEL_INK[theme].text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  box.lines.forEach((line, i) => ctx.fillText(line, at.x, y + st.borderWidth + st.padY + st.lineHeight * (i + 0.5)));
  ctx.textAlign = 'left';
}

function drawElement(ctx: CanvasRenderingContext2D, el: CanvasElement, theme: ThemeMode, lookup: ElementLookup): void {
  const w = el.width;
  const h = el.height;
  ctx.save();
  ctx.translate(el.x + w / 2, el.y + h / 2);
  if (el.rotation) ctx.rotate((el.rotation * Math.PI) / 180);
  ctx.translate(-w / 2, -h / 2);
  ctx.globalAlpha = el.opacity ?? 1;

  switch (el.type) {
    case 'sticky': {
      ctx.save();
      ctx.shadowColor = 'rgba(20, 30, 24, 0.18)';
      ctx.shadowBlur = Math.max(4, w * 0.04);
      ctx.shadowOffsetY = Math.max(2, w * 0.015);
      if ((el.fillOpacity ?? 1) < 0.6) ctx.shadowColor = 'transparent';
      ctx.fillStyle = withAlpha(el.color, el.fillOpacity ?? 1);
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      const pad = stickyPadding(w, h);
      const style = resolveTextStyle(el, el.textColor ?? stickyTextColor(el.color));
      if (renderPrivacy && isPrivateDraftHidden(el, renderPrivacy.viewerId, renderPrivacy.simulateParticipant)) {
        ctx.fillStyle = style.color;
        ctx.globalAlpha = (el.opacity ?? 1) * 0.7;
        ctx.font = `700 ${Math.min(w, h) * 0.14}px Figtree, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('••••', w / 2, h / 2);
        ctx.textAlign = 'left';
        break;
      }
      const footer = stickyFooterLayout(el).height;
      const textH = Math.max(1, h - pad * 2 - footer);
      const formatted = formatListLines(el.text, style.listStyle, style.indent).join('\n');
      const size = el.fontSize === 'auto' || el.fontSize === undefined ? fitFontSize(formatted, w - pad * 2, textH, style) : el.fontSize;
      drawTextBlock(ctx, el.text, { x: pad, y: pad, width: w - pad * 2, height: textH }, size, style, 'middle');
      drawStickyFooter(ctx, el, pad, isDarkSticky(el.color));
      break;
    }
    case 'shape': {
      const path = pathFromSvg(shapeElementPath(el));
      if (!isTransparent(el.fillColor)) {
        ctx.fillStyle = withAlpha(el.fillColor, el.fillOpacity ?? 1);
        ctx.fill(path);
      }
      if (el.strokeWidth > 0 && !isTransparent(el.strokeColor)) {
        ctx.lineWidth = el.strokeWidth;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = isTransparent(el.fillColor) ? adaptInk(el.strokeColor, theme) : el.strokeColor;
        ctx.setLineDash(el.strokeStyle === 'dashed' ? [el.strokeWidth * 4, el.strokeWidth * 3] : el.strokeStyle === 'dotted' ? [el.strokeWidth, el.strokeWidth * 2] : []);
        ctx.stroke(path);
        const deco = shapeElementDecoration(el);
        if (deco) ctx.stroke(pathFromSvg(deco));
        ctx.setLineDash([]);
      }
      const ins = shapeElementTextInsets(el);
      const color = isTransparent(el.fillColor) ? adaptInk(el.textColor, theme) : el.textColor;
      drawTextBlock(ctx, el.text, { x: ins.left, y: ins.top, width: w - ins.left - ins.right, height: h - ins.top - ins.bottom }, el.fontSize, resolveTextStyle(el, color), 'middle');
      break;
    }
    case 'text': {
      if (!isTransparent(el.backgroundColor)) {
        ctx.fillStyle = withAlpha(el.backgroundColor, el.fillOpacity ?? 1);
        ctx.fillRect(0, 0, w, h);
      }
      const color = isTransparent(el.backgroundColor) && !el.highlightColor ? adaptInk(el.textColor, theme) : el.textColor;
      drawTextBlock(ctx, el.text, { x: 0, y: 0, width: w, height: h }, el.fontSize, resolveTextStyle(el, color), 'top');
      break;
    }
    case 'freehand': {
      if (el.points.length > 0) {
        ctx.beginPath();
        ctx.moveTo(el.points[0].x, el.points[0].y);
        for (let i = 1; i < el.points.length - 1; i++) {
          const p = el.points[i];
          const n = el.points[i + 1];
          ctx.quadraticCurveTo(p.x, p.y, (p.x + n.x) / 2, (p.y + n.y) / 2);
        }
        const last = el.points[el.points.length - 1];
        ctx.lineTo(last.x, last.y);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = el.strokeWidth;
        ctx.strokeStyle = el.isHighlighter ? el.strokeColor : adaptInk(el.strokeColor, theme);
        if (el.isHighlighter) ctx.globalAlpha = (el.opacity ?? 1) * 0.45;
        ctx.stroke();
      }
      break;
    }
    case 'connector': {
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = el.opacity ?? 1;
      const route = computeRoute(el, lookup);
      const stroke = adaptInk(el.strokeColor, theme);
      ctx.strokeStyle = stroke;
      ctx.fillStyle = stroke;
      ctx.lineWidth = el.strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const dash = strokeDasharray(el.strokeStyle, el.strokeWidth);
      ctx.setLineDash(dash ? dash.split(' ').map(Number) : []);
      const jumps = el.routingType === 'orthogonal' ? renderJumps.get(el.id) : undefined;
      ctx.stroke(pathFromSvg(jumps ? buildOrthogonalPath(route.points, jumps, el.strokeWidth) : route.d));
      ctx.setLineDash([]);
      const size = arrowSize(el.strokeWidth);
      for (const head of [arrowheadPath(el.startArrow, route.start, route.startAngle, size), arrowheadPath(el.endArrow, route.end, route.endAngle, size)]) {
        if (!head) continue;
        const p = pathFromSvg(head.d);
        if (head.filled) ctx.fill(p);
        ctx.stroke(p);
      }
      if (el.label && el.label.trim()) drawConnectorLabel(ctx, el.label, connectorLabelPoint(el, route), stroke, theme, el.labelStyle);
      break;
    }
    case 'mindmap': {
      drawMindMapToCanvas(ctx, el, theme);
      break;
    }
    case 'kanban': {
      // Chat 04: mesma geometria do KanbanView (utils/kanban.ts)
      drawKanbanToCanvas(ctx, el);
      break;
    }
    case 'table': {
      // Chat 04: mesma geometria do TableView (utils/table.ts)
      drawTableToCanvas(ctx, el);
      break;
    }
    case 'comment':
      // Chat 04: pins de comentário são anotações de trabalho — não saem no PNG/PDF nem nas miniaturas
      break;
    case 'frame': {
      // corpo
      ctx.save();
      ctx.shadowColor = 'rgba(20, 36, 26, 0.08)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = el.fillColor;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      const darkFill = isDarkSticky(el.fillColor);
      ctx.strokeStyle = darkFill ? 'rgba(255,255,255,0.18)' : 'rgba(20,36,26,0.16)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
      // título acima do frame (fica fora do recorte quando se exporta só o frame)
      const fs = frameTitleFontSize(el);
      ctx.font = `600 ${fs}px Figtree, system-ui, sans-serif`;
      ctx.fillStyle = theme === 'dark' ? '#AAB2AB' : '#4F5A53';
      ctx.textBaseline = 'bottom';
      ctx.fillText(ellipsize(el.title || t('importexport.export.untitledFrame'), w, ctx.font), 0, -fs * 0.35);
      // conteúdo oculto: capa
      if (el.hiddenContent) {
        const m = Math.min(w, h);
        ctx.fillStyle = darkFill ? '#F4F5F2' : '#4F5A53';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `600 ${Math.max(10, m * 0.05)}px Figtree, system-ui, sans-serif`;
        ctx.fillText(t('importexport.export.hiddenContent'), w / 2, h / 2 + m * 0.06);
        ctx.lineWidth = Math.max(1.5, m * 0.008);
        ctx.strokeStyle = ctx.fillStyle;
        const r = m * 0.05;
        ctx.beginPath();
        ctx.ellipse(w / 2, h / 2 - m * 0.04, r * 1.3, r * 0.75, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(w / 2 - r * 1.4, h / 2 - m * 0.04 - r * 1.1);
        ctx.lineTo(w / 2 + r * 1.4, h / 2 - m * 0.04 + r * 1.1);
        ctx.stroke();
        ctx.textAlign = 'left';
      }
      break;
    }
    case 'image': {
      const img = renderImages.get(el.dataUrl);
      if (img) {
        ctx.drawImage(img, 0, 0, w, h);
      } else {
        // Imagem que o navegador não conseguiu decodificar: marcador neutro no lugar
        ctx.fillStyle = theme === 'dark' ? '#2A2A31' : '#E9ECE6';
        ctx.fillRect(0, 0, w, h);
      }
      break;
    }
    case 'composite': {
      // Chat 06.5: mesma geometria da tela (layoutComposite); elemento inválido não é exportado
      if (!isValidComposite(el)) break;
      for (const p of layoutComposite(el)) {
        if (p.kind === 'text') {
          if (p.badge) {
            roundRectPath(ctx, p.x, p.y, p.w, p.h, p.h / 2);
            ctx.fillStyle = p.badge;
            ctx.fill();
          }
          ctx.save();
          ctx.beginPath();
          ctx.rect(p.x, p.y, p.w, p.h);
          ctx.clip();
          drawTextBlock(ctx, p.text, { x: p.x, y: p.y, width: p.w, height: p.h }, p.fontSize, p.style, p.valign);
          ctx.restore();
          continue;
        }
        ctx.save();
        ctx.setLineDash(p.kind !== 'path' && p.dashed ? [p.strokeWidth * 4, p.strokeWidth * 3] : []);
        let shape: Path2D | null = null;
        if (p.kind === 'rect') roundRectPath(ctx, p.x, p.y, p.w, p.h, p.radius);
        else if (p.kind === 'ellipse') {
          ctx.beginPath();
          ctx.ellipse(p.x + p.w / 2, p.y + p.h / 2, p.w / 2, p.h / 2, 0, 0, Math.PI * 2);
        } else {
          ctx.translate(p.x, p.y);
          shape = pathFromSvg(p.d);
        }
        if (p.fill !== 'none') {
          ctx.fillStyle = p.fill;
          if (shape) ctx.fill(shape);
          else ctx.fill();
        }
        if (p.stroke !== 'none' && p.strokeWidth > 0) {
          ctx.strokeStyle = p.stroke;
          ctx.lineWidth = p.strokeWidth;
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          if (shape) ctx.stroke(shape);
          else ctx.stroke();
        }
        ctx.restore();
      }
      break;
    }
    default: {
      ctx.strokeStyle = theme === 'dark' ? '#45454F' : '#B9BFC8';
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, w, h);
      ctx.setLineDash([]);
    }
  }
  ctx.restore();
}

/** Área exportada (conteúdo + margem) e escala final, respeitando o limite de pixels por lado. */
function exportArea(elements: CanvasElement[], options: RenderOptions): { bounds: Rect; scale: number } {
  const content = options.bounds ?? getBoundsOfElements(elements) ?? { x: 0, y: 0, width: 800, height: 600 };
  const bounds = expandRect(content, options.padding);
  const maxSide = options.maxSide ?? 12000;
  let scale = options.scale;
  const largest = Math.max(bounds.width, bounds.height) * scale;
  if (largest > maxSide) scale = (maxSide / Math.max(bounds.width, bounds.height)) * 0.999;
  return { bounds, scale };
}

/**
 * Chat 05.5: carrega explicitamente as fontes que a cena vai desenhar (família de cada texto, fontes
 * de células/cartões e as da interface usadas no canvas) antes de qualquer `fillText` — PNG, PDF e SVG.
 * As fontes são autohospedadas (src/styles/fonts.css), então isto também funciona offline.
 */
async function waitFonts(elements: CanvasElement[]): Promise<void> {
  await ensureFontsForElements(elements);
}

/**
 * Desenha a cena num contexto 2D já posicionado (escala/translação aplicadas). Usado pelo PNG/PDF
 * (canvas real) e pelo SVG (contexto gravador `SvgRecorderContext`) — a MESMA geometria nos dois.
 */
async function drawScene(ctx: CanvasRenderingContext2D, elements: CanvasElement[], options: RenderOptions): Promise<void> {
  const byId = new Map(elements.map((e) => [e.id, e]));
  const lookup: ElementLookup = (id) => byId.get(id);
  renderImages = await preloadImages(elements.flatMap((el) => (el.type === 'image' ? [el.dataUrl] : [])));
  renderPrivacy = options.privacy;
  renderJumps = computeLineJumps(
    elements.filter((e): e is Extract<CanvasElement, { type: 'connector' }> => e.type === 'connector' && e.routingType === 'orthogonal'),
    lookup,
  );
  try {
    // conteúdo de frames ocultos não sai no export nem nas miniaturas (mesma regra da tela)
    for (const el of elements) if (!isHiddenByFrame(el, lookup)) drawElement(ctx, el, options.theme, lookup);
  } finally {
    renderImages = new Map();
    renderPrivacy = undefined;
    renderJumps = new Map();
  }
}

/** Comentários (pins) nunca entram no export (nem no cálculo da área) — Chat 04. */
function exportable(allElements: CanvasElement[]): CanvasElement[] {
  return allElements.filter((el) => el.type !== 'comment');
}

/**
 * Chat 08.2 (linha do tempo): desenha os elementos NUM canvas existente, alinhados à câmera dada (mesma geometria da
 * tela). Não lê nem altera o `useBoardStore` — quem chama passa a câmera, o tamanho e os dados (de uma versão).
 */
export async function renderElementsInView(
  canvas: HTMLCanvasElement,
  allElements: CanvasElement[],
  view: { camera: { x: number; y: number; zoom: number }; width: number; height: number; pixelRatio?: number },
  options: Pick<RenderOptions, 'background' | 'theme' | 'privacy'>,
): Promise<void> {
  const elements = exportable(allElements);
  await waitFonts(elements);
  const dpr = view.pixelRatio ?? 1;
  canvas.width = Math.max(1, Math.round(view.width * dpr));
  canvas.height = Math.max(1, Math.round(view.height * dpr));
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const bg = options.background ?? CANVAS_COLORS[options.theme].background;
  if (!isTransparent(bg)) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.setTransform(view.camera.zoom * dpr, 0, 0, view.camera.zoom * dpr, view.camera.x * dpr, view.camera.y * dpr);
  await drawScene(ctx, elements, { scale: view.camera.zoom, padding: 0, background: options.background, theme: options.theme, privacy: options.privacy });
}

/** Renderiza os elementos em um canvas offscreen. */
export async function renderElementsToCanvas(allElements: CanvasElement[], options: RenderOptions): Promise<HTMLCanvasElement> {
  const elements = exportable(allElements);
  await waitFonts(elements);
  const { bounds, scale } = exportArea(elements, options);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(bounds.width * scale));
  canvas.height = Math.max(1, Math.ceil(bounds.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(t('importexport.export.n2dCanvasUnavailable'));

  const bg = options.background ?? CANVAS_COLORS[options.theme].background;
  if (!isTransparent(bg)) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.scale(scale, scale);
  ctx.translate(-bounds.x, -bounds.y);
  await drawScene(ctx, elements, options);
  return canvas;
}

/**
 * Chat 05 — SVG vetorial: o mesmo desenho do PNG/PDF gravado como SVG (formas, linhas e textos
 * viram `<path>`/`<text>`; imagens vão embutidas). 1 unidade do board = 1 px do SVG.
 */
export async function renderElementsToSvg(allElements: CanvasElement[], options: RenderOptions, title?: string): Promise<string> {
  const elements = exportable(allElements);
  await waitFonts(elements);
  const { bounds } = exportArea(elements, { ...options, scale: 1, maxSide: Infinity });
  const rec = new SvgRecorderContext(bounds.width, bounds.height);
  const bg = options.background ?? CANVAS_COLORS[options.theme].background;
  if (!isTransparent(bg)) rec.background(bg);
  const ctx = rec.asContext();
  ctx.translate(-bounds.x, -bounds.y);
  await drawScene(ctx, elements, options);
  return rec.toSvg(title);
}

export async function exportElementsAsSVG(name: string, elements: CanvasElement[], options: RenderOptions): Promise<void> {
  const svg = await renderElementsToSvg(elements, options, name);
  downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${slugifyFileName(name)}.svg`);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(t('importexport.export.couldntGenerateImage')))), type, quality);
  });
}

export async function exportElementsAsPNG(name: string, elements: CanvasElement[], options: RenderOptions): Promise<void> {
  const canvas = await renderElementsToCanvas(elements, options);
  const blob = await canvasToBlob(canvas);
  downloadBlob(blob, `${slugifyFileName(name)}${options.scale > 1 ? `@${options.scale}x` : ''}.png`);
}

export interface PdfPage {
  elements: CanvasElement[];
  options: RenderOptions;
  /** Tamanho da página em pt. Ausente = tamanho do conteúdo (máx. ~A0) */
  page?: { width: number; height: number };
  /** Título da página (aparece no marcador/sumário do leitor de PDF) */
  title?: string;
}

/**
 * PDF de várias páginas (Chat 05): cada página é renderizada em alta resolução (≥ 2×, por padrão 3×)
 * e centralizada sem distorcer. Usado pelo PDF de página única e pelo PDF por frames.
 */
export async function exportPagesAsPDF(name: string, pages: PdfPage[], onProgress?: (done: number, total: number) => void): Promise<void> {
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  pdf.setTitle(name);
  pdf.setCreator('LuDraw');
  pdf.setProducer('LuDraw (pdf-lib)');
  let done = 0;
  for (const p of pages) {
    const canvas = await renderElementsToCanvas(p.elements, { ...p.options, scale: Math.max(2, p.options.scale) });
    const pngBlob = await canvasToBlob(canvas);
    const bytes = new Uint8Array(await pngBlob.arrayBuffer());
    const image = await pdf.embedPng(bytes);
    // Página no tamanho do conteúdo (máx. A0 ~ 3370pt no lado maior), mantendo a proporção
    const maxPt = 3370;
    const ratio = image.width / image.height;
    const pageW = p.page?.width ?? (ratio >= 1 ? Math.min(maxPt, image.width / 2) : Math.min(maxPt, image.height / 2) * ratio);
    const pageH = p.page?.height ?? pageW / ratio;
    const pdfPage = pdf.addPage([pageW, pageH]);
    const fit = Math.min(pageW / image.width, pageH / image.height);
    const w = image.width * fit;
    const h = image.height * fit;
    pdfPage.drawImage(image, { x: (pageW - w) / 2, y: (pageH - h) / 2, width: w, height: h });
    onProgress?.(++done, pages.length);
  }
  const out = await pdf.save();
  const buffer = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  downloadBlob(new Blob([buffer], { type: 'application/pdf' }), `${slugifyFileName(name)}.pdf`);
}

/** PDF de uma página: no tamanho do conteúdo ou em `page` (pt), com a imagem centralizada sem distorcer. */
export async function exportElementsAsPDF(name: string, elements: CanvasElement[], options: RenderOptions, page?: { width: number; height: number }): Promise<void> {
  await exportPagesAsPDF(name, [{ elements, options, page }]);
}

/** Copia a seleção como PNG para a área de transferência. */
export async function copyElementsAsImage(elements: CanvasElement[], options: RenderOptions): Promise<boolean> {
  const canvas = await renderElementsToCanvas(elements, options);
  const blob = await canvasToBlob(canvas);
  try {
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
}

export async function generateThumbnail(
  elements: CanvasElement[],
  theme: ThemeMode,
  background: string | null,
  privacy?: RenderOptions['privacy'],
): Promise<string | undefined> {
  if (elements.length === 0) return undefined;
  const bounds = getBoundsOfElements(elements);
  if (!bounds) return undefined;
  const target = 360;
  const scale = Math.min(2, target / Math.max(bounds.width + 80, bounds.height + 80));
  const canvas = await renderElementsToCanvas(elements, { scale, padding: 40, background, theme, maxSide: 720, privacy });
  return canvas.toDataURL('image/jpeg', 0.72);
}

export function createBackupFile(name: string, createdAt: number, ownerName: string, data: BoardData): BoardBackupFile {
  return { format: 'ludraw-board', version: 1, exportedAt: Date.now(), board: { name, createdAt, ownerName }, data };
}

export function downloadBackup(name: string, backup: BoardBackupFile): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `${slugifyFileName(name)}-${stamp}.ludraw`);
}

/** Lê e valida um arquivo de backup `.ludraw`. */
export async function readBackupFile(file: File): Promise<BoardBackupFile> {
  const text = await file.text();
  const parsed = JSON.parse(text) as Partial<BoardBackupFile>;
  if (parsed.format !== 'ludraw-board' || !parsed.data || !parsed.data.elements || !Array.isArray(parsed.data.elementOrder)) {
    throw new Error(t('importexport.export.invalidFileNotLudrawBackup'));
  }
  return parsed as BoardBackupFile;
}

/** Abre o seletor de arquivos do sistema e devolve o arquivo escolhido. */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

/** CSV de objetos (Chat 02): `;` + BOM para planilhas em pt-BR; Chat 05: proteção contra fórmulas. */
export function exportElementsToCSV(name: string, elements: CanvasElement[]): void {
  const header = ['id', 'tipo', 'texto', 'x', 'y', 'largura', 'altura', 'rotacao', 'cor', 'tags'];
  const rows = elements.map((el) => {
    const color =
      el.type === 'sticky' ? el.color : el.type === 'shape' ? el.fillColor : el.type === 'text' ? (el as TextualElement & { textColor: string }).textColor : '';
    const tags = el.type === 'sticky' ? (el.tags ?? []).map((t) => t.label).join(', ') : '';
    return [el.id, el.type, getElementText(el), Math.round(el.x), Math.round(el.y), Math.round(el.width), Math.round(el.height), Math.round(el.rotation), color, tags];
  });
  const csv = toCsv([header, ...rows], { delimiter: ';', bom: true });
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${slugifyFileName(name)}.csv`);
}
