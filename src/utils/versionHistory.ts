/**
 * LuDraw — Chat 06 · Rodada B: Histórico de Versões (snapshots) do board aberto.
 *
 * - **automáticas** a cada `WorkspacePolicies.autoSnapshotIntervalMin` minutos, só se o conteúdo mudou;
 * - **manuais** com nome (quem pode editar o board);
 * - **de segurança** antes de restaurar uma versão e antes de excluir em massa (≥ BULK_DELETE_THRESHOLD);
 * - **retenção**: versões automáticas e de segurança somem após `snapshotRetentionDays`; manuais ficam até
 *   alguém excluir (a mais recente de todas nunca é apagada pela retenção);
 * - **restaurar** exige `board.restoreSnapshot` (titular/admin), cria a versão de segurança ANTES e registra no
 *   Activity Log do board e no Audit Log do Workspace.
 *
 * Tudo passa pelo `boardRepository` (IndexedDB) — nada fala com o banco direto.
 */
import { useEffect } from 'react';
import type { BoardData } from '../types/canvas';
import type { BoardSnapshot } from '../types/workspace';
import type { StoredMessage } from '../i18n/types';
import { useAppStore } from '../store/useAppStore';
import { setBulkDeleteHandler, useBoardStore } from '../store/useBoardStore';
import { policiesOf } from '../store/workspaceSlice';
import { errorText } from './api';
import { boardRepository, serverBoardRepository } from './boardRepository';
import { persistCurrentBoard } from './boardActions';
import { createId } from './id';

const MINUTE = 60_000;
const DAY = 86_400_000;
/** Teto de versões automáticas por board (além da retenção em dias). */
export const MAX_AUTO_SNAPSHOTS = 60;

