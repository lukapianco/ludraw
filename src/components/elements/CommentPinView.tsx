import { memo } from 'react';
import { Check } from 'lucide-react';
import type { CommentElement } from '../../types/canvas';
import { useBoardStore } from '../../store/useBoardStore';
import { colorFromString } from '../../utils/color';
import { initials } from '../../utils/format';
import { useT } from '../../i18n/useT';
import { useStudioUi } from '../studio/studioUi';
import { presenceLabelColors } from '../../utils/presenceLayout';

/** Desenho do pin = o mesmo traçado do ícone de comentário (`icons/od/CommentPin.tsx`), em grade 24. */
const PIN_PATH = 'M4.5 19.5v-8a7 7 0 1 1 7 7h-7z';

interface Props {
  element: CommentElement;
  isEditing: boolean;
}

/** Tamanho do pin em pixels de TELA (não encolhe com o zoom). */
export const COMMENT_PIN_PX = 30;

/**
 * Pin de comentário (Chat 04). A ponta do pin fica em (x, y) do elemento; o desenho tem tamanho
 * fixo de tela, como o cabeçalho do frame. Clicar seleciona e abre a conversa
 * (`board/CommentThreadPanel.tsx`); quem edita o board pode arrastar o pin.
 *
 * Visual próprio: silhueta do ícone de comentário (Chat 08.2 · C-1) com a ponta no canto inferior esquerdo, iniciais do
 * autor na cor dele (contraste AA),
 * contador de respostas; resolvido = cinza com ✓. Não sai no PNG/PDF.
 */
export const CommentPinView = memo(function CommentPinView({ element }: Props) {
  const t = useT();
  const zoom = useBoardStore((s) => s.camera.zoom);
  const selected = useBoardStore((s) => s.selectedIds.includes(element.id));
  // Chat 08.2: "Ir até" (Conversas) destaca o pin por 1,5 s
  const flashing = useStudioUi((s) => s.flashId === element.id);
  const first = element.messages[0];
  const author = first?.author ?? element.createdByName ?? t('widgets.commentPinView.someone');
  const color = element.resolved ? '#7D877F' : colorFromString(author);
  const replies = Math.max(0, element.messages.length - 1);
  const pin = presenceLabelColors(color);

  return (
    <div
      className="absolute left-0"
      style={{ bottom: 0, width: COMMENT_PIN_PX, height: COMMENT_PIN_PX, transform: `scale(${1 / zoom})`, transformOrigin: 'bottom left', cursor: 'pointer' }}
      title={first ? `${author}: ${first.text}` : t('widgets.commentPinView.comment')}
    >
      {flashing && <span data-od-flash className="pointer-events-none absolute -inset-2 animate-ping rounded-full ring-4 ring-[var(--od-selection)] [.od-reduce-motion_&]:animate-none" />}
      {/* Chat 08.2 · C-1: silhueta do ícone próprio de comentário (ponta no canto inferior esquerdo), preenchida na cor
          do autor — escurecida quando preciso para as iniciais terem contraste AA (≥ 4,5:1) em qualquer cor e tema */}
      <div
        className="absolute inset-0 transition-transform duration-fast ease-out hover:scale-110"
        style={{ transformOrigin: 'bottom left', opacity: element.resolved && !selected ? 0.75 : 1 }}
        data-comment-pin
      >
        <svg viewBox="3 3 17.5 17.5" width="100%" height="100%" aria-hidden="true" className="absolute inset-0 overflow-visible">
          {selected && <path d={PIN_PATH} fill="none" stroke="var(--od-selection)" strokeWidth={4.2} strokeLinejoin="round" />}
          <path d={PIN_PATH} fill={pin.background} stroke="var(--od-panel)" strokeWidth={1.6} strokeLinejoin="round" data-pin-fill={pin.background} />
        </svg>
        <span className="absolute flex items-center justify-center text-[11px] font-bold" style={{ left: '8%', right: '8%', top: '8%', bottom: '18%', color: pin.text }} data-pin-text={pin.text}>
          {element.resolved ? <Check size={14} strokeWidth={3} /> : initials(author)}
        </span>
      </div>
      {replies > 0 && !element.resolved && (
        <span
          className="absolute flex items-center justify-center rounded-full bg-panel text-2xs font-bold tabular-nums text-ink ring-1 ring-line"
          style={{ right: -7, top: -6, minWidth: 16, height: 16, padding: '0 4px' }}
        >
          {replies + 1}
        </span>
      )}
    </div>
  );
});
