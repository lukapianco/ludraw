import { CircleSlash, Grip, Hash, Magnet } from 'lucide-react';
import type { MenuItem } from '../components/ui/Menu';
import {  useBoardStore } from '../store/useBoardStore';

import { currentBoardMeta } from '../utils/boardActions';

import { t } from '../i18n';
import { useT } from '../i18n/useT';

const I = 17;

/** Opções de cor de fundo do board (null = padrão do tema). */
export const BOARD_BACKGROUNDS: { label: string; value: string | null }[] = [
  { get label() { return t('menus.boardMenu.themeDefault'); }, value: null },
  { get label() { return t('menus.boardMenu.white'); }, value: '#FFFFFF' },
  { get label() { return t('menus.boardMenu.paper'); }, value: '#F6F3EC' },
  { get label() { return t('menus.boardMenu.sage'); }, value: '#EEF4E4' },
  { get label() { return t('menus.boardMenu.pistachio'); }, value: '#E2EDCB' },
  { get label() { return t('menus.boardMenu.fog'); }, value: '#E9EFF6' },
  { get label() { return t('menus.boardMenu.lightPink'); }, value: '#FBEFF3' },
  { get label() { return t('menus.boardMenu.sand'); }, value: '#F3EBDD' },
  { get label() { return t('menus.boardMenu.graphite'); }, value: '#26262C' },
  { get label() { return t('menus.boardMenu.forest'); }, value: '#12301F' },
  { get label() { return t('menus.boardMenu.night'); }, value: '#151B26' },
  { get label() { return t('menus.boardMenu.charcoal'); }, value: '#101012' },
];

/** Itens do submenu "Grade" (imagem 14): estilo + ajustar à grade. Reutilizado no menu de contexto. */
export function useGridMenuItems(): MenuItem[] {
  const t = useT();
  const grid = useBoardStore((s) => s.gridSettings);
  const b = useBoardStore.getState;
  return [
    { kind: 'radio', id: 'none', label: t('common.none'), icon: <CircleSlash size={I} />, checked: !grid.enabled, onSelect: () => b().setGridSettings({ enabled: false }) },
    { kind: 'radio', id: 'lines', label: t('menus.boardMenu.lineGrid'), icon: <Hash size={I} />, checked: grid.enabled && grid.style === 'lines', onSelect: () => b().setGridSettings({ enabled: true, style: 'lines' }) },
    { kind: 'radio', id: 'dots', label: t('menus.boardMenu.dotGrid'), icon: <Grip size={I} />, checked: grid.enabled && grid.style === 'dots', onSelect: () => b().setGridSettings({ enabled: true, style: 'dots' }) },
    { kind: 'separator', id: 'g1' },
    { kind: 'toggle', id: 'snap', label: t('menus.boardMenu.snapGrid'), icon: <Magnet size={I} />, checked: grid.snapToGrid, onToggle: () => b().setGridSettings({ snapToGrid: !grid.snapToGrid }) },
  ];
}

export { currentBoardMeta };
