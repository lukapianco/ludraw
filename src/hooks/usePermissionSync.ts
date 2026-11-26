import { useEffect } from 'react';
import { notify, useAppStore, type AppState } from '../store/useAppStore';
import { setPermissionDeniedHandler, useBoardStore, type BoardAccess } from '../store/useBoardStore';
import type { BoardMeta } from '../types/workspace';
import { policiesOf, wsView } from '../store/workspaceSlice';
import { boardPermissionContext, simulatedProfileUserId, viewerFor } from '../utils/workspace';
import { t } from '../i18n';
import { api } from '../utils/api';

/** O que `accessFor` lê do app (sessão + workspace + link público aberto). */
export type AccessSource = Pick<AppState, 'session' | 'directory' | 'teams' | 'projects' | 'workspace' | 'linkSession'>;

/**
 * Converte sessão (+ "Visualizar como…"), workspace e metadados do board no acesso efetivo do
 * store do board. Chat 06: preenche as políticas do workspace, o papel vindo da ACL/convite de
 * projeto, o visitante de link público e o "usuário simulado"; a hierarquia (Espaço Pessoal alheio,
 * time de que não participa, lixeira, conta suspensa) vira `boardAccess: false`.
 */
export function accessFor(app: AccessSource, meta: BoardMeta | undefined): BoardAccess {
  const session = app.session;
  const policies = policiesOf(app);
  const ws = wsView(app);
  const ownerId = meta?.ownerId ?? session.userId;

  // Visitante que entrou pelo link público deste board
  const link = app.linkSession;
  if (link && meta && link.boardId === meta.id) {
    return {
      // Modo Servidor: o id que o servidor deu a este visitante (autoria e cédulas batem com as do servidor)
      userId: api?.visitorIdFor(link.boardId) ?? `visitante:${link.token.slice(0, 8)}`,
      userName: t('permissions.visitorName'),
      workspaceRole: 'visitor',
      boardRole: null,
      shareAccessLevel: link.accessLevel,
      isBoardOwner: false,
      ownerId,
      // Chat 07: no Modo Servidor o visitante recebe as políticas da organização dona do board
      policies: link.policies ?? policies,
      allowDownload: link.allowDownload,
      viewAs: null,
    };
  }

  const va = session.viewAs;
  if (va && !va.simulatedUserId) {
    // perfil genérico: só muda o contexto de permissão (como no Chat 02)
    return {
      // id simulado: o perfil simulado NÃO é o autor das suas notas nem quem travou seus objetos
      userId: simulatedProfileUserId(va),
      userName: t('permissions.viewAs.userNameAs', { name: session.userName, profile: va.labelKey ? t(va.labelKey) : va.label }),
      workspaceRole: va.workspaceRole,
      boardRole: va.boardRole ?? null,
      shareAccessLevel: va.shareAccessLevel,
      isBoardOwner: false,
      ownerId,
      policies,
      allowDownload: meta?.publicLink?.allowDownload,
      viewAs: va,
    };
  }

  // a própria pessoa ou um usuário simulado do diretório (conta real do workspace local)
  const viewer = viewerFor(session, ws);
  const acc = va?.simulatedUserId ? app.directory.find((a) => a.id === va.simulatedUserId) : undefined;
  // Chat 07: mesma regra do servidor (o facilitador vem depois, da lista do board, em buildPermissionContext)
  const ctx = meta ? boardPermissionContext(viewer, meta, ws) : null;
  return {
    userId: viewer.userId,
    userName: acc?.name ?? session.userName,
    workspaceRole: viewer.workspaceRole,
    boardRole: ctx ? ctx.boardRole : null,
    isBoardOwner: ctx ? ctx.isBoardOwner : false,
    ownerId,
    policies,
    boardAccess: ctx ? ctx.boardAccess : undefined,
    isolated: viewer.isolated,
    viewAs: va ?? null,
  };
}

/**
 * Mantém `useBoardStore.access` em dia com a sessão do app e registra o handler que mostra
 * o motivo de ações negadas (`explain().reason`) em toast. Usado pelo BoardView.
 */
export function usePermissionSync(): void {
  useEffect(() => {
    const sync = () => {
      const app = useAppStore.getState();
      const board = useBoardStore.getState();
      const meta = app.boards.find((b) => b.id === board.boardId);
      board.setAccess(accessFor(app, meta));
    };
    sync();
    setPermissionDeniedHandler((reason) => notify(reason, 'danger'));
    const unsubApp = useAppStore.subscribe((s, prev) => {
      if (
        s.session !== prev.session ||
        s.boards !== prev.boards ||
        s.directory !== prev.directory ||
        s.teams !== prev.teams ||
        s.projects !== prev.projects ||
        s.workspace !== prev.workspace ||
        s.linkSession !== prev.linkSession
      ) {
        sync();
      }
    });
    const unsubBoard = useBoardStore.subscribe((s, prev) => {
      if (s.boardId !== prev.boardId) sync();
    });
    return () => {
      unsubApp();
      unsubBoard();
    };
  }, []);
}
