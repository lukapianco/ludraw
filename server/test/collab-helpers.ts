/**
 * LuDraw server — clientes WebSocket de teste do tempo real (Chat 08).
 * Usa o MESMO provider do navegador (`@hocuspocus/provider`) contra um servidor ouvindo numa porta de verdade.
 */
import type { AddressInfo } from 'node:net';
import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import WebSocket from 'ws';
import * as Y from 'yjs';
import { bindYjs } from '../../src/collab/codec';
import { boardDocName, encodeCredential, encodeMessage, type ClientMessage, type CollabCredential, type ServerMessage } from '../../src/collab/protocol';
import type { TestServer } from './helpers';

bindYjs(Y);

/** `ws` lança um evento de erro se o cliente é destruído ainda conectando (o navegador não); nos testes isso é ruído. */
class QuietWebSocket extends WebSocket {
  constructor(url: string | URL, protocols?: string | string[]) {
    super(url, protocols);
    this.on("error", () => undefined);
  }
}

export async function listen(server: TestServer): Promise<string> {
  await server.app.listen({ port: 0, host: '127.0.0.1' });
  const addr = server.app.server.address() as AddressInfo;
  return `ws://127.0.0.1:${addr.port}/api/v1/collab`;
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Espera `check()` ficar verdadeiro (ou falha com `what`). */
export async function until(check: () => boolean | Promise<boolean>, what: string, ms = 5000): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await sleep(25);
  }
  throw new Error(`timeout: ${what}`);
}

export interface TestClient {
  doc: Y.Doc;
  provider: HocuspocusProvider;
  socket: HocuspocusProviderWebsocket;
  messages: ServerMessage[];
  closes: { code?: number; reason?: string }[];
  authFailed: string | null;
  synced: boolean;
  send(msg: ClientMessage): void;
  last<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }> | undefined;
  destroy(): void;
}

export function connectClient(url: string, boardId: string, cred: CollabCredential, opts: { name?: string; doc?: Y.Doc } = {}): TestClient {
  const doc = opts.doc ?? new Y.Doc();
  const socket = new HocuspocusProviderWebsocket({ url, WebSocketPolyfill: QuietWebSocket as never, maxAttempts: 1, minDelay: 10, delay: 50 });
  const client: TestClient = {
    doc,
    socket,
    provider: undefined as never,
    messages: [],
    closes: [],
    authFailed: null,
    synced: false,
    send: (msg) => client.provider.sendStateless(encodeMessage(msg)),
    last: (t) => [...client.messages].reverse().find((m) => m.t === t) as never,
    destroy: () => {
      client.provider.destroy();
      socket.destroy();
    },
  };
  const provider = new HocuspocusProvider({
    websocketProvider: socket,
    name: opts.name ?? boardDocName(boardId),
    document: doc,
    token: encodeCredential(cred),
    onStateless: ({ payload }) => {
      try {
        client.messages.push(JSON.parse(payload) as ServerMessage);
      } catch {
        /* ignorar */
      }
    },
    onSynced: () => {
      client.synced = true;
    },
    onAuthenticationFailed: ({ reason }) => {
      client.authFailed = reason;
    },
    onClose: ({ event }) => {
      client.closes.push({ code: event?.code, reason: event?.reason });
    },
  });
  client.provider = provider;
  provider.attach();
  return client;
}