/** Ouvintes da lista (o painel recarrega quando uma versão nova é gravada). */
const listeners = new Set<(boardId: string) => void>();
export function onSnapshotsChanged(fn: (boardId: string) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const notify = (boardId: string) => listeners.forEach((fn) => fn(boardId));

function countObjects(data: BoardData): number {
  return data.elementOrder.filter((id) => data.elements[id] && data.elements[id].type !== 'comment').length;
}

/** Grava uma versão do board (dado explícito ou o estado atual do board aberto). */
export async function saveSnapshot(input: { boardId: string; data: BoardData; kind: NonNullable<BoardSnapshot['kind']>; name?: string; reason?: StoredMessage }): Promise<BoardSnapshot | null> {
  const app = useAppStore.getState();
  const snap: BoardSnapshot = {
    id: createId(12),
    boardId: input.boardId,
    name: input.name?.trim() ?? '',
    createdAt: Date.now(),
    // autor = pessoa real da sessão (a simulação "Visualizar como" não muda a autoria)
    createdBy: app.session.userId,
    elementCount: countObjects(input.data),
    // cópia profunda: o board continua mudando depois
    data: JSON.parse(JSON.stringify(input.data)) as BoardData,
    kind: input.kind,
    reason: input.reason,
  };
  try {
    await boardRepository.saveSnapshot(snap);
  } catch {
    return null;
  }
  await pruneSnapshots(input.boardId);
  notify(input.boardId);
  return snap;
}

/** Retenção: automáticas/de segurança vencidas saem; automáticas acima do teto também. */
export async function pruneSnapshots(boardId: string): Promise<void> {
  // Chat 07: no Modo Servidor a retenção é aplicada pelo próprio servidor
  if (serverBoardRepository) return;
  const policies = policiesOf(useAppStore.getState());
  const list = await boardRepository.listSnapshots(boardId);
  if (list.length <= 1) return;
  const limit = Date.now() - Math.max(1, policies.snapshotRetentionDays) * DAY;
  const newest = list[0].id;
  let autos = 0;
  for (const s of list) {
    if (s.id === newest || s.kind === 'manual') continue;
    if (s.kind === 'auto' || !s.kind) autos++;
    if (s.createdAt < limit || autos > MAX_AUTO_SNAPSHOTS) await boardRepository.deleteSnapshot(s.id, boardId);
  }
}

/** "Salvar versão agora" (quem pode editar o board). */
export async function saveManualSnapshot(name: string): Promise<BoardSnapshot | null> {
  const b = useBoardStore.getState();
  if (!b.boardId || b.readOnly || !b.ensure('board.edit')) return null;
  await persistCurrentBoard(false);
  return saveSnapshot({ boardId: b.boardId, data: b.serialize(), kind: 'manual', name });
}

/** Mensagem que identifica a versão (nome dado pelo usuário, ou o tipo). */
export function snapshotLabelMessage(s: BoardSnapshot): StoredMessage {
  if (s.kind === 'manual' && s.name) return { key: 'history.named', params: { name: s.name } };
  if (s.kind === 'safety') return { key: 'history.kind.safety' };
  return { key: 'history.kind.auto' };
}

/**
 * Restaura uma versão: snapshot de segurança do estado atual → conteúdo da versão → salva →
 * registra no Activity Log e no Audit Log. Devolve false se a permissão foi negada ou algo falhou.
 */
export async function restoreSnapshot(snap: BoardSnapshot): Promise<boolean> {
  const b = useBoardStore.getState();
  if (!b.boardId || b.boardId !== snap.boardId || b.readOnly || !b.ensure('board.restoreSnapshot')) return false;
  const label = snapshotLabelMessage(snap);
  // Chat 07: no servidor, restaurar é uma operação do servidor (versão de segurança + registro lá) e o board recarrega
  if (serverBoardRepository) {
    try {
      await persistCurrentBoard(false);
      const data = await serverBoardRepository.restoreSnapshot(snap.boardId, snap.id);
      if (!data || useBoardStore.getState().boardId !== snap.boardId) return false;
      const camera = useBoardStore.getState().camera;
      useBoardStore.getState().loadBoard(snap.boardId, data);
      useBoardStore.getState().setCamera(camera);
      notify(snap.boardId);
      return true;
    } catch (e) {
      useAppStore.getState().toast(errorText(e), 'danger');
      return false;
    }
  }
  const safety = await saveSnapshot({ boardId: b.boardId, data: b.serialize(), kind: 'safety', reason: { key: 'history.reason.beforeRestore', params: { label } } });
  if (!safety) return false;
  if (!useBoardStore.getState().replaceContent(snap.data)) return false;
  const objects = countObjects(snap.data);
  useBoardStore.getState().recordActivity('snapshot_restored', { key: 'board.activity.snapshotRestored', params: { label, count: objects } }, { targetType: 'board', targetCount: objects });
  await persistCurrentBoard(true);
  const app = useAppStore.getState();
  const meta = app.boards.find((x) => x.id === snap.boardId);
  app.recordWorkspaceAudit('snapshot_restored', { key: 'workspace.audit.msg.snapshotRestored', params: { name: meta?.name ?? '', label } }, { targetType: 'board', targetId: snap.boardId, targetName: meta?.name });
  return true;
}

export async function deleteSnapshot(snap: BoardSnapshot): Promise<boolean> {
  const b = useBoardStore.getState();
  if (!b.ensure('board.restoreSnapshot')) return false;
  await boardRepository.deleteSnapshot(snap.id, snap.boardId);
  notify(snap.boardId);
  return true;
}

/** Instala o snapshot de segurança antes de exclusões em massa (uma vez, no boot). */
let installed = false;
export function installSafetySnapshots(): void {
  if (installed) return;
  installed = true;
  setBulkDeleteHandler((before, count) => {
    const id = useBoardStore.getState().boardId;
    if (!id) return;
    void saveSnapshot({ boardId: id, data: before, kind: 'safety', reason: { key: 'history.reason.beforeBulkDelete', params: { count } } });
  });
}

/**
 * Versões automáticas do board aberto: a cada minuto confere se passou `autoSnapshotIntervalMin` desde a
 * última versão E se o conteúdo mudou desde então. Ao abrir um board sem nenhuma versão, grava a inicial.
 */
export function useAutoSnapshots(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const boardId = useBoardStore.getState().boardId;
    if (!boardId) return;
    let lastAt = 0;
    let dirty = false;
    let alive = true;

    void boardRepository.listSnapshots(boardId).then((list) => {
      if (!alive) return;
      lastAt = list[0]?.createdAt ?? 0;
      const b = useBoardStore.getState();
      if (list.length === 0 && b.boardId === boardId && b.elementOrder.length > 0 && !b.readOnly) {
        lastAt = Date.now();
        void saveSnapshot({ boardId, data: b.serialize(), kind: 'auto' });
      }
    });

    const unsub = useBoardStore.subscribe((s, prev) => {
      if (s.boardId === boardId && (s.elements !== prev.elements || s.elementOrder !== prev.elementOrder || s.boardTags !== prev.boardTags)) dirty = true;
    });

    const tick = () => {
      const b = useBoardStore.getState();
      if (!dirty || b.boardId !== boardId || b.readOnly) return;
      const every = Math.max(1, policiesOf(useAppStore.getState()).autoSnapshotIntervalMin) * MINUTE;
      if (Date.now() - lastAt < every) return;
      dirty = false;
      lastAt = Date.now();
      void saveSnapshot({ boardId, data: b.serialize(), kind: 'auto' });
    };
    const timer = window.setInterval(tick, MINUTE);
    return () => {
      alive = false;
      unsub();
      window.clearInterval(timer);
    };
  }, [enabled]);
}
