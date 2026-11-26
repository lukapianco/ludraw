/**
 * LuDraw — reenvio das mudanças feitas SEM REDE, objeto por objeto (Chat 08.2 · A-1). PURO: o cliente
 * (`binding.ts`) e os testes do servidor usam este arquivo; não importa `yjs` (o codec recebe o módulo por `bindYjs`).
 *
 * Por que objeto por objeto: ao reconectar, o provider mandaria tudo o que foi feito offline numa atualização só, e
 * o veto recusaria tudo se UM objeto estivesse em uso (ou negado). Aqui:
 *   base confirmada (o que o servidor já tinha)  ×  estado desejado (o store)  →  um passo por objeto
 * Cada passo vira UMA transação, com um `clientID` NOVO (o Yjs exige relógios contínuos por cliente: com o mesmo
 * `clientID`, uma atualização recusada no meio bloquearia todas as seguintes). Só os campos que a pessoa mudou em
 * relação à base são escritos, sobre o documento ATUAL do servidor (o que os outros mudaram nos outros campos fica).
 * A ordem (posição dos objetos novos e reordenação) vai num passo à parte, depois de saber o que entrou.
 */
import type * as Y from 'yjs';
import type { CanvasElement } from '../types/canvas';
import { EXCLUDED_ELEMENT_KEYS, deepEqual, publicElement, rootsOf, writeElement, writeFacFields, writeMetaFields, type BoardSlice } from './codec';
import type { WireMessage } from './protocol';

export type ElementStepKind = 'create' | 'update' | 'delete';

export interface ElementStep {
  kind: 'element';
  id: string;
  op: ElementStepKind;
  /** como estava na base confirmada (update/delete) */
  base?: CanvasElement;
  /** como a pessoa deixou (create/update) */
  next?: CanvasElement;
}

export interface FieldsStep {
  kind: 'meta' | 'fac';
}

export type ReplayStep = ElementStep | FieldsStep;

export interface ReplayPlan {
  /** um passo por objeto mudado + meta/facilitação (cada um vira uma transação) */
  steps: ReplayStep[];
  /** ids criados offline (entram na ordem no passo final, se aceitos) */
  created: string[];
  /** a ordem relativa do que já existia mudou (passo final de ordem) */
  reordered: boolean;
  base: BoardSlice;
  desired: BoardSlice;
}

/** Forma comparável de um elemento: o que vai ao documento público, sem os campos que não vão (zIndex). */
function comparable(el: CanvasElement): Record<string, unknown> {
  const pub = publicElement(el) as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(pub)) if (!EXCLUDED_ELEMENT_KEYS.has(k) && v !== undefined) out[k] = v;
  return out;
}

/** O texto da nota privada própria não vai ao documento (vai por `me.draft`): mudou o texto/tags dela? */
function draftChanged(a: CanvasElement, b: CanvasElement): boolean {
  const pa = a as unknown as { isPrivateDraft?: boolean; text?: string; tags?: unknown };
  const pb = b as unknown as { isPrivateDraft?: boolean; text?: string; tags?: unknown };
  return !!pb.isPrivateDraft && (pa.text !== pb.text || !deepEqual(pa.tags ?? [], pb.tags ?? []));
}

const relative = (order: string[], keep: Set<string>) => order.filter((id) => keep.has(id));

