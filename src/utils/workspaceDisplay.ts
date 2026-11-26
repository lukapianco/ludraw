/**
 * LuDraw — Chat 06: textos de exibição do Workspace (sem React).
 *  - nomes de pessoas resolvidos NA HORA a partir do diretório (o Audit Log guarda só ids);
 *    conta anonimizada → "Usuário removido"; autor automático → "Sistema";
 *  - rótulo do lugar (Espaço Pessoal, Geral, Time › Projeto);
 *  - frase de uma entrada do Audit Log no idioma ativo.
 */
import type { BoardMeta, UserAccount, WorkspaceAuditAction, WorkspaceAuditEntry, WorkspaceRole } from '../types/workspace';
import type { StoredMessage } from '../i18n/types';
import { t, translateStored, translatedRecord } from '../i18n';
import { personLabel } from './storedNames';
import { LOCAL_WORKSPACE_ID, membershipOf, placeOf, type Place } from './workspace';
import { WORKSPACE_ROLE_LABEL_KEYS } from './permissions';

export const SYSTEM_ACTOR = 'system';

/** Nome de uma pessoa do diretório (conta removida → "Usuário removido"; id desconhecido → "Pessoa desconhecida"). */
export function displayName(userId: string | null | undefined, directory: readonly UserAccount[], fallback?: string): string {
  if (!userId) return t('workspace.people.unknown');
  if (userId === SYSTEM_ACTOR) return t('workspace.people.system');
  const acc = directory.find((a) => a.id === userId);
  const m = membershipOf(acc, LOCAL_WORKSPACE_ID);
  if (acc?.anonymizedAt || m?.anonymizedAt || m?.status === 'removed') return t('admin.audit.removedUser');
  if (acc) return personLabel(acc.name);
  return fallback ? personLabel(fallback) : t('workspace.people.unknown');
}

export function roleLabel(role: WorkspaceRole): string {
  return t(WORKSPACE_ROLE_LABEL_KEYS[role]);
}

export interface PlaceContext {
  teams: readonly { id: string; name: string }[];
  projects: readonly { id: string; name: string }[];
  workspace: { name: string };
}

/** Nome do lugar no idioma ativo (nomes de time/projeto/organização são conteúdo do usuário). */
export function placeLabel(place: Place, ctx: PlaceContext): string {
  switch (place.kind) {
    case 'personal':
      return t('workspace.places.personal');
    case 'shared':
      return t('workspace.places.shared');
    case 'workspace':
      return t('workspace.places.general', { org: ctx.workspace.name });
    case 'team': {
      const team = ctx.teams.find((x) => x.id === place.teamId)?.name ?? t('workspace.places.unknownTeam');
      const project = place.projectId ? ctx.projects.find((p) => p.id === place.projectId)?.name : undefined;
      return project ? t('workspace.places.teamProject', { team, project }) : team;
    }
    default:
      return '';
  }
}

export function boardPlaceLabel(meta: BoardMeta, ctx: PlaceContext): string {
  return placeLabel(placeOf(meta), ctx);
}

