/**
 * LuDraw — Modelos de extensão → TemplateRegistry (Chat 06.5 · Rodada A).
 *
 * As entradas declarativas (já validadas por `schema.ts`) viram elementos NATIVOS pela fábrica do
 * núcleo (`createStickyNote`, `createShape`, `createText`, `createFrame`, `createConnector`,
 * `createComposite`). Textos `"{{chave}}"` são resolvidos no idioma ativo na hora de criar e depois
 * são conteúdo do usuário. `lock` vira `lockMode` (+ `isBackgroundFramework` com `background`).
 * Inserir no board passa por `insertTemplateElements` (ensure('board.edit'); protegido → padrão sem
 * permissão de facilitador; um `addElements` = um passo de desfazer + `recordActivity`).
 */
import { getLocale } from '../../i18n';
import type { AnchorSide, CanvasElement, ConnectorElement, ConnectorEndpoint, ShapeKind } from '../../types/canvas';
import { computeRoute, createConnector, getAnchorPoint, routeBounds } from '../../utils/connectors';
import { createId } from '../../utils/id';
import { createComposite, createFrame, createShape, createStickyNote, createText } from '../../utils/factory';
import { TemplateRegistry } from '../registries';
import { localizedDescription, localizedName, resolveString } from '../schema';
import type { ExtensionManifest, TemplateContribution, TemplateElementInput } from '../types';
import { contributionId, resolveParts } from './declarative';

function lockFields(input: TemplateElementInput): Partial<CanvasElement> {
  const lock = input.lock ?? 'none';
  const out: Partial<CanvasElement> = {};
  if (lock !== 'none') Object.assign(out, { locked: true, lockMode: lock, lockedBy: null });
  if (input.background) Object.assign(out, { isBackgroundFramework: true });
  if (input.rotation) Object.assign(out, { rotation: input.rotation });
  return out;
}

/** Elementos do modelo, com textos no idioma `locale`. */
export function buildTemplateElements(m: ExtensionManifest, tpl: TemplateContribution, locale: string): CanvasElement[] {
  return buildElementsFromInputs(tpl.elements, {
    manifest: m,
    locale,
    text: (v) => resolveString(v, tpl.strings, locale),
    frameFallbackTitle: localizedName(tpl, locale),
  });
}

/**
 * Chat 06.5 · B: elementos pedidos por uma extensão programável (API `ludraw.board.addElements`,
 * importadores). Entradas JÁ validadas por `validateElementInputs`; textos livres (sem tabela de
 * `strings`); conectores podem apontar para elementos existentes do board (`existing`).
 */
export function buildApiElements(inputs: TemplateElementInput[], existing: (id: string) => CanvasElement | undefined): CanvasElement[] {
  return buildElementsFromInputs(inputs, { manifest: null, locale: 'pt-BR', text: (v) => v ?? '', frameFallbackTitle: '', existing });
}

interface BuildContext {
  manifest: ExtensionManifest | null;
  locale: string;
  text: (v: string | undefined) => string;
  frameFallbackTitle: string;
  existing?: (id: string) => CanvasElement | undefined;
}

