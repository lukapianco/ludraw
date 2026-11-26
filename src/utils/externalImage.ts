/**
 * LuDraw — "Baixar para o board" (Chat 08.7 · R4 · achado S-30).
 *
 * O board não guarda mais imagem por endereço externo (o servidor recusa: cada pessoa que abrisse o board acessaria o
 * site da imagem). Quando alguém cola o endereço de uma imagem, o app oferece BAIXAR a imagem uma vez, nesta máquina,
 * e inseri-la pelo caminho normal de arquivos (compressão; no Modo Servidor, envio como `asset:`).
 *
 *  - Só `https:`/`http:` com cara de imagem (extensão conhecida no caminho).
 *  - Requisição sem cookies (`credentials: 'omit'`), sem `Referer` e com CORS: se o site não permitir, falha com
 *    mensagem clara ("salve a imagem e arraste o arquivo").
 *  - Limite de 12 MB (o mesmo teto de arquivo de imagem) e conferência dos primeiros bytes (não confia no
 *    `Content-Type`): PNG, JPEG, GIF, WebP, AVIF, BMP ou SVG.
 */
import type { MessageDescriptor } from '../i18n/types';

export const EXTERNAL_IMAGE_MAX_BYTES = 12 * 1024 * 1024;

const IMAGE_PATH_RE = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i;

/** Texto colado que é (só) o endereço de uma imagem; senão `null`. */
export function imageUrlFromText(text: string): string | null {
  const t = text.trim();
  if (!t || t.length > 2048 || /\s/.test(t)) return null;
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password) return null;
  return IMAGE_PATH_RE.test(u.pathname) ? u.href : null;
}

export { sniffImageType } from './imageSniff';
import { sniffImageType } from './imageSniff';

export type ExternalImageResult = { ok: true; file: File } | { ok: false; reason: MessageDescriptor };

/** Baixa a imagem (uma vez, sem cookies nem `Referer`) e devolve um `File` pronto para `insertImageFiles`. */
export async function downloadExternalImage(url: string, fetchImpl: typeof fetch = fetch): Promise<ExternalImageResult> {
  const failed: ExternalImageResult = { ok: false, reason: { key: 'importexport.safety.urlImageFailed' } };
  const tooLarge: ExternalImageResult = { ok: false, reason: { key: 'importexport.safety.urlImageTooLarge', params: { size: EXTERNAL_IMAGE_MAX_BYTES / 1024 / 1024 } } };
  let res: Response;
  try {
    res = await fetchImpl(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'follow' });
  } catch {
    return failed;
  }
  if (!res.ok) return failed;
  const declared = Number(res.headers.get('content-length') ?? '0');
  if (declared > EXTERNAL_IMAGE_MAX_BYTES) return tooLarge;
  let buf: ArrayBuffer;
  try {
    buf = await res.arrayBuffer();
  } catch {
    return failed;
  }
  if (buf.byteLength > EXTERNAL_IMAGE_MAX_BYTES) return tooLarge;
  const type = sniffImageType(new Uint8Array(buf));
  if (!type) return failed;
  let name = 'imagem';
  try {
    name = decodeURIComponent(new URL(url).pathname.split('/').pop() || name).slice(0, 120);
  } catch {
    /* nome com escape inválido: fica o padrão */
  }
  return { ok: true, file: new File([new Uint8Array(buf)], name, { type }) };
}
