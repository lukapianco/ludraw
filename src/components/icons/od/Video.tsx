import { OdIcon, type OdIconProps } from './OdIcon';

/** Gravação de vídeo — desenhado do zero no Chat 08.2 · C-1. */
export const VideoIcon = (p: OdIconProps) => (
  <OdIcon {...p}>
    <rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10.5l5-3v9l-5-3" /><circle className="acc" cx="7" cy="10" r="1.5" stroke="none" />
  </OdIcon>
);