/** Monta o plano: o que mudou entre a base confirmada e o estado desejado. Vazio = nada feito offline. */
export function planReplay(base: BoardSlice, desired: BoardSlice): ReplayPlan {
  const steps: ReplayStep[] = [];
  const created: string[] = [];
  const ids = new Set([...Object.keys(base.elements), ...Object.keys(desired.elements)]);
  // ordem estável: a do estado desejado, depois o que só existia na base
  const ordered = [...desired.elementOrder.filter((id) => ids.has(id)), ...[...ids].filter((id) => !desired.elementOrder.includes(id))];
  const seen = new Set<string>();
  for (const id of ordered) {
    if (seen.has(id)) continue;
    seen.add(id);
    const b = base.elements[id];
    const n = desired.elements[id];
    if (b && !n) steps.push({ kind: 'element', id, op: 'delete', base: b });
    else if (!b && n) {
      steps.push({ kind: 'element', id, op: 'create', next: n });
      created.push(id);
    } else if (b && n && (b !== n && (!deepEqual(comparable(b), comparable(n)) || draftChanged(b, n)))) steps.push({ kind: 'element', id, op: 'update', base: b, next: n });
  }
  if (!deepEqual(base.meta, desired.meta)) steps.push({ kind: 'meta' });
  const pubFac = (f: BoardSlice['fac']) => ({ privateMode: f.privateMode, timer: f.timer, voting: f.voting, leaderUserId: f.leaderUserId });
  if (!deepEqual(pubFac(base.fac), pubFac(desired.fac))) steps.push({ kind: 'fac' });
  const common = new Set(Object.keys(base.elements).filter((id) => desired.elements[id]));
  const reordered = !deepEqual(relative(base.elementOrder, common), relative(desired.elementOrder, common));
  return { steps, created, reordered, base, desired };
}

export const isEmptyPlan = (p: ReplayPlan): boolean => !p.steps.length && !p.reordered;

/** Ids de objetos que o passo toca (para o aviso e para casar com as recusas do servidor). */
export const stepIds = (s: ReplayStep): string[] => (s.kind === 'element' ? [s.id] : []);

export type StepOutcome = 'written' | 'noop' | 'gone';

/**
 * Aplica UM passo no documento numa transação própria (o chamador troca o `clientID` antes). `gone` = o objeto foi
 * apagado por outra pessoa enquanto esta estava sem rede: a edição NÃO o ressuscita (decisão do usuário, 08.2).
 */
export function applyReplayStep(doc: Y.Doc, plan: ReplayPlan, step: ReplayStep, origin: string): StepOutcome {
  const r = rootsOf(doc);
  if (step.kind === 'element') {
    if (step.op === 'update' && !r.els.has(step.id)) return 'gone';
    if (step.op === 'delete' && !r.els.has(step.id)) return 'noop';
    if (step.op === 'create' && r.els.has(step.id)) return 'noop';
  }
  let wrote = false;
  const el = step.kind === 'element' ? step : null;
  doc.transact(() => {
    if (!el) {
      if (step.kind === 'fac') {
        // `tally` é só do servidor: nunca entra aqui
        const { tally: _t, ...next } = plan.desired.fac;
        const { tally: _b, ...prev } = plan.base.fac;
        void _t;
        void _b;
        writeFacFields(r.fac, next, prev);
        wrote = true;
        return;
      }
      writeMetaFields(r.meta, plan.desired.meta, plan.base.meta);
      wrote = true;
      return;
    }
    if (el.op === 'delete') {
      r.els.delete(el.id);
      const cur = r.order.toArray();
      for (let i = cur.length - 1; i >= 0; i--) if (cur[i] === el.id) r.order.delete(i, 1);
      wrote = true;
      return;
    }
    // criar ou mudar só o que a pessoa mudou em relação à base (a nota privada vai sem texto: o texto segue por `me.draft`)
    writeElement(r.els, publicElement(el.next!), el.base ? publicElement(el.base) : undefined);
    wrote = true;
  }, origin);
  return wrote ? 'written' : 'noop';
}

/**
 * Ordem final sobre a ordem ATUAL do documento: o que já existia mantém as posições ocupadas, rearranjado na ordem
 * relativa que a pessoa deixou (se ela reordenou); os objetos novos aceitos entram no fim, na ordem dela.
 */
export function mergedOrder(docOrder: string[], plan: ReplayPlan, accepted: Set<string>, exists: (id: string) => boolean): string[] {
  const out = [...docOrder];
  if (plan.reordered) {
    const commonIds = new Set(Object.keys(plan.base.elements).filter((id) => plan.desired.elements[id] && docOrder.includes(id)));
    const want = [...new Set(plan.desired.elementOrder.filter((id) => commonIds.has(id)))];
    const slots = out.filter((id) => commonIds.has(id)).length;
    if (want.length === slots) {
      let k = 0;
      for (let i = 0; i < out.length; i++) if (commonIds.has(out[i])) out[i] = want[k++];
    }
  }
  const present = new Set(out);
  for (const id of plan.desired.elementOrder) if (plan.created.includes(id) && accepted.has(id) && exists(id) && !present.has(id)) out.push(id);
  return out;
}

