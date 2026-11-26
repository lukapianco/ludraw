/**
 * LuDraw server — veto do tempo real (Chat 08 · A-2).
 *
 * O Hocuspocus chama `beforeSync` ANTES de aplicar uma atualização ao documento e de transmiti-la (verificado no
 * código instalado da 4.7.1 e em experimento). Aqui a atualização é aplicada numa CÓPIA-SOMBRA do documento:
 *   sombra (depois)  ×  documento real (antes, ainda intocado)  →  elementos/ordem/meta/facilitação que mudaram
 *   → limites do estado RESULTANTE → `guardBoardWrite` (as MESMAS regras do PUT do Chat 07, sobre o pedaço que
 *   mudou) em modo ESTRITO → objeto em uso por outra pessoa.
 * Estrito = o que o guard corrigiria em silêncio no PUT (autoria/`lockedBy` forjados, nota privada alheia, campos
 * imutáveis) aqui é RECUSADO: corrigir depois de transmitir faria a escrita proibida chegar aos outros.
 * Recusou → a sombra é refeita a partir do documento real (a escrita nunca existiu).
 */
import * as Y from 'yjs';
import { deepEqual, observeBoard, readElement, readFac, readMeta, rootsOf, sliceToBoardData, type BoardChange, PROTO_KEYS } from '../../../src/collab/codec';
import type { MessageDescriptor } from '../../../src/i18n/types';
import type { BoardData, CanvasElement, StickyNoteElement } from '../../../src/types/canvas';
import { BOARD_LIMITS, checkBoardData } from '../../../src/utils/boardLimits';
import { guardBoardWrite } from '../boards/writeGuard';
import { assetHashOf, imageSourceOf, isRasterDataUrl } from '../../../src/utils/assetRefs';

const SHADOW = 'od:shadow';
/** Mudanças só de geometria (seguir o objeto ligado/o frame) não contam como "mexer no objeto em uso". */
const GEOMETRY = new Set(['x', 'y', 'width', 'height', 'rotation', 'parentId', 'updatedAt', 'start', 'end', 'points', 'waypoints']);

export interface VetoActor {
  userId: string;
  name: string;
  role: import('../../../src/types/workspace').WorkspaceRole;
  context: Parameters<typeof guardBoardWrite>[0]['context'];
}

export interface VetoOk {
  ok: true;
  /** notas privadas reveladas por esta escrita (Audit Log) */
  revealed: number;
  /** a votação foi revelada por esta escrita (Audit Log) */
  votingRevealed: { title: string } | null;
}

/** Recusa: o motivo e os objetos que a atualização tocava (o reenvio offline do Chat 08.2 devolve os ids ao cliente). */
export type VetoResult = VetoOk | { ok: false; reason: MessageDescriptor; ids?: string[] };

/** Carimbos que o app atualiza sozinho a cada mudança — não são "conteúdo" e não decidem nada. */
const STAMPS = new Set(['zIndex', 'updatedAt']);

/** Sem `null`/`undefined` e sem carimbos: a mesma forma para comparar o que chegou com o que o guard aceita. */
function clean(el: CanvasElement | undefined): Record<string, unknown> | null {
  if (!el) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(el)) if (v !== null && v !== undefined && !STAMPS.has(k)) out[k] = v;
  return out;
}

function changedKeys(a: CanvasElement, b: CanvasElement): string[] {
  const ra = a as unknown as Record<string, unknown>;
  const rb = b as unknown as Record<string, unknown>;
  return [...new Set([...Object.keys(ra), ...Object.keys(rb)])].filter((k) => !STAMPS.has(k) && !deepEqual(ra[k] ?? null, rb[k] ?? null));
}

const invalid = (): MessageDescriptor => ({ key: 'server.errors.collabInvalidChange' });

/** Quantas escritas a chave já recebeu (o item atual e os anteriores/concorrentes à esquerda, inclusive apagados). */
function writesOf(map: Y.Map<unknown>, key: string): number {
  // `_map` é a tabela interna do Y.Map (chave → item mais recente); `left` encadeia as escritas anteriores da chave
  let item = (map as unknown as { _map: Map<string, { left: unknown } | undefined> })._map.get(key) as { left: unknown } | null | undefined;
  let n = 0;
  while (item) {
    n++;
    item = item.left as { left: unknown } | null;
  }
  return n;
}

export class Veto {
  private shadow: Y.Doc;