/** Rótulo curto de cada ação do Audit Log (filtro da tela de auditoria). */
export const AUDIT_ACTION_LABELS: Record<WorkspaceAuditAction, string> = translatedRecord({
  login: 'admin.audit.actions.login',
  login_failed: 'admin.audit.actions.loginFailed',
  login_locked: 'admin.audit.actions.loginLocked',
  member_invited: 'admin.audit.actions.memberInvited',
  member_joined: 'admin.audit.actions.memberJoined',
  member_suspended: 'admin.audit.actions.memberSuspended',
  member_removed: 'admin.audit.actions.memberRemoved',
  role_changed: 'admin.audit.actions.roleChanged',
  guest_invited: 'admin.audit.actions.guestInvited',
  guest_revoked: 'admin.audit.actions.guestRevoked',
  public_link_created: 'admin.audit.actions.publicLinkCreated',
  public_link_revoked: 'admin.audit.actions.publicLinkRevoked',
  board_created: 'admin.audit.actions.boardCreated',
  board_moved: 'admin.audit.actions.boardMoved',
  board_deleted: 'admin.audit.actions.boardDeleted',
  board_restored: 'admin.audit.actions.boardRestored',
  ownership_transferred: 'admin.audit.actions.ownershipTransferred',
  snapshot_restored: 'admin.audit.actions.snapshotRestored',
  export_large: 'admin.audit.actions.exportLarge',
  policy_changed: 'admin.audit.actions.policyChanged',
  team_created: 'admin.audit.actions.teamCreated',
  team_updated: 'admin.audit.actions.teamUpdated',
  team_archived: 'admin.audit.actions.teamArchived',
  project_created: 'admin.audit.actions.projectCreated',
  project_updated: 'admin.audit.actions.projectUpdated',
  project_archived: 'admin.audit.actions.projectArchived',
  member_reactivated: 'admin.audit.actions.memberReactivated',
  member_anonymized: 'admin.audit.actions.memberAnonymized',
  invitation_revoked: 'admin.audit.actions.invitationRevoked',
  board_access_changed: 'admin.audit.actions.boardAccessChanged',
  board_purged: 'admin.audit.actions.boardPurged',
  trash_emptied: 'admin.audit.actions.trashEmptied',
  template_saved: 'admin.audit.actions.templateSaved',
  workspace_updated: 'admin.audit.actions.workspaceUpdated',
  setup_completed: 'admin.audit.actions.setupCompleted',
  admin_created_via_cli: 'admin.audit.actions.adminCreatedViaCli',
  sessions_revoked: 'admin.audit.actions.sessionsRevoked',
  private_notes_revealed: 'admin.audit.actions.privateNotesRevealed',
  voting_revealed: 'admin.audit.actions.votingRevealed',
  collab_write_denied: 'admin.audit.actions.collabWriteDenied',
  board_imported: 'admin.audit.actions.boardImported',
  registration_blocked: 'admin.audit.actions.registrationBlocked',
  workspace_backup_exported: 'admin.audit.actions.backupExported',
  workspace_backup_restored: 'admin.audit.actions.backupRestored',
  extension_installed: 'admin.audit.actions.extensionInstalled',
  extension_updated: 'admin.audit.actions.extensionUpdated',
  extension_removed: 'admin.audit.actions.extensionRemoved',
  extension_enabled: 'admin.audit.actions.extensionEnabled',
  extension_disabled: 'admin.audit.actions.extensionDisabled',
  extensions_safe_mode: 'admin.audit.actions.extensionsSafeMode',
  extension_permissions_changed: 'admin.audit.actions.extensionPermissionsChanged',
  password_changed: 'admin.audit.actions.passwordChanged',
  password_reset_via_cli: 'admin.audit.actions.passwordResetViaCli',
  setup_token_issued: 'admin.audit.actions.setupTokenIssued',
  password_reset_email: 'admin.audit.actions.passwordResetEmail',
  mail_test_sent: 'admin.audit.actions.mailTestSent',
  mail_settings_updated: 'admin.audit.actions.mailSettingsUpdated',
  invitation_emailed: 'admin.audit.actions.invitationEmailed',
  invite_link_created: 'admin.audit.actions.inviteLinkCreated',
  invite_link_revoked: 'admin.audit.actions.inviteLinkRevoked',
  invite_link_used: 'admin.audit.actions.inviteLinkUsed',
  access_request_approved: 'admin.audit.actions.accessRequestApproved',
  access_request_rejected: 'admin.audit.actions.accessRequestRejected',
  domain_signup: 'admin.audit.actions.domainSignup',
});

/**
 * Frase de uma entrada do Audit Log. `{actor}` e `{target}` vêm de `actorId`/`targetId`; parâmetros
 * terminados em `User` (ex.: `fromUser`, `memberUser`) guardam ids e também viram nomes aqui.
 * Entradas antigas sem `message` mostram o `summary` legado.
 */
export function auditText(entry: WorkspaceAuditEntry, directory: readonly UserAccount[]): string {
  const actor = displayName(entry.actorId, directory, entry.actorName);
  if (!entry.message) return entry.summary ?? AUDIT_ACTION_LABELS[entry.action] ?? entry.action;
  const params: StoredMessage['params'] = { ...(entry.message.params ?? {}) };
  for (const [k, v] of Object.entries(params)) if (k.endsWith('User') && typeof v === 'string') params[k] = displayName(v, directory);
  const target = entry.targetType === 'user' ? displayName(entry.targetId, directory) : (entry.targetName ?? '');
  return translateStored({ key: entry.message.key, params }, { actor, target });
}
