/**
 * LuDraw server — Chat 08.7 · R1 (S-01): as DUAS funções que montam o contexto de permissão de um board
 * precisam decidir igual.
 *
 * `boardPermissionContext` (rotas REST, tempo real) e `boardContextFor` (ops do `workspace/ops`, Mesa) já
 * divergiram: a segunda não conferia se a pessoa ALCANÇA o board (`canSeeBoard`) e dava a um membro de outro
 * time o papel padrão de editor — compartilhar, criar link e convidar em board alheio (auditoria 08.7, S-01).
 * Este teste cruza viewers × boards × todas as ações de board e falha se as duas derem decisões diferentes.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { explain, type PermissionAction } from '../../src/utils/permissions';
import { boardContextFor, boardPermissionContext, type Viewer, type WorkspaceView } from '../../src/utils/workspace';
import type { BoardMeta, ProjectFolder, TeamEntity, UserAccount } from '../../src/types/workspace';
import { DEFAULT_WORKSPACE_POLICIES } from '../../src/utils/permissions';

const NOW = Date.UTC(2026, 10, 15, 12);
const DAY = 24 * 60 * 60 * 1000;

/**
 * Todas as ações decididas DENTRO de um board (as `workspace.*`/`extensions.*` não dependem do board).
 * O tipo obriga a listar toda ação nova: se `PermissionAction` ganhar uma ação de board, o typecheck falha aqui.
 */
const BOARD_ACTIONS: Record<Exclude<PermissionAction, `workspace.${string}` | `extensions.${string}`>, true> = {
  'board.view': true,
  'board.comment': true,
  'board.edit': true,
  'board.delete': true,
  'board.move': true,
  'board.share': true,
  'board.transferOwnership': true,
  'board.restoreSnapshot': true,
  'board.export': true,
  'board.clearActivityLog': true,
  'board.publicLink': true,
  'element.lockStandard': true,
  'element.unlockStandard': true,
  'element.lockProtected': true,
  'element.unlockProtected': true,
  'privateMode.toggle': true,
  'privateMode.reveal': true,
  'voting.manage': true,
  'voting.cast': true,
  'timer.manage': true,
  'followMe.lead': true,
  'frame.toggleHidden': true,
  'comment.delete': true,
};
const ACTIONS = Object.keys(BOARD_ACTIONS) as PermissionAction[];

const team = (id: string, memberIds: string[], archived = false): TeamEntity => ({ id, workspaceId: 'ws', name: id, color: '#194B32', memberIds, createdAt: 1, archivedAt: archived ? 1 : null });
const project = (id: string, teamId: string, invitedGuestIds: string[] = []): ProjectFolder => ({ id, workspaceId: 'ws', teamId, name: id, invitedGuestIds, createdAt: 1 });
const account = (id: string, workspaceRole: UserAccount['workspaceRole'], status: UserAccount['status'] = 'active', extra: Partial<UserAccount> = {}): UserAccount =>
  ({ id, name: id, email: `${id}@example.com`, workspaceRole, status, ...extra }) as UserAccount;

const teams = [team('tX', ['mX', 'mX2', 'susp']), team('tY', ['mY']), team('tArq', ['mX'], true)];
const projects = [project('pX', 'tX', ['gProj']), project('pY', 'tY')];
const directory = [
  account('admin', 'admin'),
  account('mX', 'member'),
  account('mX2', 'member'),
  account('mY', 'member'),
  account('mAcl', 'member'),
  account('gAcl', 'guest_b2b'),
  account('gNone', 'guest_b2b'),
  account('gProj', 'guest_b2b'),
  account('gOld', 'guest_b2b', 'active', { guestExpiresAt: NOW - DAY }),
  account('susp', 'member', 'suspended'),
  account('gone', 'member', 'removed'),
];

const policySets: Record<string, WorkspaceView['policies']> = {
  padrao: DEFAULT_WORKSPACE_POLICIES,
  restritiva: { ...DEFAULT_WORKSPACE_POLICIES, allowGuests: false, allowMembersInviteGuests: false, allowPublicLinks: false, allowViewerExport: true },
};

const viewer = (userId: string, workspaceRole: Viewer['workspaceRole'], teamIds: string[], status: Viewer['status'] = 'active', extra: Partial<Viewer> = {}): Viewer => ({ userId, workspaceRole, teamIds, status, ...extra });
const VIEWERS: Viewer[] = [
  viewer('admin', 'admin', []),
  viewer('mX', 'member', ['tX', 'tArq']),
  viewer('mX2', 'member', ['tX']),
  viewer('mY', 'member', ['tY']),
  viewer('mAcl', 'member', []),
  viewer('gAcl', 'guest_b2b', []),
  viewer('gNone', 'guest_b2b', []),
  viewer('gProj', 'guest_b2b', []),
  viewer('gOld', 'guest_b2b', [], 'active', { guestExpiresAt: NOW - DAY }),
  viewer('susp', 'member', ['tX'], 'suspended'),
  viewer('iso', 'member', [], 'active', { isolated: true }),
];