  constructor(private readonly doc: Y.Doc) {
    this.shadow = this.clone();
    // tudo o que o documento real aceita (clientes aprovados, gravações do servidor) também vai para a sombra
    doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin !== SHADOW) Y.applyUpdate(this.shadow, update, SHADOW);
    });
  }

  private clone(): Y.Doc {
    const d = new Y.Doc();
    Y.applyUpdate(d, Y.encodeStateAsUpdate(this.doc), SHADOW);
    return d;
  }

  /** A sombra recebeu algo que foi recusado: volta a ser igual ao documento real. */
  private rebuild(): void {
    this.shadow.destroy();
    this.shadow = this.clone();
  }

  /**
   * Decide se a atualização pode entrar. `inUseBy(id)` devolve o nome de quem está usando o objeto agora (outra
   * pessoa: selecionado ou editando), ou null.
   */
  check(update: Uint8Array, actor: VetoActor, inUseBy: (id: string) => string | null, now = Date.now(), assetLinked: (hash: string) => boolean = () => false): VetoResult {
    const acc: BoardChange = { ids: new Set(), order: false, meta: false, fac: false, origin: null, local: false };
    const off = observeBoard(this.shadow, (c) => {
      c.ids.forEach((id) => acc.ids.add(id));
      acc.order ||= c.order;
      acc.meta ||= c.meta;
      acc.fac ||= c.fac;
    });
    try {
      Y.applyUpdate(this.shadow, update, 'od:candidate');
    } catch {
      off();
      this.rebuild();
      return { ok: false, reason: invalid() };
    }
    off();
    // Chat 08.7 · R2 (S-27): a época é do servidor (como `fac.tally`); documento de outra "vida" não se junta a este
    // Chat 08.7 · R4 (S-32): id de objeto com nome de protótipo não existe no LuDraw
    if ([...acc.ids].some((id) => PROTO_KEYS.has(id))) {
      this.rebuild();
      return { ok: false, reason: invalid(), ids: [...acc.ids] };
    }
    if (this.epochTouched()) {
      this.rebuild();
      return { ok: false, reason: invalid(), ids: [...acc.ids] };
    }
    if (!acc.ids.size && !acc.order && !acc.meta && !acc.fac) return { ok: true, revealed: 0, votingRevealed: null };
    const verdict = this.judge(acc, actor, inUseBy, now, assetLinked);
    if (!verdict.ok) {
      this.rebuild();
      return { ...verdict, ids: [...acc.ids] };
    }
    return verdict;
  }

  /**
   * A atualização escreveu na chave `meta.epoch`? Caminho principal: a época da sombra mudou. Se a cópia antiga
   * PERDEU a disputa da chave (o valor fica igual), a chave ganha um item a mais na cadeia de escritas — conferido
   * sem decodificar a atualização. Só o servidor escreve a época, uma vez por "vida" do documento.
   */
  private epochTouched(): boolean {
    const before = this.doc.getMap('meta');
    const after = this.shadow.getMap('meta');
    if (before.get('epoch') !== after.get('epoch')) return true;
    return writesOf(after, 'epoch') > writesOf(before, 'epoch');
  }

  private judge(acc: BoardChange, actor: VetoActor, inUseBy: (id: string) => string | null, now: number, assetLinked: (hash: string) => boolean): VetoResult {
    const before = rootsOf(this.doc);
    const after = rootsOf(this.shadow);

    // só o servidor escreve os totais da votação
    if (acc.fac && !deepEqual(before.fac.get('tally') ?? null, after.fac.get('tally') ?? null)) return { ok: false, reason: invalid() };

    // limites do ESTADO RESULTANTE: quantidade de objetos e, nos objetos que mudaram, texto/imagem/pontos
    if (after.els.size > BOARD_LIMITS.elements) return { ok: false, reason: { key: 'server.errors.tooManyElements', params: { max: BOARD_LIMITS.elements } } };

    const ids = [...acc.ids];
    const oldEls: Record<string, CanvasElement> = {};
    const newEls: Record<string, CanvasElement> = {};
    let created = false;
    for (const id of ids) {
      const o = before.els.get(id);
      const n = after.els.get(id);
      if (o) oldEls[id] = readElement(o);
      if (n) newEls[id] = readElement(n);
      if (n && !o) created = true;
    }
    const metaOld = readMeta(before.meta);
    const metaNew = readMeta(after.meta);
    const facOld = readFac(before.fac);
    const facNew = readFac(after.fac);
    const order = (els: Record<string, CanvasElement>) => ids.filter((id) => !!els[id]);
    const old = sliceToBoardData({ elements: oldEls, elementOrder: order(oldEls), meta: metaOld, fac: facOld }, { activityLog: [] });
    const incoming = sliceToBoardData({ elements: newEls, elementOrder: order(newEls), meta: metaNew, fac: facNew }, { activityLog: [] });

    const limit = checkBoardData(incoming);
    if (limit) return { ok: false, reason: limit };
    if (created && Y.encodeStateAsUpdate(this.shadow).byteLength > BOARD_LIMITS.bodyBytes) {
      return { ok: false, reason: { key: 'server.errors.payloadTooLarge', params: { mb: Math.round(BOARD_LIMITS.bodyBytes / (1024 * 1024)) } } };
    }

    // ordem relativa do que já existia: só quem edita
    if (acc.order) {
      const keep = (list: string[], els: Y.Map<Y.Map<unknown>>) => list.filter((id, i) => before.els.has(id) && els.has(id) && list.indexOf(id) === i);
      const a = keep(before.order.toArray(), after.els);
      const b = keep(after.order.toArray(), after.els);
      if (!deepEqual(a, b)) {
        // mesma regra do guard ("trocar a ordem do que já existia exige board.edit"), perguntada com 2 objetos fictícios
        const edit = guardBoardWrite({ old: withOrder(old, ['p', 'q']), incoming: withOrder(old, ['q', 'p']), viewer: actor, context: actor.context, canManageVoting: false, now });
        if (!edit.ok) return edit;
      }
    }

    // as regras do PUT (Chat 07) sobre o pedaço que mudou
    const result = guardBoardWrite({ old, incoming, viewer: actor, context: actor.context, canManageVoting: false, now });
    if (!result.ok) return result;

    // estrito: o guard não pode ter precisado corrigir nada
    for (const id of ids) {
      if (!deepEqual(clean(result.data.elements[id]), clean(newEls[id]))) return { ok: false, reason: invalid() };
    }

    // Chat 08.2: imagens no tempo real só por referência a arquivo já vinculado a este board. Só quando a IMAGEM do
    // elemento é nova ou mudou: imagem antiga ainda embutida (não convertida: SVG, acima do limite) pode ser movida.
    for (const id of ids) {
      const n = newEls[id];
      if (!n || n.type !== 'image') continue;
      const src = imageSourceOf(n);
      const before = oldEls[id] ? imageSourceOf(oldEls[id]) : undefined;
      if (src === before || src === undefined) continue;
      if (isRasterDataUrl(src)) return { ok: false, reason: { key: 'server.errors.imageMustUpload' } };
      const hash = assetHashOf(src);
      if (hash && !assetLinked(hash)) return { ok: false, reason: { key: 'server.errors.imageNotAvailable' } };
    }

    // objeto em uso por outra pessoa (selecionado ou editando): ninguém mais mexe até ela soltar
    let revealed = 0;
    for (const id of ids) {
      const o = oldEls[id];
      if (!o) continue;
      const n = newEls[id];
      const keys = n ? changedKeys(o, n) : ['*deleted'];
      const onlyReveal = keys.length === 1 && keys[0] === 'isPrivateDraft';
      if (onlyReveal && (o as StickyNoteElement).isPrivateDraft && n && !(n as StickyNoteElement).isPrivateDraft) revealed++;
      if (onlyReveal || (o.type === 'connector' && keys.every((k) => GEOMETRY.has(k)))) continue;
      const who = inUseBy(id);
      if (who) return { ok: false, reason: { key: 'server.errors.objectInUse', params: { name: who } } };
    }

    const v0 = facOld.voting;
    const v1 = facNew.voting;
    const votingRevealed = v1 && v1.revealed && v0 && !v0.revealed && (v0.startedAt ?? null) === (v1.startedAt ?? null) ? { title: v1.title } : null;
    return { ok: true, revealed, votingRevealed };
  }
}

/** Mesmo board com 2 objetos fictícios numa ordem dada (para pedir ao guard a regra de reordenar). */
function withOrder(base: BoardData, order: string[]): BoardData {
  const fake = (id: string) => ({ id, type: 'shape', x: 0, y: 0, width: 1, height: 1, rotation: 0, zIndex: 0, createdAt: 0, updatedAt: 0 }) as unknown as CanvasElement;
  return { ...base, elements: { p: fake('p'), q: fake('q') }, elementOrder: order };
}
