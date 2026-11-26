/**
 * LuDraw — Persistência dos boards (Chat 01 → Chat 06 · Rodada B).
 * Até o Chat 05 era `localStorage["ludraw:board:<id>"]` com API síncrona. Desde o Chat 06 · B tudo
 * passa pelo `boardRepository` (IndexedDB com migração automática e fallback para localStorage) —
 * estas funções são atalhos ASSÍNCRONOS com os mesmos nomes, para quem já as usava.
 */
import type { BoardData } from '../types/canvas';
import { boardRepository } from './boardRepository';

export function loadBoardData(id: string): Promise<BoardData | null> {
  return boardRepository.loadBoard(id);
}

/** Devolve false se o armazenamento recusou (espaço cheio). */
export function saveBoardData(id: string, data: BoardData): Promise<boolean> {
  return boardRepository.trySaveBoard(id, data);
}

export function deleteBoardData(id: string): void {
  void boardRepository.deleteBoard(id);
}
