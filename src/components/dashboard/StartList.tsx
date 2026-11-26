import { ChevronRight, Puzzle } from 'lucide-react';
import { START_LIST_IDS, START_TEMPLATES, startFromTemplate } from './templates';
import { TemplateThumb } from './TemplateThumb';
import { useT } from '../../i18n/useT';
import { TemplateRegistry, useRegistry, type TemplateDefinition } from '../../extensions/registries';
import { useAppStore } from '../../store/useAppStore';
import { templateBoardData } from '../../utils/templates';
import { TemplatePreview } from '../extensions/TemplatePreview';

/** Chat 06.5: quantos modelos de extensão aparecem aqui (o resto fica em "Ver todos"). */
const EXTENSION_ITEMS = 3;

/** Chat 06.5: board novo a partir de um modelo de extensão (mesmo caminho da Galeria). */
function startFromExtension(tpl: TemplateDefinition): void {
  useAppStore.getState().createBoard({ name: tpl.label, template: 'personal', data: templateBoardData(tpl.build()), open: true });
}

/**
 * "Começar com…": lista vertical compacta de atalhos de criação
 * (miniaturas pequenas do TemplateThumb). "Ver todos" leva à aba Templates.
 * Chat 06.5: depois dos fixos, os modelos das extensões ativas (selo de extensão).
 */
export function StartList({ onSeeAll }: { onSeeAll: () => void }) {
  const t = useT();
  const items = START_LIST_IDS.map((id) => START_TEMPLATES.find((t) => t.id === id)).filter((t): t is (typeof START_TEMPLATES)[number] => !!t);
  const extensionTemplates = useRegistry(TemplateRegistry)
    .filter((tpl) => tpl.source === 'extension')
    .slice(0, EXTENSION_ITEMS);
  return (
    <section aria-labelledby="od-start-title" className="flex flex-col rounded-3xl bg-panel p-3 ring-1 ring-line">
      <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
        <h2 id="od-start-title" className="text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{t('dashboard.startList.start')}</h2>
        <button type="button" className="rounded-md px-1.5 py-0.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-panel-hover dark:text-brand-300" onClick={onSeeAll}>{t('dashboard.startList.seeAll')}</button>
      </div>
      <ul className="flex flex-col">
        {items.map((tpl) => (
          <li key={tpl.id}>
            <button type="button" className="od-menu-item group min-h-[52px] gap-3 py-1.5" onClick={() => startFromTemplate(tpl)}>
              <span className="h-[34px] w-[54px] shrink-0 overflow-hidden rounded-md ring-1 ring-line">
                <TemplateThumb kind={tpl.thumb} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-semibold">{tpl.label}</span>
                  {tpl.plannedFor && <span className="shrink-0 rounded-full bg-panel-sunken px-1.5 py-px text-2xs font-semibold text-ink-subtle ring-1 ring-line">{t('common.comingSoon')}</span>}
                </span>
                <span className="block truncate text-xs text-ink-subtle">{tpl.description}</span>
              </span>
              <ChevronRight size={15} className="shrink-0 text-ink-subtle opacity-0 transition-opacity duration-base group-hover:opacity-100" />
            </button>
          </li>
        ))}
        {extensionTemplates.map((tpl) => (
          <li key={tpl.id}>
            <button type="button" className="od-menu-item group min-h-[52px] gap-3 py-1.5" onClick={() => startFromExtension(tpl)}>
              <span className="h-[34px] w-[54px] shrink-0 overflow-hidden rounded-md ring-1 ring-line">
                <TemplatePreview template={tpl} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-semibold">{tpl.label}</span>
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-accent-soft px-1.5 py-px text-2xs font-semibold text-brand-900 dark:text-brand-200" title={t('dashboard.startList.fromExtension')}>
                    <Puzzle size={10} aria-hidden="true" /> {t('dashboard.startList.extensionBadge')}
                  </span>
                </span>
                <span className="block truncate text-xs text-ink-subtle">{tpl.description}</span>
              </span>
              <ChevronRight size={15} className="shrink-0 text-ink-subtle opacity-0 transition-opacity duration-base group-hover:opacity-100" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
