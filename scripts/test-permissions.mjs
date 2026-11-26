#!/usr/bin/env node
/**
 * LuDraw — testes da matriz de permissões (`src/utils/permissions.ts`), sem dependências.
 *
 * Roda o motor `can()`/`explain()` direto do TypeScript com o "type stripping" nativo do Node
 * (Node 22.6+): `npm run test:permissions`. Sai com código ≠ 0 se alguma regra falhar.
 * Chat 05: inclui as regras de exportação "negar por padrão" (allowDownload × allowViewerExport).
 */
import { can, explain, explainAccountChange, explainExtension, explainExtensionInstall, activeAdminCount, workspaceContext, DEFAULT_WORKSPACE_POLICIES, VIEW_AS_PROFILES } from '../src/utils/permissions.ts';

let passed = 0;
const failures = [];

function ctx(over = {}) {
  return { userId: 'u1', workspaceRole: 'member', boardRole: null, isBoardOwner: false, isFacilitator: false, ...over };
}
function expect(name, actual, expected) {
  if (actual === expected) passed++;
  else failures.push(`${name}: esperado ${expected}, veio ${actual}`);
}

// Perfis (papel efetivo no board)
const PROFILES = {
  admin: ctx({ workspaceRole: 'admin' }),
  owner: ctx({ isBoardOwner: true }),
  editor: ctx({ boardRole: 'editor' }),
  commenter: ctx({ boardRole: 'commenter' }),
  viewer: ctx({ boardRole: 'viewer' }),
  facilitatorEditor: ctx({ boardRole: 'editor', isFacilitator: true }),
  guestNoAcl: ctx({ workspaceRole: 'guest_b2b' }),
  guestEditor: ctx({ workspaceRole: 'guest_b2b', boardRole: 'editor' }),
  visitorViewer: ctx({ workspaceRole: 'visitor', shareAccessLevel: 'viewer' }),
  visitorCommenter: ctx({ workspaceRole: 'visitor', shareAccessLevel: 'commenter' }),
  visitorEditor: ctx({ workspaceRole: 'visitor', shareAccessLevel: 'editor' }),
  visitorNoLink: ctx({ workspaceRole: 'visitor' }),
};

