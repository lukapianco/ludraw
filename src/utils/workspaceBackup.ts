/**
 * LuDraw — Chat 06 · Rodada B: backup e restauração completa do Workspace (`.ludraw-workspace`).
 *
 * Formato PRÓPRIO (JSON, versão 1): organização + políticas, diretório, times, projetos, templates, Audit Log,
 * metadados e conteúdo de todos os boards (inclusive lixeira) e o histórico de versões.
 * Ficam DE FORA por segurança: senhas locais (`accounts`) e convites pendentes (os tokens são credenciais).
 *
 * Restaurar não destrói nada na hora: boards do backup sobrescrevem os de mesmo id; boards que existem aqui e
 * não estão no backup vão para a LIXEIRA (recuperáveis). Só administradores (`workspace.backup.manage`).
 */
import type { BoardData } from '../types/canvas';
import type { BoardMeta, BoardSnapshot, ProjectFolder, TeamEntity, TemplateEntity, UserAccount, WorkspaceAuditEntry, WorkspaceEntity } from '../types/workspace';
import type { MessageDescriptor } from '../i18n/types';
import { useAppStore } from '../store/useAppStore';
import { explainWorkspaceAction } from '../store/workspaceSlice';
import { boardRepository, isBoardData } from './boardRepository';
import { clearSearchIndex } from './globalSearch';
import { downloadBlob } from './export';
import { slugify } from './workspace';
import { msg } from '../i18n';
import { stripUnsafeContent } from './contentSafety';

export const WORKSPACE_BACKUP_FORMAT = 'ludraw-workspace';
export const WORKSPACE_BACKUP_VERSION = 1;
export const WORKSPACE_BACKUP_EXTENSION = '.ludraw-workspace';

export interface WorkspaceBackupFile {
  format: typeof WORKSPACE_BACKUP_FORMAT;
  version: number;
  exportedAt: number;
  workspace: WorkspaceEntity;
  directory: UserAccount[];
  teams: TeamEntity[];
  projects: ProjectFolder[];
  templates: TemplateEntity[];
  auditLog: WorkspaceAuditEntry[];
  boards: BoardMeta[];
  boardData: Record<string, BoardData>;
  snapshots: BoardSnapshot[];
}

export interface BackupSummary {
  organization: string;
  exportedAt: number;
  boards: number;
  teams: number;
  projects: number;
  templates: number;
  people: number;
  snapshots: number;
}

export function summarizeBackup(file: WorkspaceBackupFile): BackupSummary {
  return {
    organization: file.workspace.name,
    exportedAt: file.exportedAt,
    boards: file.boards.filter((b) => !b.deletedAt).length,
    teams: file.teams.length,
    projects: file.projects.length,
    templates: file.templates.length,
    people: file.directory.length,
    snapshots: file.snapshots.length,
  };
}

/** Monta o arquivo a partir do estado atual (lê todo o conteúdo pelo BoardRepository). */
export async function buildWorkspaceBackup(): Promise<WorkspaceBackupFile> {
  const s = useAppStore.getState();
  const boardData: Record<string, BoardData> = {};
  for (const b of s.boards) {
    const data = await boardRepository.loadBoard(b.id);
    if (data) boardData[b.id] = data;
  }
  const snapshots = (await boardRepository.listAllSnapshots()).filter((snap) => boardData[snap.boardId]);
  return {
    format: WORKSPACE_BACKUP_FORMAT,
    version: WORKSPACE_BACKUP_VERSION,
    exportedAt: Date.now(),
    workspace: s.workspace,
    directory: s.directory,
    teams: s.teams,
    projects: s.projects,
    // templates pessoais da conta isolada (modo "sem conta") e de todos vão juntos: são conteúdo do navegador
    templates: s.templates,
    auditLog: s.auditLog,
    boards: s.boards,
    boardData,
    snapshots,
  };
}

