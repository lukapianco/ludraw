/**
 * LuDraw — Chat 06: hooks reativos do Workspace para a UI (Mesa, #/admin, modais).
 * Toda decisão continua no motor único `explain()` — aqui só se assina o store e se traduz o motivo.
 */
import { useMemo } from 'react';
import { useAppStore, type AppState } from '../store/useAppStore';
import { currentViewer, explainBoardAction, explainWorkspaceAction, wsView } from '../store/workspaceSlice';
import type { BoardMeta } from '../types/workspace';
import type { PermissionAction } from '../utils/permissions';
import { canSeeBoard, effectivePlace, orgMembers, type MemberView, type Place, type Viewer, type WorkspaceView } from '../utils/workspace';
import { boardPlaceLabel } from '../utils/workspaceDisplay';
import { translateMessage } from '../i18n';
import { useLocale } from '../i18n/useT';

export interface CanResult {
  allowed: boolean;
  reason?: string;
}

/** Quem está olhando (considera "Visualizar como…"). */
export function useViewer(): Viewer {
  const session = useAppStore((s) => s.session);
  const teams = useAppStore((s) => s.teams);
  const directory = useAppStore((s) => s.directory);
  return useMemo(() => currentViewer({ session, teams, directory }), [session, teams, directory]);
}

export function useWsView(): WorkspaceView {
  const workspace = useAppStore((s) => s.workspace);
  const teams = useAppStore((s) => s.teams);
  const projects = useAppStore((s) => s.projects);
  const directory = useAppStore((s) => s.directory);
  return useMemo(() => wsView({ workspace, teams, projects, directory }), [workspace, teams, projects, directory]);
}

/** Boards que aparecem para quem está olhando (sem lixeira; respeita a hierarquia e o compartilhamento). */
export function useVisibleBoards(): BoardMeta[] {
  const boards = useAppStore((s) => s.boards);
  const viewer = useViewer();
  const ws = useWsView();
  return useMemo(() => boards.filter((b) => canSeeBoard(viewer, b, ws)), [boards, viewer, ws]);
}

function toResult(d: { allowed: boolean; reason?: Parameters<typeof translateMessage>[0] }): CanResult {
  return { allowed: d.allowed, reason: d.reason ? translateMessage(d.reason) : undefined };
}

/** `can()` de uma ação do Workspace, com o motivo já traduzido. */
export function useWorkspaceCan(action: PermissionAction): CanResult {
  const json = useAppStore((s) => JSON.stringify(explainWorkspaceAction(s, action)));
  useLocale();
  return useMemo(() => toResult(JSON.parse(json)), [json]);
}

/** `can()` de uma ação sobre um board visto de fora (Mesa, modais). */
export function useBoardCan(boardId: string | null | undefined, action: PermissionAction): CanResult {
  const json = useAppStore((s) => {
    const meta = boardId ? s.boards.find((b) => b.id === boardId) : undefined;
    return meta ? JSON.stringify(explainBoardAction(s, meta, action)) : '{"allowed":false}';
  });
  useLocale();
  return useMemo(() => toResult(JSON.parse(json)), [json]);
}

/** Versões sem hook (menus montados na hora do clique). */
export function workspaceCan(action: PermissionAction, s: AppState = useAppStore.getState()): CanResult {
  return toResult(explainWorkspaceAction(s, action));
}

export function boardCan(meta: BoardMeta, action: PermissionAction, s: AppState = useAppStore.getState()): CanResult {
  return toResult(explainBoardAction(s, meta, action));
}

/** Nome do lugar do board (Espaço pessoal, Geral, Time › Projeto) no idioma ativo. */
export function useBoardPlaceLabel(meta: BoardMeta | undefined): string {
  const teams = useAppStore((s) => s.teams);
  const projects = useAppStore((s) => s.projects);
  const workspace = useAppStore((s) => s.workspace);
  useLocale();
  return meta ? boardPlaceLabel(meta, { teams, projects, workspace }) : '';
}

/**
 * Lugar que a Mesa mostra de fato: se quem está olhando não alcança o lugar salvo (time de que não
 * participa, convidado diante do Espaço Pessoal/Geral), cai em "Compartilhados comigo" (convidado)
 * ou no Espaço Pessoal (membro) — sem alterar a escolha salva.
 */
export function useEffectivePlace(): Place {
  const place = useAppStore((s) => s.currentPlace);
  const teams = useAppStore((s) => s.teams);
  const viewer = useViewer();
  return useMemo(() => effectivePlace(place, viewer, teams), [place, viewer, teams]);
}

/**
 * Pessoas da organização para as TELAS (emenda v1.1 §10): participação via `membershipOf()` + dados de
 * exibição da conta. Nenhuma tela lê `UserAccount.status`/`workspaceRole` diretamente.
 */
export function useOrgMembers(): MemberView[] {
  const directory = useAppStore((s) => s.directory);
  const orgId = useAppStore((s) => s.workspace.id);
  return useMemo(() => orgMembers(directory, orgId), [directory, orgId]);
}