// Matriz geral: ação → perfis que PODEM (os demais não podem)
const MATRIX = {
  'board.view': ['admin', 'owner', 'editor', 'commenter', 'viewer', 'facilitatorEditor', 'guestEditor', 'visitorViewer', 'visitorCommenter', 'visitorEditor'],
  'board.comment': ['admin', 'owner', 'editor', 'commenter', 'facilitatorEditor', 'guestEditor', 'visitorCommenter', 'visitorEditor'],
  'voting.cast': ['admin', 'owner', 'editor', 'commenter', 'facilitatorEditor', 'guestEditor', 'visitorCommenter', 'visitorEditor'],
  'board.edit': ['admin', 'owner', 'editor', 'facilitatorEditor', 'guestEditor', 'visitorEditor'],
  'element.lockStandard': ['admin', 'owner', 'editor', 'facilitatorEditor', 'guestEditor', 'visitorEditor'],
  'element.unlockStandard': ['admin', 'owner', 'editor', 'facilitatorEditor', 'guestEditor', 'visitorEditor'],
  'element.lockProtected': ['admin', 'owner', 'facilitatorEditor'],
  'element.unlockProtected': ['admin', 'owner', 'facilitatorEditor'],
  'privateMode.toggle': ['admin', 'owner', 'facilitatorEditor'],
  'privateMode.reveal': ['admin', 'owner', 'facilitatorEditor'],
  'voting.manage': ['admin', 'owner', 'facilitatorEditor'],
  'timer.manage': ['admin', 'owner', 'facilitatorEditor'],
  'followMe.lead': ['admin', 'owner', 'facilitatorEditor'],
  'frame.toggleHidden': ['admin', 'owner', 'facilitatorEditor'],
  'board.delete': ['admin', 'owner'],
  'board.move': ['admin', 'owner'],
  'board.restoreSnapshot': ['admin', 'owner'],
  'board.clearActivityLog': ['admin', 'owner'],
  'board.transferOwnership': ['admin'],
  'board.share': ['admin', 'owner', 'editor', 'facilitatorEditor'],
  // Chat 05: sem link/política, só quem edita exporta
  'board.export': ['admin', 'owner', 'editor', 'facilitatorEditor', 'guestEditor', 'visitorEditor'],
  // Chat 06: link público = poder compartilhar + política allowPublicLinks (padrão ligada)
  'board.publicLink': ['admin', 'owner', 'editor', 'facilitatorEditor'],
  // Chat 06: ações do Workspace (WORKSPACE_ADMIN_SPEC §4) — só pelo papel no workspace
  'workspace.admin.view': ['admin'],
  'workspace.members.manage': ['admin'],
  'workspace.teams.manage': ['admin'],
  'workspace.policies.manage': ['admin'],
  'workspace.audit.view': ['admin'],
  'workspace.trash.manage': ['admin'],
  'workspace.ownership.transfer': ['admin'],
  'workspace.templates.manage': ['admin'],
  'workspace.backup.manage': ['admin'],
  // membros internos (owner/editor/commenter/viewer/facilitatorEditor têm workspaceRole 'member')
  'workspace.members.invite': ['admin', 'owner', 'editor', 'commenter', 'viewer', 'facilitatorEditor'],
  'workspace.boards.create': ['admin', 'owner', 'editor', 'commenter', 'viewer', 'facilitatorEditor'],
  'workspace.templates.team': ['admin', 'owner', 'editor', 'commenter', 'viewer', 'facilitatorEditor'],
  'workspace.projects.create': ['admin', 'owner', 'editor', 'commenter', 'viewer', 'facilitatorEditor'],
  'workspace.guests.invite': ['admin', 'owner', 'editor', 'commenter', 'viewer', 'facilitatorEditor'],
  // política padrão do modo local: extensões liberadas — Chat 06.5: visitante nunca (ARCHITECTURE_MAP §5)
  'extensions.use': ['admin', 'owner', 'editor', 'commenter', 'viewer', 'facilitatorEditor', 'guestNoAcl', 'guestEditor'],
  // Chat 06.5: instalar/ativar = membros internos (convidado B2B e visitante não)
  'extensions.manage': ['admin', 'owner', 'editor', 'commenter', 'viewer', 'facilitatorEditor'],
  // Chat 06.5: Nível 2 / pasta dev só com allowExtensions 'all' (padrão local)
  'extensions.useScripts': ['admin', 'owner', 'editor', 'commenter', 'viewer', 'facilitatorEditor', 'guestNoAcl', 'guestEditor'],
};

for (const [action, allowed] of Object.entries(MATRIX)) {
  for (const [name, c] of Object.entries(PROFILES)) expect(`${action} · ${name}`, can(c, action), allowed.includes(name));
}

// Destravar protegido: quem travou (editor) pode; visitante/convidado nunca
expect('unlockProtected · editor que travou', can(ctx({ boardRole: 'editor', lockedBy: 'u1' }), 'element.unlockProtected'), true);
expect('unlockProtected · visitante editor que travou', can(ctx({ workspaceRole: 'visitor', shareAccessLevel: 'editor', lockedBy: 'u1' }), 'element.unlockProtected'), false);

// comment.delete: autor comentador pode; outro comentador não
expect('comment.delete · autor comentador', can(ctx({ boardRole: 'commenter', authorId: 'u1' }), 'comment.delete'), true);
expect('comment.delete · outro comentador', can(ctx({ boardRole: 'commenter', authorId: 'u2' }), 'comment.delete'), false);
expect('comment.delete · editor', can(ctx({ boardRole: 'editor', authorId: 'u2' }), 'comment.delete'), true);

