/**
 * LuDraw server — recusas ESPERADAS do tempo real fora do console (Chat 08.2 · A-1).
 *
 * O Hocuspocus 4.7.1 escreve direto no `console.error` (sem opção de logger) a cada erro de hook:
 *   `[onAuthenticate] <mensagem>` / `[beforeSync] <mensagem>`             (função `hooks`)
 *   `closing connection <id> (while handling <doc>) because of exception`  (fila da conexão, com o erro)
 * Para o LuDraw, quase todas são decisões normais (veto, nome de documento inválido, época antiga, sem
 * permissão, limite). Este filtro reconhece SÓ essas duas formas de linha e SÓ quando o erro é uma
 * `CollabRefusal` nossa (mensagem com prefixo próprio + `instanceof`); manda para o logger em `debug` (limites em
 * `info`) com um contador por motivo. Qualquer outra coisa segue para o `console.error` original, inalterada.
 */

export const REFUSAL_PREFIX = 'od-refusal:';

export type RefusalReason = 'denied' | 'unauthorized' | 'limit' | 'reset:epoch' | 'rate';

/** Recusa decidida pelo LuDraw. `reason` é o que o cliente recebe (o Hocuspocus usa `reason` no fechamento). */
export class CollabRefusal extends Error {
  constructor(
    readonly reason: RefusalReason,
    readonly code?: number,
  ) {
    super(`${REFUSAL_PREFIX}${reason}`);
  }
}

export interface RefusalEvent {
  reason: RefusalReason;
  /** `hook` = linha `[hook] mensagem`; `close` = linha "closing connection …" */
  line: 'hook' | 'close';
  hook?: string;
}

type Handler = (e: RefusalEvent) => void;

/** `hooks()` imprime `console.error('[nomeDoHook]', erro.message)` — dois argumentos (ou uma linha só, por segurança). */
const HOOK_NAME = /^\[([A-Za-z]+)\]$/;
const HOOK_LINE = /^\[([A-Za-z]+)\] od-refusal:([a-z:]+)$/;
const REFUSAL_MSG = /^od-refusal:([a-z:]+)$/;
const CLOSE_LINE = /^closing connection \S+ \(while handling .*\) because of exception$/;
const REASONS: ReadonlySet<string> = new Set(['denied', 'unauthorized', 'limit', 'reset:epoch', 'rate']);

/** Classifica uma chamada de `console.error`; null = não é recusa nossa (passa direto). */
export function classifyConsoleError(args: unknown[]): RefusalEvent | null {
  const first = args[0];
  if (typeof first !== 'string') return null;
  if (args.length === 1) {
    const m = HOOK_LINE.exec(first);
    if (m && REASONS.has(m[2])) return { reason: m[2] as RefusalReason, line: 'hook', hook: m[1] };
    return null;
  }
  if (args.length === 2 && typeof args[1] === 'string') {
    const h = HOOK_NAME.exec(first);
    const m = REFUSAL_MSG.exec(args[1]);
    if (h && m && REASONS.has(m[1])) return { reason: m[1] as RefusalReason, line: 'hook', hook: h[1] };
    return null;
  }
  if (args.length === 2 && CLOSE_LINE.test(first) && args[1] instanceof CollabRefusal) return { reason: args[1].reason, line: 'close' };
  return null;
}

let original: typeof console.error | null = null;
let wrapper: typeof console.error | null = null;
const handlers = new Set<Handler>();

/** Liga o filtro (um por processo; vários hubs dividem o mesmo). Devolve a função que desliga ESTE handler. */
export function installRefusalFilter(handler: Handler): () => void {
  handlers.add(handler);
  if (!original) {
    original = console.error;
    const prev = console.error.bind(console) as (...args: unknown[]) => void;
    wrapper = (...args: unknown[]) => {
      const ev = handlers.size ? classifyConsoleError(args) : null;
      if (!ev) return prev(...args);
      for (const h of handlers) {
        try {
          h(ev);
        } catch {
          /* o log nunca derruba a conexão */
        }
      }
    };
    console.error = wrapper;
  }
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    handlers.delete(handler);
    if (!handlers.size && original) {
      // só desfaz se ninguém trocou o console.error depois de nós
      if (console.error === wrapper) console.error = original;
      original = null;
      wrapper = null;
    }
  };
}

/** Filtro ligado? (testes) */
export function refusalFilterActive(): boolean {
  return original !== null;
}
