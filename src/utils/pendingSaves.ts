/**
 * LuDraw — gravações do board ainda por terminar (Chat 09.1 · R8).
 *
 * O programa desktop pede ao app que grave o que falta (o mesmo evento de fechar a aba) e só fecha a janela quando
 * esta contagem chega a zero, com um teto de tempo. Antes ele esperava um tempo fixo, e uma gravação lenta se perdia.
 * Conta o salvamento automático agendado e cada gravação em andamento. Só leitura para fora: `window.__ludrawPendingSaves()`.
 */
let running = 0;
let scheduled = false;

declare global {
  interface Window {
    __ludrawPendingSaves?: () => number;
  }
}

if (typeof window !== 'undefined') {
  Object.defineProperty(window, '__ludrawPendingSaves', { value: () => running + (scheduled ? 1 : 0), configurable: true, writable: false });
}

/** Acompanha uma gravação até ela terminar (com sucesso ou não). */
export function trackSave<T>(work: Promise<T>): Promise<T> {
  running++;
  return work.finally(() => {
    running--;
  });
}

/** O salvamento automático tem uma gravação agendada? */
export function markSaveScheduled(on: boolean): void {
  scheduled = on;
}

/** Quantas gravações faltam (para os testes). */
export function pendingSaves(): number {
  return running + (scheduled ? 1 : 0);
}
