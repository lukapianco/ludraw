/**
 * LuDraw — valores padrão gravados nos dados locais (Chat 05.6 · Rodada B).
 *
 * "Você" (autor sem perfil) e "Meu espaço" (espaço padrão) foram gravados em boards, backups e no
 * Activity Log desde o Chat 01. Eles continuam sendo os valores **gravados** (mudar quebraria a
 * identidade de boards existentes e agruparia espaços em dobro), mas a tela mostra o rótulo no
 * idioma ativo. Nomes escolhidos pela pessoa nunca são traduzidos.
 */
import { t } from '../i18n';
import { DEFAULT_AUTHOR_NAME, DEFAULT_SPACE_NAME } from './storedDefaults';

// Chat 07: os valores moram em storedDefaults.ts (sem i18n, também usado pelo servidor).
export { DEFAULT_AUTHOR_NAME, DEFAULT_SPACE_NAME };

/** Rótulo de uma pessoa gravada nos dados: o "Você" padrão vira o termo do idioma ativo. */
export function personLabel(name: string | null | undefined): string {
  return !name || name === DEFAULT_AUTHOR_NAME ? t('common.you') : name;
}

/** Rótulo de um espaço gravado nos dados: o espaço padrão aparece traduzido. */
export function spaceLabel(space: string | null | undefined): string {
  return !space || space === DEFAULT_SPACE_NAME ? t('board.topBar.mySpace') : space;
}
