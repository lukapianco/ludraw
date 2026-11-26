import { buildPermissionContext, useBoardStore } from '../store/useBoardStore';
import { explain, isFacilitator, type PermissionAction, type PermissionContext } from '../utils/permissions';
import { translateMessage, type MessageDescriptor } from '../i18n';
import { useLocale } from '../i18n/useT';

/**
 * Hook reativo sobre `can()`/`explain()` usando o perfil efetivo (inclui "Visualizar como…").
 * Use para desabilitar/explicar botões; a garantia continua nas ações do store (`ensure`).
 */
export function useCan(action: PermissionAction, extra?: Partial<Pick<PermissionContext, 'lockedBy' | 'authorId'>>): { allowed: boolean; reason?: string } {
  const lockedBy = extra?.lockedBy ?? null;
  const authorId = extra?.authorId ?? null;
  const allowed = useBoardStore((s) => explain(buildPermissionContext(s, { lockedBy, authorId }), action).allowed);
  // Chat 05.6: o motivo vem como chave + parâmetros; o seletor devolve texto estável (JSON) para
  // não re-renderizar à toa, e a tradução acontece aqui, no idioma ativo.
  const reasonJson = useBoardStore((s) => {
    const r = explain(buildPermissionContext(s, { lockedBy, authorId }), action).reason;
    return r ? JSON.stringify(r) : '';
  });
  useLocale();
  const reason = reasonJson ? translateMessage(JSON.parse(reasonJson) as MessageDescriptor) : undefined;
  return { allowed, reason };
}

/** O usuário efetivo é facilitador (owner, admin ou em facilitatorIds)? */
export function useIsFacilitator(): boolean {
  return useBoardStore((s) => isFacilitator(buildPermissionContext(s)));
}