/* ------------------------- Exportação: negar por padrão ------------------------- */
expect('padrão: allowViewerExport desligada', DEFAULT_WORKSPACE_POLICIES.allowViewerExport, false);
const policyOn = { allowViewerExport: true };
const policyOff = { allowViewerExport: false };
for (const level of ['viewer', 'commenter']) {
  const v = (over) => ctx({ workspaceRole: 'visitor', shareAccessLevel: level, ...over });
  expect(`export · visitante ${level} · link e política ausentes`, can(v({}), 'board.export'), false);
  // Chat 06 (decisão do usuário, 07/11/2026): a política é TETO — allowDownload=true não fura a política desligada
  expect(`export · visitante ${level} · allowDownload=true + política padrão (off) → teto`, can(v({ allowDownload: true }), 'board.export'), false);
  expect(`export · visitante ${level} · allowDownload=true + política off → teto`, can(v({ allowDownload: true, policies: policyOff }), 'board.export'), false);
  expect(`export · visitante ${level} · allowDownload=true + política on`, can(v({ allowDownload: true, policies: policyOn }), 'board.export'), true);
  expect(`export · visitante ${level} · teto · motivo`, explain(v({ allowDownload: true, policies: policyOff }), 'board.export').reason?.key, 'permissions.denied.exportVisitorPolicy');
  expect(`export · visitante ${level} · allowDownload=false + política on`, can(v({ allowDownload: false, policies: policyOn }), 'board.export'), false);
  expect(`export · visitante ${level} · link indefinido + política on`, can(v({ policies: policyOn }), 'board.export'), true);
  expect(`export · visitante ${level} · link indefinido + política off`, can(v({ policies: policyOff }), 'board.export'), false);
  // leitor/comentador interno (ACL): só a política conta; allowDownload do link não vale para ele
  const m = (over) => ctx({ boardRole: level, ...over });
  expect(`export · membro ${level} · padrão`, can(m({}), 'board.export'), false);
  expect(`export · membro ${level} · política on`, can(m({ policies: policyOn }), 'board.export'), true);
  expect(`export · membro ${level} · allowDownload=true ignorado`, can(m({ allowDownload: true }), 'board.export'), false);
}
// motivo sempre presente quando negado
const why = explain(ctx({ workspaceRole: 'visitor', shareAccessLevel: 'viewer' }), 'board.export');
// Chat 05.6: o motivo é chave + parâmetros (a UI traduz); conferimos a chave, não a frase
expect('export negado tem motivo (chave)', why.reason?.key, 'permissions.denied.exportVisitorPolicy');
const whyEdit = explain(ctx({ workspaceRole: 'visitor', shareAccessLevel: 'viewer' }), 'board.edit');
expect('edição negada · chave', whyEdit.reason?.key, 'permissions.denied.cannotEdit');
expect('edição negada · sujeito', whyEdit.reason?.params?.who?.key, 'permissions.who.visitorsWithRole');
expect('edição negada · papel', whyEdit.reason?.params?.who?.params?.role?.key, 'permissions.roles.board.viewer');
expect('sem acesso · chave', explain(ctx({ workspaceRole: 'guest_b2b' }), 'board.view').reason?.key, 'permissions.denied.noAccess');
expect('permitido não tem motivo', explain(PROFILES.admin, 'board.delete').reason, undefined);
expect('export · visitante editor sempre pode', can(ctx({ workspaceRole: 'visitor', shareAccessLevel: 'editor', allowDownload: false }), 'board.export'), true);
expect('export · sem acesso (visitante sem link)', can(ctx({ workspaceRole: 'visitor', allowDownload: true }), 'board.export'), false);
expect('export · link bloqueado · motivo', explain(ctx({ workspaceRole: 'visitor', shareAccessLevel: 'viewer', allowDownload: false, policies: policyOn }), 'board.export').reason?.key, 'permissions.denied.exportLinkBlocked');

