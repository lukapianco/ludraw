import { Check, Eye, EyeOff, Play } from 'lucide-react';
import type { FrameElement } from '../../types/canvas';
import { useBoardStore } from '../../store/useBoardStore';
import { useCan } from '../../hooks/useCan';
import { exportFrame, startPresentation, type FrameExportKind } from '../../utils/boardActions';
import { FRAME_FILLS, FRAME_RATIOS, frameRatioInfo, type FrameRatio } from '../../utils/frames';
import { cn } from '../../utils/cn';
import { Tooltip } from '../ui/Tooltip';
import { StripPop } from '../strip/StripPop';
import { ExportIcon, RatioIcon } from '../icons/od';
import { useT } from '../../i18n/useT';

const board = () => useBoardStore.getState();

/**
 * Controles da Cinta para um Frame (Chat 03 · B; Cinta no Chat 08.2 · C-2, §16.3): Proporção (chip) · Cor de fundo ·
 * Conteúdo visível (facilitador) · Exportar o frame · **Apresentar** (o único botão cheio, com rótulo). O nome do frame
 * fica no segmento de identidade da Cinta (renomear ali). Permissões pela via oficial (`useCan`); o store reaplica
 * `ensure`. As gavetas são as da Cinta (`StripPop`), com o estado aberto vindo dela.
 */
export function FrameControls({ frame, open, onToggle }: { frame: FrameElement; open: string | null; onToggle: (id: string) => void }) {
  const t = useT();
  const edit = useCan('board.edit');
  const hide = useCan('frame.toggleHidden');
  const exp = useCan('board.export');
  const canEdit = edit.allowed && !frame.locked;
  const editReason = frame.locked ? t('board.frameControls.theFrameLocked') : edit.reason;
  const closeAll = () => open && onToggle(open);
  const setRatio = (id: FrameRatio) => {
    const info = frameRatioInfo(id);
    const patch: Partial<FrameElement> = { ratioPreset: id };
    if (info.ratio) patch.height = frame.width / info.ratio; // mantém a largura, ajusta a altura
    board().pushHistory();
    board().updateElement(frame.id, patch);
    board().syncFrameMembership(undefined, [frame.id]);
    closeAll();
  };
  const runExport = (kind: FrameExportKind) => {
    closeAll();
    void exportFrame(frame.id, kind);
  };
  return (
    <div className="flex items-center gap-0.5">
      <StripPop
        id="frame-ratio"
        open={open}
        onToggle={onToggle}
        variant="chip"
        name={t('board.strip.ratio')}
        label={t('board.frameControls.aspectRatio')}
        title={t('board.strip.ratio')}
        disabled={!canEdit}
        reason={editReason ?? undefined}
        footer={t('board.strip.ratioFooter')}
        testId="strip-frame-ratio"
        trigger={
          <span className="flex items-center gap-1.5" data-strip-value>
            <RatioIcon size={16} />
            {frameRatioInfo(frame.ratioPreset).label}
          </span>
        }
      >
        <div className="flex w-[180px] flex-col p-1.5">
          {FRAME_RATIOS.map((r) => (
            <button key={r.id} type="button" className="od-menu-item" onClick={() => setRatio(r.id)} data-ratio={r.id}>
              <span className="flex-1">{r.label}</span>
              {frame.ratioPreset === r.id && <Check size={15} className="text-selection" />}
            </button>
          ))}
        </div>
      </StripPop>
      <StripPop
        id="frame-fill"
        open={open}
        onToggle={onToggle}
        label={t('common.backgroundColor')}
        disabled={!canEdit}
        reason={editReason ?? undefined}
        trigger={<span className="h-[18px] w-[18px] rounded-md ring-1 ring-line-strong" style={{ background: frame.fillColor }} />}
      >
        <div className="grid grid-cols-5 gap-2 p-3">
          {FRAME_FILLS.map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              aria-label={c}
              onClick={() => {
                board().pushHistory();
                board().updateElement(frame.id, { fillColor: c });
                closeAll();
              }}
              className={cn(
                'h-7 w-7 rounded-md ring-1 ring-black/10 transition-transform duration-base ease-spring hover:scale-110 dark:ring-white/15',
                frame.fillColor.toLowerCase() === c.toLowerCase() && 'ring-2 ring-selection ring-offset-2 ring-offset-[var(--od-panel)]',
              )}
              style={{ background: c }}
            />
          ))}
        </div>
      </StripPop>
      {hide.allowed && (
        <Tooltip label={frame.hiddenContent ? t('board.frameControls.showContent') : t('board.frameControls.hideContent')} side="top">
          <button
            type="button"
            className="od-tool"
            data-active={!!frame.hiddenContent}
            onClick={() => board().setFrameHidden(frame.id, !frame.hiddenContent)}
            aria-pressed={!!frame.hiddenContent}
            aria-label={frame.hiddenContent ? t('board.frameControls.showFramesContent') : t('board.frameControls.hideFramesContent')}
          >
            {frame.hiddenContent ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </Tooltip>
      )}
      <StripPop id="frame-export" open={open} onToggle={onToggle} label={t('board.frameControls.exportFrame')} disabled={!exp.allowed} reason={exp.reason} trigger={<ExportIcon size={18} />}>
        <div className="flex w-[220px] flex-col p-1.5">
          <div className="px-2 pb-1 pt-0.5 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{t('board.frameControls.exportTitled', { title: frame.title || t('board.frameControls.frameFallback') })}</div>
          <button type="button" className="od-menu-item" onClick={() => runExport('pdf')}>{t('board.frameControls.pdfHighResolution')}</button>
          <button type="button" className="od-menu-item" onClick={() => runExport('png2')}>{t('common.pngHighQuality2x')}</button>
          <button type="button" className="od-menu-item" onClick={() => runExport('png4')}>{t('common.pngUltraHd4x')}</button>
          <button type="button" className="od-menu-item" onClick={() => runExport('svg')}>{t('common.vectorSvg')}</button>
        </div>
      </StripPop>
      {/* Apresentar: o único botão cheio da Cinta, com rótulo */}
      <Tooltip label={t('board.frameControls.presentThisFrame')} side="top">
        <button type="button" data-strip-control="present" className="od-btn od-btn-primary ms-1 h-[34px] shrink-0 gap-1.5 px-2.5 text-[12.5px]" onClick={() => startPresentation(frame.id)} aria-label={t('board.frameControls.presentThisFrame')}>
          <Play size={14} className="fill-current" />
          <span className="max-[639px]:hidden">{t('board.strip.present')}</span>
        </button>
      </Tooltip>
    </div>
  );
}