const meta = (id: string, ownerId: string, over: Partial<BoardMeta> = {}): BoardMeta =>
  ({ id, name: id, createdAt: 1, updatedAt: 1, lastOpenedAt: 1, favorite: false, ownerName: ownerId, ownerId, team: '', space: '', color: '#fff', template: 'blank', ...over }) as BoardMeta;
const BOARDS: BoardMeta[] = [
  meta('timeX', 'mX', { teamId: 'tX' }),
  meta('timeXcomAcl', 'mX', { teamId: 'tX', members: [{ boardId: 'timeXcomAcl', userId: 'mAcl', role: 'commenter', invitedBy: 'mX', invitedAt: 1 }, { boardId: 'timeXcomAcl', userId: 'gAcl', role: 'editor', invitedBy: 'mX', invitedAt: 1 }] }),
  meta('aclVencida', 'mX', { teamId: 'tX', members: [{ boardId: 'aclVencida', userId: 'mAcl', role: 'editor', invitedBy: 'mX', invitedAt: 1, expiresAt: NOW - DAY }] }),
  meta('projetoX', 'mX', { teamId: 'tX', projectId: 'pX' }),
  meta('timeY', 'mY', { teamId: 'tY' }),
  meta('timeArquivado', 'mX', { teamId: 'tArq' }),
  meta('geral', 'admin'),
  meta('pessoalX', 'mX', { isPersonalSpace: true }),
  meta('pessoalXcompartilhado', 'mX', { isPersonalSpace: true, members: [{ boardId: 'pessoalXcompartilhado', userId: 'mY', role: 'viewer', invitedBy: 'mX', invitedAt: 1 }] }),
  meta('pessoalOrfao', 'gone', { isPersonalSpace: true }),
  meta('pessoalSemConta', 'ninguem', { isPersonalSpace: true }),
  meta('lixeiraX', 'mX', { teamId: 'tX', deletedAt: NOW - DAY, deletedBy: 'mX' }),
  meta('lixeiraPessoal', 'mX', { isPersonalSpace: true, deletedAt: NOW - DAY, deletedBy: 'mX' }),
  meta('convidadoNoBoard', 'mX', { teamId: 'tX', invitedGuestIds: ['gNone'] }),
];

test('boardContextFor decide igual ao boardPermissionContext para toda pessoa × board × ação de board', () => {
  const diffs: string[] = [];
  let checked = 0;
  for (const [policyName, policies] of Object.entries(policySets)) {
    const ws: WorkspaceView = { teams, projects, policies, directory };
    for (const v of VIEWERS) {
      for (const m of BOARDS) {
        const a = boardContextFor(v, m, ws, NOW);
        const b = boardPermissionContext(v, m, ws, undefined, NOW);
        for (const action of ACTIONS) {
          const da = explain(a, action);
          const db = explain(b, action);
          checked++;
          if (da.allowed !== db.allowed || da.reason?.key !== db.reason?.key) {
            diffs.push(`${policyName} · ${v.userId} × ${m.id} × ${action}: boardContextFor=${da.allowed}/${da.reason?.key ?? '-'} · boardPermissionContext=${db.allowed}/${db.reason?.key ?? '-'}`);
          }
        }
      }
    }
  }
  assert.ok(checked > 1000, `poucas combinações conferidas (${checked})`);
  assert.deepEqual(diffs.slice(0, 40), [], `${diffs.length} divergência(s) entre as duas funções de contexto`);
});

test('controle: membro de outro time, Espaço Pessoal alheio e lixeira ficam sem papel nas duas funções', () => {
  const ws: WorkspaceView = { teams, projects, policies: DEFAULT_WORKSPACE_POLICIES, directory };
  const mY = VIEWERS.find((v) => v.userId === 'mY')!;
  const admin = VIEWERS.find((v) => v.userId === 'admin')!;
  const mX = VIEWERS.find((v) => v.userId === 'mX')!;
  const byId = (id: string) => BOARDS.find((b) => b.id === id)!;
  for (const fn of [(v: Viewer, m: BoardMeta) => boardContextFor(v, m, ws, NOW), (v: Viewer, m: BoardMeta) => boardPermissionContext(v, m, ws, undefined, NOW)]) {
    assert.equal(explain(fn(mY, byId('timeX')), 'board.share').allowed, false, 'membro do time Y não compartilha board do time X');
    assert.equal(explain(fn(mY, byId('pessoalX')), 'board.view').allowed, false, 'membro Y não vê o Espaço Pessoal de X');
    assert.equal(explain(fn(admin, byId('pessoalX')), 'board.share').allowed, false, 'admin não compartilha Espaço Pessoal de quem tem conta ativa');
    assert.equal(explain(fn(admin, byId('pessoalOrfao')), 'board.share').allowed, true, 'admin alcança Espaço Pessoal órfão');
    assert.equal(explain(fn(mX, byId('pessoalX')), 'board.share').allowed, true, 'o dono compartilha o próprio board');
    assert.equal(explain(fn(mX, byId('lixeiraX')), 'board.delete').allowed, true, 'o dono continua decidindo sobre o board na lixeira');
    assert.equal(explain(fn(mY, byId('pessoalXcompartilhado')), 'board.view').allowed, true, 'board compartilhado pela ACL continua ao alcance');
  }
});