/* ------------------------- Chat 06: políticas do Workspace ------------------------- */
const MEMBER_PROFILES = ['owner', 'editor', 'commenter', 'viewer', 'facilitatorEditor'];
const withPolicies = (name, policies) => ({ ...PROFILES[name], policies });
// projetos: membros só com allowMembersCreateTeams
for (const name of MEMBER_PROFILES) {
  expect(`projects.create · ${name} · política off`, can(withPolicies(name, { allowMembersCreateTeams: false }), 'workspace.projects.create'), false);
}
expect('projects.create · admin · política off', can(withPolicies('admin', { allowMembersCreateTeams: false }), 'workspace.projects.create'), true);
expect('projects.create · membro · política off · motivo', explain(withPolicies('editor', { allowMembersCreateTeams: false }), 'workspace.projects.create').reason?.key, 'permissions.denied.projectsPolicy');
// convidados B2B: allowGuests desligada vale para todos; allowMembersInviteGuests só para membros
for (const name of ['admin', ...MEMBER_PROFILES]) {
  expect(`guests.invite · ${name} · allowGuests off`, can(withPolicies(name, { allowGuests: false }), 'workspace.guests.invite'), false);
}
expect('guests.invite · allowGuests off · motivo', explain(withPolicies('admin', { allowGuests: false }), 'workspace.guests.invite').reason?.key, 'permissions.denied.guestsDisabled');
expect('guests.invite · admin · membros não convidam', can(withPolicies('admin', { allowMembersInviteGuests: false }), 'workspace.guests.invite'), true);
expect('guests.invite · membro · membros não convidam', can(withPolicies('editor', { allowMembersInviteGuests: false }), 'workspace.guests.invite'), false);
expect('guests.invite · membro · motivo', explain(withPolicies('editor', { allowMembersInviteGuests: false }), 'workspace.guests.invite').reason?.key, 'permissions.denied.guestInvitePolicy');
// link público: política allowPublicLinks desligada nega até o admin; sem poder compartilhar, o motivo é o do compartilhamento
for (const name of ['admin', 'owner', 'editor']) {
  expect(`publicLink · ${name} · links off`, can(withPolicies(name, { allowPublicLinks: false }), 'board.publicLink'), false);
}
expect('publicLink · links off · motivo', explain(withPolicies('admin', { allowPublicLinks: false }), 'board.publicLink').reason?.key, 'permissions.denied.publicLinksDisabled');
expect('publicLink · leitor · motivo = compartilhar', explain(PROFILES.viewer, 'board.publicLink').reason?.key, 'permissions.denied.share');
// extensões
for (const name of Object.keys(PROFILES)) {
  expect(`extensions.use · ${name} · política none`, can(withPolicies(name, { allowExtensions: 'none' }), 'extensions.use'), false);
}
expect('extensions.use · packs_only', can(withPolicies('editor', { allowExtensions: 'packs_only' }), 'extensions.use'), true);
/* ------------------------- Chat 06.5: extensões ------------------------- */
expect('extensions.use · visitante · motivo', explain(PROFILES.visitorViewer, 'extensions.use').reason?.key, 'permissions.denied.extensionsVisitor');
expect('extensions.manage · convidado · motivo', explain(PROFILES.guestEditor, 'extensions.manage').reason?.key, 'permissions.denied.extensionsManage');
expect('extensions.manage · política none · motivo', explain(withPolicies('admin', { allowExtensions: 'none' }), 'extensions.manage').reason?.key, 'permissions.denied.extensionsDisabled');
expect('extensions.useScripts · packs_only', can(withPolicies('admin', { allowExtensions: 'packs_only' }), 'extensions.useScripts'), false);
expect('extensions.useScripts · packs_only · motivo', explain(withPolicies('admin', { allowExtensions: 'packs_only' }), 'extensions.useScripts').reason?.key, 'permissions.denied.extensionsScriptsPolicy');
const pack = { id: 'dev.teste.formas', kind: 'pack' };
expect('explainExtension · pacote · padrão', explainExtension(PROFILES.editor, pack).allowed, true);
expect('explainExtension · pacote · packs_only', explainExtension(withPolicies('editor', { allowExtensions: 'packs_only' }), pack).allowed, true);
expect('explainExtension · script · packs_only', explainExtension(withPolicies('editor', { allowExtensions: 'packs_only' }), { ...pack, kind: 'script' }).reason?.key, 'permissions.denied.extensionsScriptsPolicy');
expect('explainExtension · pasta dev · packs_only', explainExtension(withPolicies('editor', { allowExtensions: 'packs_only' }), { ...pack, dev: true }).reason?.key, 'permissions.denied.extensionsDevPolicy');
expect('explainExtension · pasta dev · all', explainExtension(withPolicies('editor', { allowExtensions: 'all' }), { ...pack, dev: true }).allowed, true);
expect('explainExtension · fora da allowlist', explainExtension(withPolicies('admin', { extensionAllowlist: ['dev.outro.pacote'] }), pack).reason?.key, 'permissions.denied.extensionNotAllowlisted');
expect('explainExtension · na allowlist', explainExtension(withPolicies('admin', { extensionAllowlist: ['dev.teste.formas'] }), pack).allowed, true);
expect('explainExtension · allowlist vazia = todas', explainExtension(withPolicies('admin', { extensionAllowlist: [] }), pack).allowed, true);
expect('explainExtension · none', explainExtension(withPolicies('admin', { allowExtensions: 'none' }), pack).reason?.key, 'permissions.denied.extensionsDisabled');
expect('explainExtension · visitante', explainExtension(PROFILES.visitorEditor, pack).reason?.key, 'permissions.denied.extensionsVisitor');
expect('explainExtension · convidado usa (não instala)', explainExtension(PROFILES.guestEditor, pack).allowed, true);
expect('explainExtensionInstall · convidado', explainExtensionInstall(PROFILES.guestEditor, pack).reason?.key, 'permissions.denied.extensionsManage');
expect('explainExtensionInstall · membro', explainExtensionInstall(PROFILES.viewer, pack).allowed, true);
expect('explainExtensionInstall · membro · fora da allowlist', explainExtensionInstall(withPolicies('editor', { extensionAllowlist: ['x.y.z'] }), pack).allowed, false);
// motivos das ações de admin e de membros
expect('admin.view · membro · motivo', explain(PROFILES.editor, 'workspace.admin.view').reason?.key, 'permissions.denied.adminOnly');
expect('boards.create · convidado · motivo', explain(PROFILES.guestNoAcl, 'workspace.boards.create').reason?.key, 'permissions.denied.membersOnly');
expect('boards.create · visitante · motivo', explain(PROFILES.visitorEditor, 'workspace.boards.create').reason?.key, 'permissions.denied.membersOnly');
// workspaceContext monta um contexto sem papel de board
expect('workspaceContext · admin vê #/admin', can(workspaceContext({ userId: 'a', workspaceRole: 'admin' }), 'workspace.admin.view'), true);
expect('workspaceContext · membro não vê #/admin', can(workspaceContext({ userId: 'm', workspaceRole: 'member' }), 'workspace.admin.view'), false);

