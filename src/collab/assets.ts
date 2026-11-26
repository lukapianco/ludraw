/**
 * LuDraw — imagens do Modo Servidor no navegador (Chat 08.2 · A-2).
 *
 *  - Envio: data URL (o que o app já produz ao inserir/colar) → bytes → `POST /boards/:id/assets` → `asset:<sha256>`.
 *  - Exibição: a referência vira blob URL com fetch AUTENTICADO (membro ou visitante daquele board), com cache.
 *  - Export/arquivos baixados: a referência volta a ser data URL (o arquivo funciona fora do servidor).
 * No Modo Local nada disto é usado (as imagens continuam em data URL).
 */
import type { BoardData, CanvasElement } from '../types/canvas';
import { api } from '../utils/api';
import { assetHashOf, assetRef, isAssetRef } from '../utils/assetRefs';

const blobUrls = new Map<string, Promise<string>>();
const dataUrls = new Map<string, Promise<string>>();
const blobs = new Map<string, Promise<Blob>>();

function blobOf(hash: string, boardId: string): Promise<Blob> {
  let p = blobs.get(hash);
  if (!p) {
    if (!api) return Promise.reject(new Error('od:no-server'));
    p = api.assetBlob(hash, boardId);
    blobs.set(hash, p);
    // falhou (sem rede, sem acesso): tenta de novo na próxima vez
    p.catch(() => blobs.delete(hash));
  }
  return p;
}

/** URL para `<img src>` na tela (blob URL, sem pôr os bytes no DOM como texto). */
export function assetBlobUrl(ref: string, boardId: string): Promise<string> {
  const hash = assetHashOf(ref);
  if (!hash) return Promise.reject(new Error('od:invalid-asset-ref'));
  let p = blobUrls.get(hash);
  if (!p) {
    p = blobOf(hash, boardId).then((b) => URL.createObjectURL(b));
    blobUrls.set(hash, p);
    p.catch(() => blobUrls.delete(hash));
  }
  return p;
}

const toDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/** Data URL (export SVG/PNG/PDF e arquivos baixados funcionam sem o servidor). */
export function assetDataUrl(ref: string, boardId: string): Promise<string> {
  const hash = assetHashOf(ref);
  if (!hash) return Promise.reject(new Error('od:invalid-asset-ref'));
  let p = dataUrls.get(hash);
  if (!p) {
    p = blobOf(hash, boardId).then(toDataUrl);
    dataUrls.set(hash, p);
    p.catch(() => dataUrls.delete(hash));
  }
  return p;
}

/** Envia uma imagem embutida; devolve a referência. Erro do servidor (tipo, tamanho, disco) sobe como `ApiError`. */
export async function uploadDataUrl(boardId: string, dataUrl: string): Promise<string> {
  if (!api) throw new Error('od:no-server');
  const blob = await (await fetch(dataUrl)).blob();
  const { hash } = await api.uploadAsset(boardId, blob);
  // já temos os bytes: a tela e o export não precisam baixá-los de volta
  if (!blobs.has(hash)) blobs.set(hash, Promise.resolve(blob));
  if (!dataUrls.has(hash)) dataUrls.set(hash, Promise.resolve(dataUrl));
  return assetRef(hash);
}

/** Prova de acesso: vincula ao board imagens vindas de outro board. Devolve as que NÃO puderam ser usadas. */
export async function linkAssetRefs(boardId: string, hashes: string[]): Promise<string[]> {
  if (!api || !hashes.length) return [];
  const r = await api.linkAssets(boardId, hashes);
  return r.missing;
}

/** Os elementos com as imagens de volta em data URL (backup, JSON baixado). O que não carregar fica como referência. */
export async function inlineAssetImages<T extends Pick<BoardData, 'elements'>>(data: T, boardId: string): Promise<T> {
  let elements: Record<string, CanvasElement> | null = null;
  for (const [id, el] of Object.entries(data.elements)) {
    const src = el.type === 'image' ? (el as unknown as { dataUrl?: string }).dataUrl : undefined;
    if (!isAssetRef(src)) continue;
    try {
      const url = await assetDataUrl(src, boardId);
      elements ??= { ...data.elements };
      elements[id] = { ...el, dataUrl: url } as CanvasElement;
    } catch {
      /* fica a referência (sem rede ou sem acesso) */
    }
  }
  return elements ? { ...data, elements } : data;
}
