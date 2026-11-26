/**
 * Chat 08.5: leitura pura do endereço dos links recebidos por e-mail (`src/utils/tokenRoutes.ts`, usado por `tokenLink.ts`). O cliente
 * tira o token da URL antes de qualquer requisição; aqui só se confere QUEM conta como link com token.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { splitTokenHash } from '../../src/utils/tokenRoutes';

const TOKEN = 'AbC_dEf-123456789012345678901234567890123';

test('splitTokenHash: reconhece #/reset/<token> e #/verify/<token>, e nada além', () => {
  assert.deepEqual(splitTokenHash(`#/reset/${TOKEN}`), { route: 'reset', token: TOKEN });
  assert.deepEqual(splitTokenHash(`#/verify/${TOKEN}`), { route: 'verify', token: TOKEN });
  assert.deepEqual(splitTokenHash(`#reset/${TOKEN}`), { route: 'reset', token: TOKEN }, 'sem a barra inicial');
  assert.deepEqual(splitTokenHash(`#/reset/${TOKEN}?x=1`), { route: 'reset', token: TOKEN }, 'parâmetros ignorados');
  assert.equal(splitTokenHash('#/reset'), null, 'tela sem token (já capturado ou recarregada)');
  assert.equal(splitTokenHash('#/reset/curto'), null, 'formato diferente do que o servidor emite');
  assert.equal(splitTokenHash(`#/reset/${TOKEN}/mais`), null);
  assert.equal(splitTokenHash(`#/invite/${TOKEN}`), null, 'convite segue o fluxo do Chat 06/07');
  // Chat 08.5 · B
  assert.deepEqual(splitTokenHash(`#/join/${TOKEN}`), { route: 'join', token: TOKEN });
  assert.deepEqual(splitTokenHash(`#/signup/${TOKEN}`), { route: 'signup', token: TOKEN });
  assert.deepEqual(splitTokenHash(`#/access/${TOKEN}`), { route: 'access', token: TOKEN });
  assert.equal(splitTokenHash('#/request-access'), null, 'pedir acesso não tem token');
  assert.equal(splitTokenHash(`#/board/${TOKEN}`), null);
  assert.equal(splitTokenHash('#/reset/%E0%A4%A'), null, 'escape inválido não quebra');
  assert.equal(splitTokenHash(`#/reset/${TOKEN}<script>`), null);
  assert.equal(splitTokenHash(''), null);
});

test('Chat 08.7 · R4 (S-33): convite e link público do board também saem do endereço', async () => {
  const m = await import('../../src/utils/tokenRoutes');
  assert.equal(typeof m.splitInviteHash, 'function', 'splitInviteHash existe');
  assert.equal(typeof m.splitShareHash, 'function', 'splitShareHash existe');
  const { splitInviteHash, splitShareHash } = m;
  assert.equal(splitInviteHash(`#/invite/${TOKEN}`), TOKEN);
  assert.equal(splitInviteHash('#/invite/Convite-Da-Equipe'), 'Convite-Da-Equipe', 'token escolhido pela administração (≥ 8)');
  assert.equal(splitInviteHash('#/invite'), null, 'já capturado');
  assert.equal(splitInviteHash('#/invite/curto'), null);
  assert.equal(splitInviteHash(`#/invite/${TOKEN}/x`), null);
  assert.equal(splitInviteHash(`#/invite/${TOKEN}<b>`), null);
  assert.equal(splitInviteHash(`#/reset/${TOKEN}`), null);
  const share = splitShareHash(`#/board/b-1?share=${TOKEN}`);
  assert.deepEqual(share, { boardId: 'b-1', token: TOKEN, hash: '#/board/b-1?shared=1' });
  const keep = splitShareHash(`#/board/b%202?view=fit&share=${TOKEN}&cam=1,2,3`);
  assert.equal(keep?.boardId, 'b 2');
  assert.equal(keep?.hash.includes(TOKEN), false, 'o token não volta no endereço novo');
  assert.equal(keep?.hash, '#/board/b%202?view=fit&cam=1%2C2%2C3&shared=1', 'os outros parâmetros ficam');
  assert.equal(splitShareHash('#/board/b-1?shared=1'), null, 'já capturado');
  assert.equal(splitShareHash('#/board/b-1'), null);
  assert.equal(splitShareHash('#/board/b-1?share=curto'), null);
  assert.equal(splitShareHash(`#/settings?share=${TOKEN}`), null);
  // a rota nunca devolve o token ao endereço
  const { routeToHash } = await import('../../src/utils/router');
  assert.equal(routeToHash({ name: 'board', id: 'b-1', share: TOKEN }).includes(TOKEN), false);
  assert.equal(routeToHash({ name: 'invite', token: TOKEN }), '#/invite');
});

test('Chat 08.7 · R4 — compatibilidade: links antigos `?share=<token>` e convites `#/invite/<token>` continuam abrindo', async () => {
  // aba simulada (sessionStorage) — o mesmo caminho do navegador: captura → endereço limpo → rota com o token
  const store = new Map<string, string>();
  const tab = {
    get length() { return store.size; },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  };
  (globalThis as { sessionStorage?: unknown }).sessionStorage = tab;
  try {
    const { splitShareHash, splitInviteHash } = await import('../../src/utils/tokenRoutes');
    const { rememberShareToken, rememberInviteToken, clearShareTokens } = await import('../../src/utils/tabTokens');
    const { parseHash } = await import('../../src/utils/router');
    // 1) link público antigo, copiado antes da R4: `#/board/<id>?share=<token>` (com outros parâmetros)
    const old = `#/board/b-9?view=fit&share=${TOKEN}`;
    const cap = splitShareHash(old)!;
    rememberShareToken(cap.boardId, cap.token); // o que `captureTokenFromHash` faz no main.tsx
    assert.deepEqual(parseHash(cap.hash), { name: 'board', id: 'b-9', focus: undefined, embed: false, view: 'fit', cam: undefined, share: TOKEN }, 'endereço limpo + token da aba = a mesma rota de antes');
    // 2) sem sessionStorage (captura não aconteceu): o formato antigo ainda vira a rota com o token
    store.clear();
    assert.equal((parseHash(old) as { share?: string }).share, TOKEN);
    // 3) convite antigo `#/invite/<token>` (e-mail ou link copiado): direto ou depois da captura
    clearShareTokens();
    assert.deepEqual(parseHash(`#/invite/${TOKEN}`), { name: 'invite', token: TOKEN });
    clearShareTokens();
    const inv = splitInviteHash(`#/invite/${TOKEN}`)!;
    rememberInviteToken(inv);
    assert.deepEqual(parseHash('#/invite'), { name: 'invite', token: TOKEN }, 'recarregar `#/invite` na mesma aba mantém o convite');
    // 4) convite com token escolhido pela administração (formato antigo, curto) também abre
    clearShareTokens();
    assert.deepEqual(parseHash('#/invite/Equipe2026'), { name: 'invite', token: 'Equipe2026' });
  } finally {
    delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
  }
});