/** Exporta e baixa o backup (registra no Audit Log). */
export async function exportWorkspaceBackup(): Promise<{ ok: true; boards: number } | { ok: false; reason: MessageDescriptor }> {
  const decision = explainWorkspaceAction(useAppStore.getState(), 'workspace.backup.manage');
  if (!decision.allowed) return { ok: false, reason: decision.reason ?? msg('permissions.denied.adminOnly') };
  const file = await buildWorkspaceBackup();
  const date = new Date(file.exportedAt).toISOString().slice(0, 10);
  const name = `${slugify(file.workspace.name) || 'ludraw'}-${date}${WORKSPACE_BACKUP_EXTENSION}`;
  downloadBlob(new Blob([JSON.stringify(file)], { type: 'application/json' }), name);
  const count = Object.keys(file.boardData).length;
  useAppStore.getState().recordWorkspaceAudit('workspace_backup_exported', { key: 'workspace.audit.msg.backupExported', params: { count } }, { targetType: 'workspace', targetId: file.workspace.id, count });
  return { ok: true, boards: count };
}

const isArray = (v: unknown): v is unknown[] => Array.isArray(v);

/** Valida o arquivo (formato, versão e estrutura) antes de qualquer gravação. */
export function parseWorkspaceBackup(text: string): { ok: true; file: WorkspaceBackupFile } | { ok: false; reason: MessageDescriptor } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: msg('history.backup.errorJson') };
  }
  const f = raw as Partial<WorkspaceBackupFile> | null;
  if (!f || typeof f !== 'object' || f.format !== WORKSPACE_BACKUP_FORMAT) return { ok: false, reason: msg('history.backup.errorFormat') };
  if (typeof f.version !== 'number' || f.version < 1) return { ok: false, reason: msg('history.backup.errorFormat') };
  if (f.version > WORKSPACE_BACKUP_VERSION) return { ok: false, reason: msg('history.backup.errorNewer', { version: f.version, supported: WORKSPACE_BACKUP_VERSION }) };
  if (!f.workspace || typeof f.workspace !== 'object' || typeof f.workspace.name !== 'string') return { ok: false, reason: msg('history.backup.errorStructure') };
  for (const key of ['directory', 'teams', 'projects', 'templates', 'auditLog', 'boards', 'snapshots'] as const) {
    if (!isArray(f[key])) return { ok: false, reason: msg('history.backup.errorStructure') };
  }
  if (!f.boardData || typeof f.boardData !== 'object') return { ok: false, reason: msg('history.backup.errorStructure') };
  const boards = (f.boards as BoardMeta[]).filter((b) => b && typeof b.id === 'string' && typeof b.name === 'string');
  for (const b of boards) {
    const data = (f.boardData as Record<string, unknown>)[b.id];
    if (data !== undefined && !isBoardData(data)) return { ok: false, reason: msg('history.backup.errorBoard', { name: b.name }) };
  }
  return { ok: true, file: { ...(f as WorkspaceBackupFile), boards } };
}

/**
 * Restaura: grava conteúdo e versões no BoardRepository e então substitui o estado do workspace pelo
 * do backup (ação do store, com Audit Log). Boards locais fora do backup vão para a lixeira.
 */
export async function restoreWorkspaceBackup(file: WorkspaceBackupFile): Promise<{ ok: true; boards: number; cleaned: number } | { ok: false; reason: MessageDescriptor }> {
  const decision = explainWorkspaceAction(useAppStore.getState(), 'workspace.backup.manage');
  if (!decision.allowed) return { ok: false, reason: decision.reason ?? msg('permissions.denied.adminOnly') };
  let written = 0;
  let cleaned = 0;
  for (const b of file.boards) {
    const raw = file.boardData[b.id];
    if (!raw) continue;
    // Chat 08.7 · R4 (S-30/S-31): imagem de fora do board, link inseguro e cor com url(…) ficam de fora
    const safe = stripUnsafeContent(raw);
    cleaned += safe.images + safe.links + safe.styles;
    const data = safe.data;
    if (await boardRepository.trySaveBoard(b.id, data)) written++;
    else return { ok: false, reason: msg('history.backup.errorStorage') };
  }
  for (const snap of file.snapshots) {
    try {
      await boardRepository.saveSnapshot(snap);
    } catch {
      /* uma versão que não coube não impede a restauração */
    }
  }
  boardRepository.forget();
  clearSearchIndex();
  useAppStore.getState().applyWorkspaceBackup(file);
  return { ok: true, boards: written, cleaned };
}
