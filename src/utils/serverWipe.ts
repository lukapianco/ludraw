/**
 * LuDraw — limpeza do que é do SERVIDOR neste navegador ao sair (Chat 08.7 · R4 · achado S-29).
 *
 * Depois de "Sair" não pode sobrar a cópia da organização: metadados dos boards (com o token do link público), o
 * diretório (e-mails), o Audit Log em cache, o nome da organização, a cópia de trabalho dos boards, os documentos ao
 * vivo e as extensões instaladas no Modo Servidor (decisão do Chat 08.7: vão junto com o banco do servidor).
 *
 * Só o que é do servidor: chaves `ludraw:app@<servidor>` e `ludraw-srv:<servidor>:…` do localStorage e bancos
 * `ludraw-srv-<servidor>` / `ludraw-srv-<servidor>-y-<board>` do IndexedDB. O Modo Local (`ludraw:app`, banco
 * `ludraw`) NUNCA é tocado — há uma trava explícita (`isServerDbName`).
 *
 * Banco preso por outra aba (a exclusão fica "bloqueada"): o nome do servidor vai para `ludraw:wipe-pending` e a
 * limpeza é refeita no próximo carregamento do app, antes de qualquer banco abrir (`processPendingWipes`, no
 * `main.tsx`). As outras abas do mesmo servidor recebem o aviso pelo evento `storage` e saem também.
 */

export const WIPE_PENDING_KEY = 'ludraw:wipe-pending';
/** Sinal entre abas: "saí deste servidor" (o valor muda a cada saída para disparar o evento `storage`). */
export const LOGOUT_SIGNAL_PREFIX = 'ludraw:logout@';
const LOCAL_APP_KEY = 'ludraw:app';

/** Nome de banco que pertence a um servidor (nunca o do Modo Local). */
export function isServerDbName(name: string, key: string): boolean {
  const base = `ludraw-srv-${key}`;
  return !!key && (name === base || name.startsWith(`${base}-y-`));
}

/** Chave do localStorage que pertence a um servidor (nunca as do Modo Local). */
export function isServerStorageKey(name: string, key: string): boolean {
  if (!key) return false;
  return name === `${LOCAL_APP_KEY}@${key}` || name.startsWith(`ludraw-srv:${key}:`);
}

function readPending(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(WIPE_PENDING_KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length < 300) : [];
  } catch {
    return [];
  }
}

function writePending(keys: string[]): void {
  try {
    if (keys.length) localStorage.setItem(WIPE_PENDING_KEY, JSON.stringify([...new Set(keys)]));
    else localStorage.removeItem(WIPE_PENDING_KEY);
  } catch {
    /* sem localStorage */
  }
}

/**
 * Entrou de novo neste servidor: a cópia agora é desta sessão. A limpeza adiada já foi tentada no carregamento; se
 * outra aba ainda segurava o banco, o resto sai na próxima saída (limite registrado no HANDOFF).
 */
export function forgetPendingWipe(key: string): void {
  writePending(readPending().filter((k) => k !== key));
}

/** Servidores com limpeza adiada (para testes e diagnóstico). */
export const pendingWipes = (): string[] => readPending();

/** Só as preferências de tela (tema, idioma e afins, som) sobrevivem à saída — nada da organização. */
const KEPT_PREFS = ['theme', 'preferences', 'audioPrefs'] as const;

/** Tira do localStorage tudo o que é deste servidor (o estado salvo volta só com as preferências de tela). */
export function wipeServerStorage(key: string): void {
  try {
    const appKey = `${LOCAL_APP_KEY}@${key}`;
    let kept: Record<string, unknown> | null = null;
    try {
      const parsed = JSON.parse(localStorage.getItem(appKey) ?? 'null') as { state?: Record<string, unknown>; version?: number } | null;
      if (parsed?.state) kept = Object.fromEntries(KEPT_PREFS.filter((k) => k in parsed.state!).map((k) => [k, parsed.state![k]]));
      if (kept) kept = { state: kept, version: parsed?.version ?? 1 };
    } catch {
      kept = null;
    }
    const names: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const name = localStorage.key(i);
      if (name && isServerStorageKey(name, key)) names.push(name);
    }
    names.forEach((n) => localStorage.removeItem(n));
    if (kept) localStorage.setItem(appKey, JSON.stringify(kept));
  } catch {
    /* sem localStorage */
  }
}

type DropResult = 'deleted' | 'blocked';

function drop(name: string): Promise<DropResult> {
  return new Promise((resolve) => {
    let r: IDBOpenDBRequest;
    try {
      r = indexedDB.deleteDatabase(name);
    } catch {
      resolve('blocked');
      return;
    }
    r.onsuccess = () => resolve('deleted');
    r.onerror = () => resolve('blocked');
    // outra conexão aberta (outra aba): o pedido continua na fila do navegador, mas não dá para garantir — adia
    r.onblocked = () => resolve('blocked');
  });
}

/**
 * Apaga a cópia deste servidor (localStorage + IndexedDB). Devolve `deferred` quando algum banco ficou preso por
 * outra aba (a limpeza é refeita no próximo carregamento).
 */
export async function wipeServerCopy(key: string): Promise<'done' | 'deferred'> {
  if (!key) return 'done';
  wipeServerStorage(key);
  if (typeof indexedDB === 'undefined') return 'done';
  const names = new Set<string>([`ludraw-srv-${key}`]);
  try {
    const dbs = (await (indexedDB as IDBFactory & { databases?: () => Promise<{ name?: string }[]> }).databases?.()) ?? [];
    for (const d of dbs) if (d.name && isServerDbName(d.name, key)) names.add(d.name);
  } catch {
    /* navegador sem listagem: o banco principal sai; os do ao vivo saem quando o board abrir de novo */
  }
  const results = await Promise.all([...names].filter((n) => isServerDbName(n, key)).map(drop));
  const blocked = results.includes('blocked');
  const pending = readPending().filter((k) => k !== key);
  writePending(blocked ? [...pending, key] : pending);
  return blocked ? 'deferred' : 'done';
}

/** No carregamento, ANTES de abrir qualquer banco: refaz as limpezas adiadas (outra aba segurava o banco). */
export async function processPendingWipes(): Promise<void> {
  const keys = readPending();
  for (const key of keys) await wipeServerCopy(key);
}

/** Avisa as outras abas deste navegador que este servidor saiu (elas limpam e voltam à entrada). */
export function signalLogout(key: string): void {
  try {
    localStorage.setItem(`${LOGOUT_SIGNAL_PREFIX}${key}`, String(Date.now()));
    localStorage.removeItem(`${LOGOUT_SIGNAL_PREFIX}${key}`);
  } catch {
    /* sem localStorage */
  }
}
