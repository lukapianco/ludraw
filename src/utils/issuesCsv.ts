/**
 * LuDraw — CSV estruturado de issues (Chat 05).
 *
 * Transforma post-its e cards de Kanban em linhas de tickets/issues com as colunas
 * `Summary, Description, Issue Type, Priority, Assignee, Labels, Epic/Frame, Author, Votes, Created At`
 * (+ opcionais `Status, Story Points, Due Date`). Os nomes de coluna seguem a documentação PÚBLICA
 * de importação por CSV dos rastreadores de issues mais comuns — o arquivo é importado pelo
 * assistente de CSV do próprio serviço; o LuDraw não chama nenhuma API de terceiros.
 *
 * Regras: conteúdo oculto por frame e notas privadas de outras pessoas NÃO saem; votos só saem
 * quando a contagem pode ser vista (votação revelada ou não anônima); todo valor passa pela
 * proteção contra fórmulas de `utils/csv.ts`.
 */

import type { CanvasElement, FrameElement, KanbanElement, StickyNoteElement, VotingState } from '../types/canvas';
import { toCsv } from './csv';
import { isHiddenByFrame } from './frames';
import { isPrivateDraftHidden } from './permissions';
import { kanbanVoteKey, totalsVisible } from './voting';
import { t } from '../i18n';

export const ISSUE_COLUMNS = ['Summary', 'Description', 'Issue Type', 'Priority', 'Assignee', 'Labels', 'Epic/Frame', 'Author', 'Votes', 'Created At'] as const;
export const ISSUE_EXTRA_COLUMNS = ['Status', 'Story Points', 'Due Date'] as const;

export type IssueType = 'Task' | 'Story' | 'Bug';

export interface IssueExportOptions {
  /** Tipo dos post-its (e dos cards sem story points) */
  defaultType: IssueType;
  /** Inclui Status (coluna do Kanban), Story Points e Due Date */
  extraColumns: boolean;
  viewerId: string;
  simulateParticipant: boolean;
  voting?: VotingState;
}

export interface IssueTable {
  header: string[];
  rows: string[][];
  stickies: number;
  cards: number;
  /** Notas privadas de outras pessoas que ficaram de fora */
  skippedPrivate: number;
}

const SUMMARY_MAX = 250;
const PRIORITY: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low' };

/** Etiquetas não podem ter espaço na maioria dos rastreadores: "Meta Q3" → "Meta-Q3". */
export function labelToken(label: string): string {
  return label.trim().replace(/\s+/g, '-').replace(/,/g, '');
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** `AAAA-MM-DD HH:mm` no fuso local (formato que os assistentes de CSV aceitam configurar). */
export function formatIssueDate(ts: number | undefined): string {
  if (!ts || !Number.isFinite(ts)) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function splitSummary(text: string): { summary: string; description: string } {
  const clean = text.replace(/\r\n?/g, '\n').trim();
  const lines = clean.split('\n');
  const first = lines.find((l) => l.trim())?.trim() ?? '';
  const cut = first.length > SUMMARY_MAX ? `${first.slice(0, SUMMARY_MAX - 1).trimEnd()}…` : first;
  const needsDescription = lines.length > 1 || first.length > SUMMARY_MAX;
  return { summary: cut, description: needsDescription ? clean : '' };
}

function frameTitle(el: CanvasElement, all: Record<string, CanvasElement>): string {
  const parent = el.parentId ? all[el.parentId] : undefined;
  return parent?.type === 'frame' ? (parent as FrameElement).title || t('common.untitledFrame') : '';
}

/** Monta a tabela de issues a partir dos elementos (na ordem dada). */
export function buildIssueTable(elements: CanvasElement[], all: Record<string, CanvasElement>, options: IssueExportOptions): IssueTable {
  const lookup = (id: string) => all[id];
  const votes = totalsVisible(options.voting) && options.voting?.kind !== 'poll' ? options.voting?.votesByElement ?? {} : null;
  const header: string[] = [...ISSUE_COLUMNS, ...(options.extraColumns ? ISSUE_EXTRA_COLUMNS : [])];
  const rows: string[][] = [];
  let stickies = 0;
  let cards = 0;
  let skippedPrivate = 0;
  const seenKanban = new Set<string>();

  for (const el of elements) {
    if (isHiddenByFrame(el, lookup)) continue;
    if (el.type === 'sticky') {
      const note = el as StickyNoteElement;
      if (isPrivateDraftHidden(note, options.viewerId, options.simulateParticipant)) {
        skippedPrivate++;
        continue;
      }
      if (!note.text.trim()) continue;
      const { summary, description } = splitSummary(note.text);
      const row = [
        summary,
        description,
        options.defaultType,
        '',
        '',
        (note.tags ?? []).map((t) => labelToken(t.label)).filter(Boolean).join(' '),
        frameTitle(note, all),
        note.authorName ?? note.createdByName ?? '',
        votes ? String(votes[note.id] ?? 0) : '',
        formatIssueDate(note.createdAt),
      ];
      if (options.extraColumns) row.push('', '', '');
      rows.push(row);
      stickies++;
    } else if (el.type === 'kanban' && !seenKanban.has(el.id)) {
      seenKanban.add(el.id);
      const k = el as KanbanElement;
      const epic = frameTitle(k, all) || k.title || 'Kanban';
      for (const col of k.columns) {
        for (const card of col.cards) {
          const title = card.title.trim() || t('importexport.issuesCsv.untitledCard');
          const row = [
            title.length > SUMMARY_MAX ? `${title.slice(0, SUMMARY_MAX - 1)}…` : title,
            (card.description ?? '').trim(),
            card.storyPoints !== undefined && card.storyPoints !== null && options.defaultType !== 'Bug' ? 'Story' : options.defaultType,
            card.priority ? PRIORITY[card.priority] ?? '' : '',
            card.assignee ?? '',
            (card.tags ?? []).map(labelToken).filter(Boolean).join(' '),
            epic,
            k.createdByName ?? '',
            votes ? String(votes[kanbanVoteKey(k.id, card.id)] ?? 0) : '',
            formatIssueDate(k.createdAt),
          ];
          if (options.extraColumns) row.push(col.title, card.storyPoints !== undefined ? String(card.storyPoints) : '', card.dueDate ?? '');
          rows.push(row);
          cards++;
        }
      }
    }
  }
  return { header, rows, stickies, cards, skippedPrivate };
}

/** CSV final: vírgula, UTF-8 sem BOM (os assistentes de importação leem o cabeçalho exato), CRLF. */
export function issueTableToCsv(table: IssueTable): string {
  return toCsv([table.header, ...table.rows], { delimiter: ',', bom: false });
}
