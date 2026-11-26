import { OdIcon, type OdIconProps } from './OdIcon';

/** Caixa de ferramentas — desenho da referência do projeto (`ai-memory/refs/estudio-v2-centro.html`). */
export const ToolboxIcon = (p: OdIconProps) => (
  <OdIcon {...p}>
    <rect className="acc" x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><path d="M17 13.5v7M13.5 17h7" />
  </OdIcon>
);
