/**
 * LuDraw — Chat 07: limites de tamanho de um board enviado ao servidor (puro, sem DOM).
 *
 * O servidor recusa o excesso com chave traduzível (nunca trava nem guarda o lixo); o cliente pode usar a
 * mesma função antes de enviar. Os números são generosos para uso real (um board com milhares de
 * objetos e imagens comprimidas pelo próprio app cabe com folga).
 */
import type { MessageDescriptor } from '../i18n/types';

export const BOARD_LIMITS = {
  /** Corpo máximo do PUT do conteúdo (bytes) */
  bodyBytes: 40 * 1024 * 1024,
  /** Objetos por board */
  elements: 20_000,
  /** Caracteres de qualquer campo de texto */
  textChars: 100_000,
  /** Caracteres de uma imagem embutida (data URL) */
  imageChars: 12 * 1024 * 1024,
  /** Comandos de caminho SVG por campo (`customPath`, `customDecoration`) */
  pathCommands: 20_000,
  /** Pontos de um traço livre ou de uma linha */
  points: 50_000,
  /** Entradas do Activity Log dentro do board */
  activityEntries: 1_000,
  /**
   * Chat 08.7 · R2 (S-03): linhas da tabela `board_activity` por board no servidor (histórico do Activity Log além das
   * 200 que vão no documento). A manutenção horária apaga as mais antigas acima disto. Não vale para o Audit Log da
   * organização (`workspace_audit`), que tem retenção própria.
   */
  activityRows: 5_000,
  /** Profundidade máxima de aninhamento do JSON de um objeto */
  depth: 16,
} as const;

const PATH_FIELDS = new Set(['customPath', 'customDecoration']);
const POINT_FIELDS = new Set(['points', 'waypoints']);

const MB = (chars: number) => Math.round(chars / (1024 * 1024));

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Percorre um objeto do board conferindo textos, caminhos, pontos e profundidade. */
function checkValue(value: unknown, key: string, elementType: string, depth: number): MessageDescriptor | null {
  if (depth > BOARD_LIMITS.depth) return { key: 'server.errors.invalidBoard' };
  if (typeof value === 'string') {
    // Chat 08.2: o elemento de imagem guarda o conteúdo em `dataUrl` (o `src` é legado). Antes só `src` era conferido
    // aqui, e uma imagem real (> 100 mil caracteres) era recusada como "texto longo demais".
    if (elementType === 'image' && (key === 'dataUrl' || key === 'src')) {
      if (value.length > BOARD_LIMITS.imageChars) return { key: 'server.errors.imageTooLarge', params: { mb: MB(BOARD_LIMITS.imageChars) } };
      return null;
    }
    if (value.length > BOARD_LIMITS.textChars) return { key: 'server.errors.textTooLong', params: { max: BOARD_LIMITS.textChars } };
    if (PATH_FIELDS.has(key)) {
      const commands = value.match(/[MLHVCSQTAZ]/gi)?.length ?? 0;
      if (commands > BOARD_LIMITS.pathCommands) return { key: 'server.errors.pathTooComplex', params: { max: BOARD_LIMITS.pathCommands } };
    }
    return null;
  }
  if (Array.isArray(value)) {
    if (POINT_FIELDS.has(key) && value.length > BOARD_LIMITS.points) return { key: 'server.errors.pathTooComplex', params: { max: BOARD_LIMITS.points } };
    if (value.length > BOARD_LIMITS.points) return { key: 'server.errors.invalidBoard' };
    for (const item of value) {
      const r = checkValue(item, key, elementType, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (isRecord(value)) {
    for (const [k, v] of Object.entries(value)) {
      const r = checkValue(v, k, elementType, depth + 1);
      if (r) return r;
    }
  }
  return null;
}

/**
 * Confere a forma básica e os limites de um `BoardData` vindo de fora. `null` = aceito.
 * (A validação de permissão — quem pode mudar o quê — é do servidor, em `writeGuard`.)
 */
export function checkBoardData(data: unknown): MessageDescriptor | null {
  if (!isRecord(data) || data.version !== 1 || !isRecord(data.elements) || !Array.isArray(data.elementOrder)) return { key: 'server.errors.invalidBoard' };
  const ids = Object.keys(data.elements);
  if (ids.length > BOARD_LIMITS.elements || data.elementOrder.length > BOARD_LIMITS.elements) return { key: 'server.errors.tooManyElements', params: { max: BOARD_LIMITS.elements } };
  if (!data.elementOrder.every((id) => typeof id === 'string' && id.length <= 200)) return { key: 'server.errors.invalidBoard' };
  for (const id of ids) {
    const el = data.elements[id];
    if (!isRecord(el) || el.id !== id || typeof el.type !== 'string' || id.length > 200) return { key: 'server.errors.invalidBoard' };
    const r = checkValue(el, '', el.type, 0);
    if (r) return r;
  }
  if (data.activityLog !== undefined) {
    if (!Array.isArray(data.activityLog)) return { key: 'server.errors.invalidBoard' };
    if (data.activityLog.length > BOARD_LIMITS.activityEntries) return { key: 'server.errors.invalidBoard' };
    for (const e of data.activityLog) {
      const r = checkValue(e, '', 'activity', 0);
      if (r) return r;
    }
  }
  for (const k of ['boardTags', 'facilitation', 'facilitatorIds', 'gridSettings', 'initialView'] as const) {
    if (data[k] !== undefined && data[k] !== null) {
      const r = checkValue(data[k], k, 'board', 0);
      if (r) return r;
    }
  }
  if (data.backgroundColor !== undefined && data.backgroundColor !== null && (typeof data.backgroundColor !== 'string' || data.backgroundColor.length > 100)) return { key: 'server.errors.invalidBoard' };
  return null;
}