/** Passo final de ordem (transação própria). Devolve false se não havia nada a mudar. */
export function applyReplayOrder(doc: Y.Doc, plan: ReplayPlan, accepted: Set<string>, origin: string): boolean {
  const r = rootsOf(doc);
  const cur = r.order.toArray();
  const next = mergedOrder(cur, plan, accepted, (id) => r.els.has(id));
  if (deepEqual(cur, next)) return false;
  doc.transact(() => {
    const isAppend = cur.every((id, i) => next[i] === id);
    if (isAppend) r.order.push(next.slice(cur.length));
    else {
      r.order.delete(0, r.order.length);
      r.order.push(next);
    }
  }, origin);
  return true;
}

/** `clientID` novo para uma transação de reenvio (32 bits, como o Yjs gera). */
export function freshClientId(): number {
  const a = new Uint32Array(1);
  globalThis.crypto.getRandomValues(a);
  return a[0];
}

export interface ReplayChannel {
  /** `batch on` (não espera) / `batch off` (espera o resumo do servidor) */
  batch: (on: boolean) => Promise<{ accepted: number; denied: { ids: string[]; reason: WireMessage }[] }>;
}

export interface ReplayResult {
  denied: { ids: string[]; reason: WireMessage }[];
  gone: string[];
  /** clientIDs usados (um por transação escrita) */
  clientIds: number[];
}

/**
 * Envia o plano: fase 1 = um objeto por transação (clientID novo em cada), em lotes ≤ `lot` e no ritmo de `pace` por
 * janela de taxa; fase 2 = a ordem, só com os objetos novos que entraram. Usado pelo binding e pelos testes.
 */
export async function sendReplay(
  doc: Y.Doc,
  plan: ReplayPlan,
  io: ReplayChannel,
  opts: { origin: string; lot: number; pace: number; windowMs: number; stopped?: () => boolean },
): Promise<ReplayResult> {
  const denied: ReplayResult['denied'] = [];
  const gone: string[] = [];
  const clientIds: number[] = [];
  const stopped = opts.stopped ?? (() => false);
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  if (isEmptyPlan(plan)) return { denied, gone, clientIds };
  for (const lot of chunkSteps(plan.steps, opts.lot)) {
    await io.batch(true);
    let sent = 0;
    for (const step of lot) {
      if (stopped()) return { denied, gone, clientIds };
      const id = freshClientId();
      doc.clientID = id;
      const out = applyReplayStep(doc, plan, step, opts.origin);
      if (out === 'gone' && step.kind === 'element') gone.push(step.id);
      if (out === 'written') {
        clientIds.push(id);
        if (++sent % opts.pace === 0) await wait(opts.windowMs + 50);
      }
    }
    denied.push(...(await io.batch(false)).denied);
  }
  const refused = new Set(denied.flatMap((d) => d.ids));
  const accepted = new Set(plan.created.filter((id) => !refused.has(id)));
  if (!stopped() && (plan.reordered || accepted.size)) {
    await io.batch(true);
    const id = freshClientId();
    doc.clientID = id;
    if (applyReplayOrder(doc, plan, accepted, opts.origin)) clientIds.push(id);
    denied.push(...(await io.batch(false)).denied);
  }
  // a escrita normal segue com outro clientID (nenhum de um passo recusado)
  doc.clientID = freshClientId();
  return { denied, gone, clientIds };
}

/** Divide os passos em lotes que cabem no teto do servidor (`RATE.batchMaxUpdates`), com folga. */
export function chunkSteps<T>(steps: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < steps.length; i += size) out.push(steps.slice(i, i + size));
  return out;
}
