/**
 * Chat 08.2 · A-1 (5): trazer boards do Modo Local deste navegador para o servidor.
 * Regras puras (`src/utils/localImport.ts`, as mesmas da tela) + rota `POST /boards` com `importFrom`:
 * autoria passa para quem importa, nada de estado local (atividade, votação, facilitadores), limites conferidos ANTES
 * (um board acima do limite mostra o motivo e não impede os outros), destino só onde `can()`/`canUsePlace` deixam,
 * duplicata recusada POR PESSOA, Audit Log sempre (inclusive no Espaço pessoal).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { and, eq } from 'drizzle-orm';
import type { BoardData } from '../../src/types/canvas';
import { importedCopyOf, localBoardsFromPersisted, localImportProblem, prepareLocalImport } from '../../src/utils/localImport';
import { boards, workspaceAudit } from '../src/db/schema';
import { api, emptyBoard, invitePerson, json, startConfigured, sticky, type Person } from './helpers';

const localBoard = (extra: Record<string, unknown> = {}): BoardData =>
  ({
    ...emptyBoard({
      n1: sticky('n1', 'minha nota', { createdBy: 'local-ana', lockedBy: 'local-ana', locked: true, lockMode: 'protected', reactedBy: { '👍': ['local-ana', 'local-bia'] }, reactions: { '👍': 2 }, votedBy: ['x'] }),
      n2: sticky('n2', 'rascunho', { createdBy: 'local-bia', isPrivateDraft: true }),
      c1: { id: 'c1', type: 'comment', x: 0, y: 0, width: 0, height: 0, rotation: 0, zIndex: 1, createdAt: 1, updatedAt: 1, resolved: true, resolvedBy: 'local-bia', messages: [{ id: 'm', author: 'Bia', text: 'oi', createdAt: 1, authorId: 'local-bia' }] },
    }),
    activityLog: [{ id: 'a1', timestamp: 1, actorId: 'local-ana', actorName: 'Ana', actorRole: 'admin', action: 'created', targetType: 'element' }],
    facilitatorIds: ['local-ana'],
    facilitation: { privateMode: { enabled: true, previewOwnNotes: false, startedBy: 'local-ana' }, timer: { running: true, durationMs: 1000, remainingMs: 1000, endsAt: 5 }, leaderUserId: 'local-ana' },
    ...extra,
  }) as unknown as BoardData;

test('(5) regras puras: autoria passa para quem importa; atividade, facilitadores e facilitação zerados; limites conferidos antes', () => {
  const out = prepareLocalImport(localBoard(), { id: 'srv-ana' });
  const n1 = out.elements.n1 as unknown as Record<string, unknown>;
  assert.equal(n1.createdBy, 'srv-ana');
  assert.equal(n1.lockedBy, 'srv-ana', 'bloqueio protegido continua destravável por quem importou');
  assert.deepEqual(n1.reactedBy, { '👍': ['srv-ana'] });
  assert.equal(n1.votedBy, undefined);
  assert.equal(n1.text, 'minha nota', 'o conteúdo não muda');
  const n2 = out.elements.n2 as unknown as Record<string, unknown>;
  assert.equal(n2.createdBy, 'srv-ana');
  assert.equal(n2.isPrivateDraft, false, 'sem Modo Privado no servidor a nota ficaria escondida para sempre');
  const c1 = out.elements.c1 as unknown as { messages: { authorId: string; author: string }[]; resolvedBy: string };
  assert.equal(c1.messages[0].authorId, 'srv-ana');
  assert.equal(c1.messages[0].author, 'Bia', 'o nome exibido fica');
  assert.equal(c1.resolvedBy, 'srv-ana');
  assert.deepEqual(out.activityLog, []);
  assert.deepEqual(out.facilitatorIds, []);
  assert.deepEqual(out.facilitation, { privateMode: { enabled: false, previewOwnNotes: false } });
  assert.equal(localImportProblem(localBoard(), { id: 'srv-ana' }), null);
  // acima do limite: motivo traduzível, sem enviar
  const huge = localBoard({ elements: { t: sticky('t', 'a'.repeat(100_001)) } as never, elementOrder: ['t'] });
  assert.equal(localImportProblem(huge, { id: 'srv-ana' })?.key, 'server.errors.textTooLong');
  assert.equal(localImportProblem(null, { id: 'srv-ana' })?.key, 'server.import.unreadable');
  // lista do Modo Local: sem lixeira e sem board de link público
  const persisted = JSON.stringify({ state: { boards: [{ id: 'b1', name: 'Um', updatedAt: 2 }, { id: 'b2', name: 'Lixo', updatedAt: 3, deletedAt: 5 }, { id: 'b3', name: 'Link', updatedAt: 4, transient: true }, { id: 'b4', name: 'Dois', updatedAt: 9 }] }, version: 3 });
  assert.deepEqual(localBoardsFromPersisted(persisted).map((b) => b.id), ['b4', 'b1']);
  assert.deepEqual(localBoardsFromPersisted('não é json'), []);
});

test('(5) rota: importar, recusar duplicata da mesma pessoa, aceitar de outra pessoa, destino sem permissão, limites e Audit Log', async () => {
  const { server, admin } = await startConfigured();
  try {
    const ana: Person = { token: admin.accessToken, id: admin.user.id };
    const edi = await invitePerson(server.app, ana, { email: 'edi@example.com', name: 'Edi Tor' });
    const team = json(await api(server.app, ana).op({ type: 'createTeam', input: { name: 'Diretoria' } })).id as string;
    const send = (who: Person, sourceId: string, place: unknown, data: unknown = prepareLocalImport(localBoard(), { id: who.id })) =>
      api(server.app, who).post('/boards', { name: `Local ${sourceId}`, place, data, importFrom: { kind: 'local', sourceId } });

    // Espaço pessoal
    const first = await send(ana, 'loc-1', { kind: 'personal' });
    assert.equal(first.statusCode, 200, first.body);
    const boardId = json(first).board.id as string;
    assert.equal(json(first).board.importedFrom.by, ana.id);
    assert.equal(json(first).board.importedFrom.sourceId, 'loc-1');
    // a mesma pessoa, o mesmo board local → recusa (não duplica)
    const again = await send(ana, 'loc-1', { kind: 'workspace' });
    assert.equal(again.statusCode, 409);
    assert.equal(json(again).error.message.key, 'server.errors.alreadyImported');
    // outra pessoa (outro navegador com um board de mesmo id) pode trazer o dela
    assert.equal((await send(edi, 'loc-1', { kind: 'personal' })).statusCode, 200);
    // destino que a pessoa não pode usar (time do qual não faz parte)
    const denied = await send(edi, 'loc-2', { kind: 'team', teamId: team });
    assert.equal(denied.statusCode, 403);
    assert.equal(json(denied).error.message.key, 'workspace.errors.placeNotAllowed');
    // acima dos limites: o servidor também confere (um board recusado não afeta os outros)
    const big = await send(ana, 'loc-3', { kind: 'personal' }, emptyBoard({ t: sticky('t', 'a'.repeat(100_001)) }));
    assert.equal(big.statusCode, 422);
    assert.equal(json(big).error.message.key, 'server.errors.textTooLong');
    assert.equal((await send(ana, 'loc-4', { kind: 'team', teamId: team })).statusCode, 200, 'o próximo da lista continua entrando');

    // estado: quem importou enxerga a origem (a tela usa para marcar "Já está no servidor")
    const state = json(await api(server.app, ana).get('/workspace/state'));
    assert.ok(importedCopyOf(state.boards, ana.id, 'loc-1'));
    assert.equal(importedCopyOf(state.boards, ana.id, 'loc-3'), undefined);
    // conteúdo gravado como preparado (autoria de quem importou)
    const [row] = await server.ctx.db.select().from(boards).where(eq(boards.id, boardId));
    assert.equal((row.data as unknown as BoardData).elements.n1 && ((row.data as unknown as BoardData).elements.n1 as unknown as { createdBy: string }).createdBy, ana.id);
    // Audit Log: sempre, inclusive no Espaço pessoal
    const audit = await server.ctx.db.select().from(workspaceAudit).where(and(eq(workspaceAudit.action, 'board_imported'), eq(workspaceAudit.targetId, boardId)));
    assert.equal(audit.length, 1);
    assert.equal(audit[0].actorId, ana.id);
    assert.equal(audit[0].message?.key, 'workspace.audit.msg.boardImported');
    // transferir a propriedade não colide com a regra "por pessoa" (vale para quem trouxe)
    const moved = await api(server.app, ana).op({ type: 'transferBoardOwnership', fromId: ana.id, toId: edi.id, boardIds: [boardId] });
    assert.equal(moved.statusCode, 200, moved.body);
    const [after] = await server.ctx.db.select().from(boards).where(eq(boards.id, boardId));
    assert.equal(after.ownerId, edi.id);
    assert.equal(after.importedFrom?.by, ana.id, 'a origem continua sendo de quem trouxe');
  } finally {
    await server.close();
  }
});