/* ------------------------- Chat 06: hierarquia (boardAccess) ------------------------- */
expect('boardAccess=false · membro editor não vê', can(ctx({ boardRole: 'editor', boardAccess: false }), 'board.view'), false);
expect('boardAccess=false · motivo', explain(ctx({ boardAccess: false }), 'board.view').reason?.key, 'permissions.denied.noAccess');
expect('boardAccess=false · admin não vê Espaço Pessoal alheio', can(ctx({ workspaceRole: 'admin', boardAccess: false }), 'board.view'), false);
expect('boardAccess=false · titular sempre vê', can(ctx({ isBoardOwner: true, boardAccess: false }), 'board.edit'), true);
expect('boardAccess ausente · membro edita (retrocompatível)', can(ctx({}), 'board.edit'), true);

/* ------------- Emenda v1.1 §11: conta isolada ("Continuar sem conta") ------------- */
const isolatedCtx = (over = {}) => ctx({ isolated: true, ...over });
expect('isolada · cria boards', can(isolatedCtx(), 'workspace.boards.create'), true);
expect('isolada · extensões seguem a política', can(isolatedCtx(), 'extensions.use'), true);
expect('isolada · instala extensões no próprio navegador', can(isolatedCtx(), 'extensions.manage'), true);
for (const a of ['workspace.admin.view', 'workspace.members.invite', 'workspace.guests.invite', 'workspace.projects.create', 'workspace.templates.team', 'workspace.teams.manage']) {
  expect(`isolada · ${a} negado`, can(isolatedCtx(), a), false);
}
expect('isolada · motivo', explain(isolatedCtx(), 'workspace.members.invite').reason?.key, 'permissions.denied.isolatedOffline');
expect('isolada · mesmo como admin gravado não administra', can(isolatedCtx({ workspaceRole: 'admin' }), 'workspace.admin.view'), false);
expect('isolada · edita o próprio board', can(isolatedCtx({ isBoardOwner: true }), 'board.edit'), true);
expect('isolada · não compartilha o próprio board', can(isolatedCtx({ isBoardOwner: true }), 'board.share'), false);
expect('isolada · não cria link público', can(isolatedCtx({ isBoardOwner: true }), 'board.publicLink'), false);
expect('workspaceContext leva a conta isolada', can(workspaceContext({ userId: 'g', workspaceRole: 'member', isolated: true }), 'workspace.members.invite'), false);
expect('workspaceContext isolada · motivo', explain(workspaceContext({ userId: 'g', workspaceRole: 'admin', isolated: true }), 'workspace.admin.view').reason?.key, 'permissions.denied.isolatedOffline');
expect('isolada · board alheio sem acesso', can(isolatedCtx({ boardAccess: false }), 'board.view'), false);

