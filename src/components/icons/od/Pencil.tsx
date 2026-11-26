import { OdIcon, type OdIconProps } from './OdIcon';

/** Renomear / editar — desenho da referência do projeto (`ai-memory/refs/estudio-v2-centro.html`). */
export const PencilIcon = (p: OdIconProps) => (
  <OdIcon {...p}>
    <path d="M4 20l1-4L16 5l3 3L8 19z" /><path className="acc" d="M14 7l3 3" />
  </OdIcon>
);
