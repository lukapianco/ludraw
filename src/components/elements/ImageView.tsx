import { memo, useEffect, useState } from 'react';
import { Download, ImageOff, LoaderCircle, ShieldAlert } from 'lucide-react';
import type { ImageElement } from '../../types/canvas';
import { useT } from '../../i18n/useT';
import { isAssetRef } from '../../utils/assetRefs';
import { isExternalImageSrc, isSafeImageSrc } from '../../utils/contentSafety';
import { useBoardStore } from '../../store/useBoardStore';
import { useCan } from '../../hooks/useCan';
import { api } from '../../utils/api';
import { downloadExternalImageInto } from '../../utils/importActions';

interface Props {
  element: ImageElement;
  isEditing: boolean;
}

/**
 * Imagem resolvida para exibição. Chat 08.2: no Modo Servidor o elemento guarda `asset:<sha256>` e os bytes vêm do
 * servidor por fetch autenticado (blob URL, com cache); data URL (Modo Local, SVG) é usada direto.
 */
function useImageSrc(source: string): { src: string | null; failed: boolean } {
  const boardId = useBoardStore((s) => s.boardId);
  const ref = isAssetRef(source);
  const [state, setState] = useState<{ for: string; src: string | null; failed: boolean }>({ for: '', src: null, failed: false });
  useEffect(() => {
    if (!ref || !boardId) return;
    let alive = true;
    void import('../../collab/assets').then(({ assetBlobUrl }) =>
      assetBlobUrl(source, boardId).then(
        (src) => alive && setState({ for: source, src, failed: false }),
        () => alive && setState({ for: source, src: null, failed: true }),
      ),
    );
    return () => {
      alive = false;
    };
  }, [ref, source, boardId]);
  if (!ref) return { src: source || null, failed: false };
  return state.for === source ? { src: state.src, failed: state.failed } : { src: null, failed: false };
}

/**
 * Imagem embutida (Chat 02 · Rodada A). O arquivo já chega comprimido (≤ 1600 px, WebP/JPEG 0.85)
 * por `utils/images.ts`; aqui só exibimos. A proporção é mantida ao redimensionar pelos cantos
 * (regra do CanvasStage para `image`). Arrastar nativo do navegador fica desligado.
 */
export const ImageView = memo(function ImageView({ element }: Props) {
  const t = useT();
  const [failed, setFailed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const external = isExternalImageSrc(element.dataUrl);
  const resolved = useImageSrc(isSafeImageSrc(element.dataUrl) ? element.dataUrl : '');
  const iconSize = Math.max(14, Math.min(40, Math.min(element.width, element.height) * 0.25));
  // Chat 09 · R2: a CSP do app não carrega imagem de outro site (S-30, 2ª camada). Quem edita, no Modo Servidor, pode
  // trazê-la para dentro do board ("Baixar para o board", pelo servidor — decisão do usuário); os outros veem por quê.
  const boardId = useBoardStore((s) => s.boardId);
  const canEdit = useCan('board.edit').allowed;
  const canDownload = external && !!api && !!boardId && canEdit;
  if (external) {
    // objeto pequeno: só o ícone/botão (o texto vai para a dica e para o rótulo acessível)
    const compact = element.width < 200 || element.height < 150;
    let host = '';
    try {
      host = new URL(element.dataUrl, window.location.href).host;
    } catch {
      /* endereço inválido: mostra só o aviso */
    }
    const blocked = t('widgets.imageView.externalBlocked', { host });
    const why = canDownload ? t('widgets.imageView.externalDownloadHint') : api ? t('widgets.imageView.externalAskEditor') : t('widgets.imageView.externalLocal');
    return (
      <div
        data-external-image
        title={compact ? `${blocked} ${why}` : undefined}
        className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 overflow-hidden rounded-[2px] bg-panel-sunken p-2 text-center text-ink-subtle ring-1 ring-line"
      >
        {(!compact || !canDownload) && <ShieldAlert size={compact ? 16 : iconSize} aria-hidden="true" />}
        {!compact && <span className="text-xs font-medium">{blocked}</span>}
        {!compact && !canDownload && <span className="text-2xs">{why}</span>}
        {canDownload && (
          <button
            type="button"
            className={compact ? 'od-btn od-btn-sm od-btn-soft px-2' : 'od-btn od-btn-sm od-btn-soft'}
            style={{ pointerEvents: 'auto' }}
            disabled={downloading}
            data-external-image-download
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setDownloading(true);
              void downloadExternalImageInto(element.id).finally(() => setDownloading(false));
            }}
            title={why}
            aria-label={compact ? t('importexport.safety.urlImageDownload') : undefined}
          >
            {downloading ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : compact ? <Download size={16} aria-hidden="true" /> : t('importexport.safety.urlImageDownload')}
          </button>
        )}
      </div>
    );
  }
  if (failed || resolved.failed || !element.dataUrl || (!isSafeImageSrc(element.dataUrl) && !isAssetRef(element.dataUrl))) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-[2px] bg-panel-sunken text-ink-subtle ring-1 ring-line">
        <ImageOff size={iconSize} />
        <span className="px-2 text-center text-xs font-medium">{t('widgets.imageView.imageUnavailable')}</span>
      </div>
    );
  }
  if (!resolved.src) {
    return (
      <div data-image-loading className="absolute inset-0 flex items-center justify-center rounded-[2px] bg-panel-sunken text-ink-subtle ring-1 ring-line" aria-label={t('server.assets.loading')}>
        <LoaderCircle size={iconSize} className="animate-spin" />
      </div>
    );
  }
  return (
    <img
      src={resolved.src}
      alt={element.alt ?? ''}
      referrerPolicy="no-referrer"
      draggable={false}
      decoding="async"
      onError={() => setFailed(true)}
      className="pointer-events-none absolute inset-0 h-full w-full select-none rounded-[2px]"
      style={{ objectFit: 'fill' }}
    />
  );
});