/* ------------------------- Chat 06: proteção do último administrador ------------------------- */
const accounts = [
  { id: 'a1', workspaceRole: 'admin', status: 'active' },
  { id: 'm1', workspaceRole: 'member', status: 'active' },
  { id: 'a2', workspaceRole: 'admin', status: 'suspended' },
];
const adminCtx = workspaceContext({ userId: 'a1', workspaceRole: 'admin' });
expect('admins ativos (suspensos não contam)', activeAdminCount(accounts), 1);
expect('último admin · rebaixar', explainAccountChange(adminCtx, accounts, 'a1', 'role', 'member').reason?.key, 'permissions.denied.lastAdmin');
expect('último admin · manter admin', explainAccountChange(adminCtx, accounts, 'a1', 'role', 'admin').allowed, true);
expect('último admin · suspender a si mesmo', explainAccountChange(adminCtx, accounts, 'a1', 'suspend').reason?.key, 'permissions.denied.selfAccount');
const otherAdminCtx = workspaceContext({ userId: 'x', workspaceRole: 'admin' });
expect('último admin · suspender (por outra sessão)', explainAccountChange(otherAdminCtx, accounts, 'a1', 'suspend').reason?.key, 'permissions.denied.lastAdmin');
expect('último admin · remover', explainAccountChange(otherAdminCtx, accounts, 'a1', 'remove').reason?.key, 'permissions.denied.lastAdmin');
expect('membro · pode rebaixar/suspender', explainAccountChange(adminCtx, accounts, 'm1', 'suspend').allowed, true);
expect('admin suspenso · pode remover (não é ativo)', explainAccountChange(adminCtx, accounts, 'a2', 'remove').allowed, true);
const twoAdmins = [...accounts, { id: 'a3', workspaceRole: 'admin', status: 'active' }];
expect('dois admins · rebaixar um', explainAccountChange(adminCtx, twoAdmins, 'a3', 'role', 'member').allowed, true);
expect('dois admins · rebaixar a si mesmo', explainAccountChange(adminCtx, twoAdmins, 'a1', 'role', 'member').allowed, true);
expect('membro não gerencia contas', explainAccountChange(workspaceContext({ userId: 'm1', workspaceRole: 'member' }), twoAdmins, 'a3', 'suspend').reason?.key, 'permissions.denied.adminOnly');
expect('conta inexistente', explainAccountChange(adminCtx, accounts, 'zz', 'suspend').reason?.key, 'permissions.denied.accountNotFound');

/* ---- Chat 08.5 · B: link de convite geral e fila de pedidos usam workspace.members.manage (só administração) ----
 * As operações em si (createInviteLink, revokeInviteLink, approveAccessRequest, rejectAccessRequest) são testadas no
 * servidor (`server/test/workspace-0805.test.ts`): este script roda sem empacotador e não importa as regras. */