function buildElementsFromInputs(inputs: TemplateElementInput[], ctx: BuildContext): CanvasElement[] {
  const { locale, text } = ctx;
  const m = ctx.manifest;
  const byRef = new Map<string, CanvasElement>();
  const out: CanvasElement[] = [];
  const shapes = new Map((m?.contributes?.shapes ?? []).map((s) => [s.id, s]));
  const types = new Map((m?.contributes?.elementTypes ?? []).map((et) => [et.id, et]));
  const lookup = (id: string) => out.find((e) => e.id === id) ?? ctx.existing?.(id);
  // chave local de grupo → groupId novo (só grupos com 2+ elementos fazem sentido)
  const groupCount = new Map<string, number>();
  for (const input of inputs) if (input.group) groupCount.set(input.group, (groupCount.get(input.group) ?? 0) + 1);
  const groupIds = new Map<string, string>();
  const groupOf = (key: string | undefined): string | null => {
    if (!key || (groupCount.get(key) ?? 0) < 2) return null;
    if (!groupIds.has(key)) groupIds.set(key, createId());
    return groupIds.get(key)!;
  };

  for (const input of inputs) {
    const rect = { x: input.x, y: input.y, width: input.width, height: input.height };
    let el: CanvasElement | null = null;
    switch (input.type) {
      case 'sticky':
        el = createStickyNote({ ...rect, text: text(input.text), ...(input.color ? { color: input.color.toUpperCase() } : {}), ...(input.fontSize ? { fontSize: input.fontSize } : {}) });
        break;
      case 'shape': {
        const ext = input.shapeRef && m ? shapes.get(input.shapeRef) : undefined;
        el = createShape((input.shape as ShapeKind | undefined) ?? 'rectangle', {
          ...rect,
          text: text(input.text),
          ...(input.fillColor ? { fillColor: input.fillColor === 'none' ? 'transparent' : input.fillColor } : {}),
          ...(input.strokeColor ? { strokeColor: input.strokeColor === 'none' ? 'transparent' : input.strokeColor } : {}),
          ...(input.textColor ? { textColor: input.textColor } : {}),
          ...(input.strokeWidth !== undefined ? { strokeWidth: input.strokeWidth } : {}),
          ...(input.fontSize ? { fontSize: input.fontSize } : {}),
          ...(ext
            ? {
                customPath: ext.path,
                customPathBox: { ...ext.viewBox },
                ...(ext.decoration ? { customDecoration: ext.decoration } : {}),
                ...(ext.textInsets ? { customTextInsets: { ...ext.textInsets } } : {}),
                shapeRef: { extensionId: m!.id, shapeId: contributionId(m!.id, ext.id), name: localizedName(ext, locale) },
              }
            : {}),
        });
        break;
      }
      case 'text':
        el = createText({
          ...rect,
          text: text(input.text),
          ...(input.fontSize ? { fontSize: input.fontSize } : {}),
          ...(input.color ? { textColor: input.color } : {}),
          // com fundo, o texto mantém a cor gravada no tema escuro (adaptInk só age em fundo transparente)
          ...(input.fill ? { backgroundColor: input.fill } : {}),
          textAlign: input.align ?? 'left',
          fontWeight: input.bold ? 'bold' : 'normal',
        });
        break;
      case 'frame':
        el = createFrame(rect, { title: text(input.title) || ctx.frameFallbackTitle || undefined, fillColor: input.fillColor && input.fillColor !== 'none' ? input.fillColor : input.fillColor === 'none' ? 'transparent' : undefined });
        break;
      case 'composite': {
        const def = types.get(input.typeId);
        if (!def || !m) break;
        const parts = resolveParts(def.parts, def.strings, locale);
        const fields: Record<string, string> = {};
        let main = '';
        for (const p of parts) if ((p.kind === 'text' || p.kind === 'badge') && p.slot) (p.slot === 'main' ? (main = p.text ?? '') : (fields[p.slot] = p.text ?? ''));
        for (const [k, v] of Object.entries(input.fields ?? {})) fields[k] = text(v);
        el = createComposite({ typeRef: { extensionId: m.id, typeId: def.id }, typeName: localizedName(def, locale), parts, text: input.text !== undefined ? text(input.text) : main, fields }, rect);
        break;
      }
      case 'connector': {
        const end = (e: typeof input.from): ConnectorEndpoint => {
          if ('ref' in e || 'elementId' in e) {
            const target = 'ref' in e ? byRef.get(e.ref) : ctx.existing?.(e.elementId);
            const anchor: AnchorSide = e.anchor ?? 'center';
            const at = target ? getAnchorPoint(target, anchor) : { x: 0, y: 0 };
            return { elementId: target?.id ?? null, anchor, x: at.x, y: at.y };
          }
          return { elementId: null, anchor: 'center', x: e.x, y: e.y };
        };
        el = createConnector(end(input.from), end(input.to), { routingType: input.route ?? 'orthogonal', endArrow: input.arrow === false ? 'none' : 'arrow' }, lookup);
        if (input.label) el = { ...el, label: text(input.label) } as CanvasElement;
        if (input.points?.length) {
          const routed = { ...(el as ConnectorElement), waypoints: input.points.map((pt) => ({ x: pt.x, y: pt.y })) };
          el = { ...routed, ...routeBounds(computeRoute(routed, lookup), routed.strokeWidth) };
        }
        break;
      }
    }
    if (!el) continue;
    el = { ...el, ...lockFields(input) } as CanvasElement;
    const groupId = groupOf(input.group);
    if (groupId) el = { ...el, groupId } as CanvasElement;
    if (input.ref) byRef.set(input.ref, el);
    out.push(el);
  }
  return out;
}

export function registerTemplates(m: ExtensionManifest): void {
  m.contributes?.templates?.forEach((tpl, i) => {
    TemplateRegistry.register({
      id: contributionId(m.id, tpl.id),
      source: 'extension',
      extensionId: m.id,
      order: 1000 + i,
      get label() {
        return localizedName(tpl, getLocale());
      },
      get description() {
        return localizedDescription(tpl, getLocale()) ?? '';
      },
      category: tpl.category,
      build: () => buildTemplateElements(m, tpl, getLocale()),
    });
  });
}
