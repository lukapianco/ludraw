import { OdIcon, type OdIconProps } from './OdIcon';

/** Kanban — desenho da referência do projeto (`ai-memory/refs/estudio-v2-centro.html`). */
export const KanbanIcon = (p: OdIconProps) => (
  <OdIcon {...p}>
    <rect x="3.5" y="4" width="5" height="16" rx="1.5" /><rect className="acc" x="9.5" y="4" width="5" height="11" rx="1.5" /><rect x="15.5" y="4" width="5" height="13" rx="1.5" />
  </OdIcon>
);
