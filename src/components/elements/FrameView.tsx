import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { FrameElement } from '../../types/canvas';
import { useBoardStore } from '../../store/useBoardStore';
import { useCan } from '../../hooks/useCan';
import { isDarkColor } from '../../utils/color';
import { frameRatioInfo } from '../../utils/frames';
import { Tooltip } from '../ui/Tooltip';
import { useT } from '../../i18n/useT';

interface Props {
  element: FrameElement;
  isEditing: boolean;
}

/** Altura do cabeçalho em pixels de TELA (o cabeçalho não encolhe com o zoom). */
const HEADER_PX = 26;

/**
 * Frame (Chat 03 · Rodada B). Área com fundo próprio que agrupa o que está dentro dela.
 *
 * - O corpo deixa o ponteiro passar: arrastar dentro do frame faz seleção por área e o duplo
 *   clique cria um post-it — o frame é selecionado pelo cabeçalho (título) acima dele.
 * - Cabeçalho em tamanho fixo de tela: título (duplo clique, Enter ou F2 editam), proporção e o
 *   olhinho de ocultar conteúdo — só aparece para quem pode (`frame.toggleHidden`).
 * - Conteúdo oculto: os filhos não são desenhados (regra de `utils/frames.ts`) e o corpo mostra
 *   uma capa; o mesmo vale no export e nas miniaturas.
 */
export const FrameView = memo(function FrameView({ element, isEditing }: Props) {
  const t = useT();
  const zoom = useBoardStore((s) => s.camera.zoom);
  const presenting = useBoardStore((s) => s.presenting);
  const toggle = useCan('frame.toggleHidden');
  const dark = isDarkColor(element.fillColor);
  const hidden = !!element.hiddenContent;
  const minSide = Math.min(element.width, element.height);
  const ratio = frameRatioInfo(element.ratioPreset);

  return (
    <>
      {/* Corpo */}
      <div
        className="absolute inset-0"
        style={{
          background: element.fillColor,
          borderRadius: 3,
          boxShadow: `0 0 0 ${1 / zoom}px ${dark ? 'rgba(255,255,255,0.18)' : 'rgba(20,36,26,0.16)'}, 0 ${2 / zoom}px ${10 / zoom}px rgba(20,36,26,0.06)`,
          pointerEvents: 'none',
        }}
      >
        {hidden && (
          <div className="flex h-full w-full flex-col items-center justify-center" style={{ gap: minSide * 0.03, color: dark ? '#F4F5F2' : '#4F5A53' }}>
            <EyeOff size={Math.max(16, minSide * 0.12)} strokeWidth={1.6} aria-hidden="true" />
            <span style={{ fontSize: Math.max(10, minSide * 0.05), fontWeight: 600, fontFamily: 'Figtree, system-ui, sans-serif' }}>{t('widgets.frameView.hiddenContent')}</span>
          </div>
        )}
      </div>

      {/* Cabeçalho (tamanho fixo de tela) — escondido no Modo Apresentação */}
      {!presenting && (
      <div
        className="absolute left-0 flex items-end"
        style={{
          bottom: '100%',
          width: element.width * zoom,
          height: HEADER_PX,
          transform: `scale(${1 / zoom})`,
          transformOrigin: 'bottom left',
          pointerEvents: 'auto',
        }}
      >
        <div className="flex min-w-0 max-w-full items-center gap-1 pb-1">
          {isEditing ? (
            <TitleEditor element={element} />
          ) : (
            <span className="min-w-0 truncate rounded px-1 text-[13px] font-semibold leading-5 text-ink-muted hover:bg-panel-hover hover:text-ink" title={element.title}>
              {element.title || t('widgets.frameView.untitledFrame')}
            </span>
          )}
          {ratio.id !== 'free' && !isEditing && <span className="shrink-0 rounded px-1 text-2xs font-semibold text-ink-subtle">{ratio.label}</span>}
          {toggle.allowed ? (
            <Tooltip label={hidden ? t('widgets.frameView.showContent') : t('widgets.frameView.hideContentActivities')} side="top">
              <button
                type="button"
                data-od-floating
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-subtle transition-colors duration-fast hover:bg-panel-hover hover:text-ink"
                style={hidden ? { color: 'var(--od-selection)' } : undefined}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                }}
                onClick={() => useBoardStore.getState().setFrameHidden(element.id, !hidden)}
                aria-pressed={hidden}
                aria-label={hidden ? t('widgets.frameView.showFramesContent') : t('widgets.frameView.hideFramesContent')}
              >
                {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </Tooltip>
          ) : (
            hidden && (
              <Tooltip label={t('widgets.frameView.contentHiddenFacilitator')} side="top">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center text-ink-subtle" aria-label={t('widgets.frameView.contentHiddenFacilitator')}>
                  <EyeOff size={14} />
                </span>
              </Tooltip>
            )
          )}
        </div>
      </div>
      )}
    </>
  );
});

/** Campo do título: Enter/Esc confirmam (mesma regra dos outros textos); o histórico vem de `setEditingId`. */
function TitleEditor({ element }: { element: FrameElement }) {
  const t = useT();
  const [value, setValue] = useState(element.title);
  const latest = useRef(element.title);
  const ref = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  const mounted = useRef(false);

  const commit = (text: string, endEditing = true) => {
    if (finished.current) return;
    finished.current = true;
    const s = useBoardStore.getState();
    const clean = text.trim() || t('widgets.frameView.frame');
    if (clean !== element.title) s.updateElement(element.id, { title: clean });
    if (endEditing && s.editingId === element.id) s.setEditingId(null);
  };

  useLayoutEffect(() => {
    ref.current?.focus({ preventScroll: true });
    ref.current?.select();
  }, []);

  // clique fora desmonta sem "blur": confirma o último texto (adiado por causa do StrictMode)
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      window.setTimeout(() => {
        if (!mounted.current) commit(latest.current, false);
      }, 0);
    };
  }, []);

  return (
    <input
      ref={ref}
      data-editing="true"
      value={value}
      maxLength={80}
      aria-label={t('widgets.frameView.frameTitle')}
      onChange={(e) => {
        latest.current = e.target.value;
        setValue(e.target.value);
      }}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          commit(e.currentTarget.value);
        }
      }}
      className="h-6 w-[220px] max-w-full rounded-md border border-selection bg-panel px-1.5 text-[13px] font-semibold text-ink outline-none"
      style={{ boxShadow: 'var(--od-focus-ring)' }}
    />
  );
}
