/**
 * Catálogo de pontos de partida da Mesa (Dashboard): usado por "Começar com…",
 * pela aba Templates, pelo botão "Novo board" e pela paleta Ctrl+K.
 * Só apresentação — cria boards pelo mesmo `createBoard` do Chat 01.
 */

import { notifyInDevelopment, useAppStore } from '../../store/useAppStore';
import type { BoardTemplateId } from '../../types/workspace';
import { createWelcomeBoardData, welcomeBoardName } from '../board/welcomeBoard';
import type { TemplateThumbKind } from './TemplateThumb';
import { t } from '../../i18n';

export type TemplateCategory = 'all' | 'brainstorm' | 'planning' | 'strategy' | 'diagram';

export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  get all() { return t('dashboard.templates.allPurposes'); },
  get brainstorm() { return t('dashboard.templates.brainstormingIdeation'); },
  get planning() { return t('dashboard.templates.planning'); },
  get strategy() { return t('dashboard.templates.strategy'); },
  get diagram() { return t('dashboard.templates.diagramsFlows'); },
};

export interface StartTemplate {
  id: string;
  label: string;
  description: string;
  thumb: TemplateThumbKind;
  category: TemplateCategory[];
  /** Board real criado ao escolher */
  template?: BoardTemplateId;
  /** Usa o conteúdo "Comece por aqui" */
  welcome?: boolean;
  /** Fora do escopo atual → aviso "em desenvolvimento" */
  plannedFor?: string;
}

export const START_TEMPLATES: StartTemplate[] = [
  { id: 'blank', get label() { return t('common.blank'); }, get description() { return t('dashboard.templates.anEmptyBoardJustGrid'); }, thumb: 'blank', category: ['all', 'brainstorm', 'planning', 'diagram'], template: 'blank' },
  { id: 'welcome', get label() { return t('dashboard.templates.startHere'); }, get description() { return t('dashboard.templates.n5CardWalkthroughSampleFlow'); }, thumb: 'welcome', category: ['all'], template: 'demo', welcome: true },
  { id: 'brainwriting', get label() { return t('dashboard.templates.brainstorming'); }, get description() { return t('dashboard.templates.brainwriting34GridSticky'); }, thumb: 'brainwriting', category: ['all', 'brainstorm'], template: 'brainwriting' },
  { id: 'flowchart', get label() { return t('dashboard.templates.flowchart'); }, get description() { return t('dashboard.templates.startDecisionEndAlreadyConnected'); }, thumb: 'flowchart', category: ['all', 'diagram'], template: 'flowchart' },
  { id: 'retro', get label() { return t('dashboard.templates.retrospective'); }, get description() { return t('dashboard.templates.startStopContinueActions'); }, thumb: 'retro', category: ['all', 'brainstorm'], template: 'retro' },
  { id: 'kanban', get label() { return t('common.sprintKanban'); }, get description() { return t('dashboard.templates.columnsWipCardsCapacity'); }, thumb: 'kanban', category: ['all', 'planning'], template: 'sprint' },
  { id: 'swot', get label() { return t('common.swotMatrix'); }, get description() { return t('dashboard.templates.n4QuadrantsLockedBackground'); }, thumb: 'swot', category: ['all', 'strategy'], template: 'swot' },
  { id: 'business9', get label() { return t('dashboard.templates.businessModel'); }, get description() { return t('dashboard.templates.nineBlocksGuidingQuestions'); }, thumb: 'business9', category: ['all', 'strategy'], template: 'business9' },
  { id: 'journey', get label() { return t('dashboard.templates.userJourney'); }, get description() { return t('dashboard.templates.stagesLayersEmotionCurve'); }, thumb: 'journey', category: ['all', 'planning'], template: 'journey' },
  { id: 'architecture', get label() { return t('dashboard.templates.architectureFlow'); }, get description() { return t('dashboard.templates.containersProtocolsFlowchart'); }, thumb: 'architecture', category: ['all', 'diagram'], template: 'architecture' },
  { id: 'demo', get label() { return t('dashboard.templates.demoBoard'); }, get description() { return t('dashboard.templates.objectsTryEveryTransformation'); }, thumb: 'demo', category: ['all'], template: 'demo' },
  { id: 'roadmap', get label() { return t('dashboard.templates.productRoadmap'); }, get description() { return t('dashboard.templates.timelineQuarter'); }, thumb: 'roadmap', category: ['all', 'planning'], get plannedFor() { return t('dashboard.templates.postChat08BacklogCommunity'); } },
  { id: 'mindmap', get label() { return t('common.mindMap'); }, get description() { return t('dashboard.templates.branchOutIdeasTabEnter'); }, thumb: 'mindmap', category: ['all', 'brainstorm', 'diagram'], template: 'mindmap' },
];

/** Itens curtos do bloco "Começar com…" (lista vertical compacta). */
export const START_LIST_IDS = ['blank', 'welcome', 'retro', 'brainwriting', 'flowchart', 'kanban'];

/** Cria e abre um board a partir do item (ou mostra o aviso de "em desenvolvimento"). */
export function startFromTemplate(tpl: StartTemplate): void {
  const app = useAppStore.getState();
  if (tpl.plannedFor || !tpl.template) {
    notifyInDevelopment(t('dashboard.templates.templateLabel', { label: tpl.label }), tpl.plannedFor);
    return;
  }
  if (tpl.welcome) {
    app.createBoard({ name: welcomeBoardName(), template: tpl.template, data: createWelcomeBoardData(), open: true });
    return;
  }
  app.createBoard({ template: tpl.template, open: true });
}

export function templateById(id: string): StartTemplate | undefined {
  return START_TEMPLATES.find((t) => t.id === id);
}