const ACCESS_POLICIES = { ...DEFAULT_WORKSPACE_POLICIES, allowAccessRequests: true };
const accessProfiles = {
  admin: { userId: 'a', workspaceRole: 'admin' },
  member: { userId: 'm', workspaceRole: 'member' },
  guest: { userId: 'g', workspaceRole: 'guest_b2b' },
  visitor: { userId: 'v', workspaceRole: 'visitor' },
  isolatedAdmin: { userId: 'i', workspaceRole: 'admin', isolated: true },
};
for (const [name, viewer] of Object.entries(accessProfiles)) {
  const allowed = name === 'admin';
  expect(`08.5 · ${name} · gerencia links e pedidos (members.manage)`, can(workspaceContext(viewer, ACCESS_POLICIES), 'workspace.members.manage'), allowed);
  expect(`08.5 · ${name} · política de pedidos ligada não muda nada`, can(workspaceContext(viewer, DEFAULT_WORKSPACE_POLICIES), 'workspace.members.manage'), allowed);
}
expect('08.5 · membro convida (members.invite), mas isso não abre links gerais nem a fila', can(workspaceContext(accessProfiles.member, ACCESS_POLICIES), 'workspace.members.invite') && !can(workspaceContext(accessProfiles.member, ACCESS_POLICIES), 'workspace.members.manage'), true);
expect('08.5 · motivo para membro', explain(workspaceContext(accessProfiles.member, ACCESS_POLICIES), 'workspace.members.manage').reason?.key, 'permissions.denied.adminOnly');
// "Visualizar como…": o admin passa a ser avaliado com o PAPEL do perfil simulado
for (const opt of VIEW_AS_PROFILES) {
  expect(`08.5 · admin vendo como "${opt.id}" não gerencia links nem pedidos`, can(workspaceContext({ userId: 'a', workspaceRole: opt.profile.workspaceRole }, ACCESS_POLICIES), 'workspace.members.manage'), opt.profile.workspaceRole === 'admin');
}
expect('08.5 · convidados desligados não afetam a administração da fila', can(workspaceContext(accessProfiles.admin, { ...ACCESS_POLICIES, allowGuests: false }), 'workspace.members.manage'), true);

/* ---- Chat 08.5 · B2: painel de e-mail (GET/PUT /admin/mail/settings e o botão de teste) usa workspace.policies.manage ----
 * Recusas por modo (multi_org só leitura), chave, host interno e campo travado são do servidor: `server/test/mail-settings.test.ts`. */
for (const [name, viewer] of Object.entries(accessProfiles)) {
  expect(`08.5 · B2 · ${name} · configura o e-mail (policies.manage)`, can(workspaceContext(viewer, DEFAULT_WORKSPACE_POLICIES), 'workspace.policies.manage'), name === 'admin');
}
expect('08.5 · B2 · motivo para membro (e-mail)', explain(workspaceContext(accessProfiles.member, DEFAULT_WORKSPACE_POLICIES), 'workspace.policies.manage').reason?.key, 'permissions.denied.adminOnly');
for (const opt of VIEW_AS_PROFILES) {
  expect(`08.5 · B2 · admin vendo como "${opt.id}" não configura o e-mail`, can(workspaceContext({ userId: 'a', workspaceRole: opt.profile.workspaceRole }, DEFAULT_WORKSPACE_POLICIES), 'workspace.policies.manage'), opt.profile.workspaceRole === 'admin');
}

/* ---- Chat 08.5 · C: ligar/desligar o cadastro com o e-mail da organização é política (workspace.policies.manage) ----
 * As recusas do servidor (sem e-mail, sem domínio, multi_org) e o cadastro em si: `server/test/domain-signup.test.ts`. */
for (const [name, viewer] of Object.entries(accessProfiles)) {
  expect(`08.5 · C · ${name} · liga o cadastro pelo domínio (policies.manage)`, can(workspaceContext(viewer, { ...DEFAULT_WORKSPACE_POLICIES, allowDomainSignup: true }), 'workspace.policies.manage'), name === 'admin');
}
expect('08.5 · C · a política ligada não dá a ninguém poder de convidar admin', can(workspaceContext(accessProfiles.member, { ...DEFAULT_WORKSPACE_POLICIES, allowDomainSignup: true }), 'workspace.members.manage'), false);

console.log(`Permissões: ${passed} regras ok, ${failures.length} falha(s).`);
if (failures.length) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
