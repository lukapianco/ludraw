/**
 * LuDraw — prévia SOMENTE LEITURA de uma versão (Chat 08.2 · B, `STUDIO_V2_SPEC.md` §3.4 e §7).
 *
 * Como a prévia não toca o `useBoardStore`:
 *  - os dados vêm da versão escolhida na linha do tempo (`useStudioUi.preview`), nunca de `loadBoard`/`applyRemote`;
 *  - o desenho é a MESMA rotina pura do export (`renderElementsInView`), com a máscara de privacidade do export;
 *  - a câmera da prévia é PRÓPRIA (arrastar e rodar o mouse mexem só nela);
 *  - a camada cobre o canvas (opaca, tom sépia) e captura ponteiro e teclado: nada chega ao board enquanto ela está
 *    aberta (`Esc` fecha e volta ao agora).
 * Assim abrir, navegar e fechar deixam o `useBoardStore` idêntico e nenhuma atualização Yjs é enviada.
 *
 * Movimento (ajuste pós-teste): a camada entra e sai com fade; trocar de versão faz um fade cruzado entre dois
 * canvases (a câmera da prévia é mantida, para comparar versões no mesmo lugar); ao abrir, se o conteúdo da versão
 * não cabe na área livre (fora da barra do topo e da gaveta da linha do tempo), a câmera enquadra o conteúdo.
 * "Reduzir movimento" troca tudo por mudanças instantâneas.
 */
import { useEffect, useRef, useState } from 'react';
import { HourglassIcon } from '../icons/od';
import { useBoardStore } from '../../store/useBoardStore';
import { useAppStore } from '../../store/useAppStore';
import type { CanvasElement } from '../../types/canvas';
import { renderElementsInView } from '../../utils/export';
import { privacy } from '../../utils/boardActions';
import { getBoundsOfElements } from '../../utils/math';
import { formatDateTime } from '../../i18n/format';
import { useT } from '../../i18n/useT';
import { cn } from '../../utils/cn';
import { useStudioUi, type PreviewVersion } from './studioUi';

type Camera = { x: number; y: number; zoom: number };
const FADE_MS = 220;
const PAD = 56;

const elementsOf = (v: PreviewVersion): CanvasElement[] => v.data.elementOrder.map((id) => v.data.elements[id]).filter((el): el is CanvasElement => !!el && el.type !== 'comment');

/** Área do board que fica livre: abaixo da barra do topo e fora da gaveta aberta (a maior sobra). */
function freeArea(box: DOMRect): { x: number; y: number; width: number; height: number } {
  const top = 72;
  const area = { x: 16, y: top, width: box.width - 32, height: box.height - top - 80 };
  const drawer = document.querySelector('[data-studio-drawer]')?.getBoundingClientRect();
  if (!drawer) return area;
  const dl = drawer.left - box.left;
  const dt = drawer.top - box.top;
  const left = { ...area, width: Math.max(0, dl - 16 - area.x) };
  const above = { ...area, height: Math.max(0, dt - 16 - area.y) };
  return left.width * left.height >= above.width * above.height ? left : above;
}

/** Mantém a câmera do board quando o conteúdo da versão já aparece; senão enquadra o conteúdo na área livre. */
function frameCamera(v: PreviewVersion, live: Camera, box: DOMRect): Camera {
  const b = getBoundsOfElements(elementsOf(v));
  if (!b) return { ...live };
  const area = freeArea(box);
  const sx = b.x * live.zoom + live.x;
  const sy = b.y * live.zoom + live.y;
  const fits = sx >= area.x && sy >= area.y && sx + b.width * live.zoom <= area.x + area.width && sy + b.height * live.zoom <= area.y + area.height;
  if (fits) return { ...live };
  const zoom = Math.max(0.05, Math.min(1.5, (area.width - PAD * 2) / Math.max(1, b.width), (area.height - PAD * 2) / Math.max(1, b.height)));
  return { zoom, x: area.x + area.width / 2 - (b.x + b.width / 2) * zoom, y: area.y + area.height / 2 - (b.y + b.height / 2) * zoom };
}

export function VersionPreviewLayer() {
  const t = useT();
  const live = useStudioUi((s) => s.preview);
  const theme = useAppStore((s) => s.theme);
  const reduce = useAppStore((s) => s.preferences.reduceMotion);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasA = useRef<HTMLCanvasElement>(null);
  const canvasB = useRef<HTMLCanvasElement>(null);
  const canvases = [canvasA, canvasB];
  // o que está na tela: segue a versão escolhida e fica mais um instante ao fechar (fade de saída)
  const [shown, setShown] = useState<PreviewVersion | null>(live);
  const [leaving, setLeaving] = useState(false);
  const [entered, setEntered] = useState(false);
  const [front, setFront] = useState(0);
  const onCanvas = useRef<(PreviewVersion | null)[]>([null, null]);
  const [camera, setCamera] = useState<Camera>(() => ({ ...useBoardStore.getState().camera }));
  const [size, setSize] = useState(() => ({ ...useBoardStore.getState().viewport }));
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;

  // abrir / trocar / fechar
  useEffect(() => {
    if (live) {
      setLeaving(false);
      setShown(live);
      return;
    }
    if (!shown) return;
    if (reduce) {
      setShown(null);
      return;
    }
    setLeaving(true);
    const id = window.setTimeout(() => {
      setShown(null);
      setLeaving(false);
    }, FADE_MS);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  // primeira versão: enquadra e desenha no canvas da frente; as seguintes: fade cruzado no outro canvas
  useEffect(() => {
    if (!shown) {
      onCanvas.current = [null, null];
      setEntered(false);
      return;
    }
    const box = boxRef.current?.getBoundingClientRect();
    if (!onCanvas.current[front]) {
      onCanvas.current[front] = shown;
      const cam = box ? frameCamera(shown, useBoardStore.getState().camera, box) : { ...useBoardStore.getState().camera };
      setCamera(cam);
      const raf = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(raf);
    }
    if (onCanvas.current[front]?.id === shown.id) return;
    const back = front === 0 ? 1 : 0;
    const el = canvases[back].current;
    if (!el) return;
    let alive = true;
    void renderElementsInView(el, elementsOf(shown), { camera: cameraRef.current, width: size.width, height: size.height, pixelRatio: window.devicePixelRatio || 1 }, { background: shown.data.backgroundColor ?? null, theme, privacy: privacy() }).then(() => {
      if (!alive) return;
      onCanvas.current[back] = shown;
      setFront(back);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown?.id]);

  // tamanho da camada
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [!!shown]);

  // câmera, tamanho ou tema mudaram: redesenha a versão da frente no lugar (sem fade)
  useEffect(() => {
    const v = onCanvas.current[front];
    const el = canvases[front].current;
    if (!v || !el) return;
    void renderElementsInView(el, elementsOf(v), { camera, width: size.width, height: size.height, pixelRatio: window.devicePixelRatio || 1 }, { background: v.data.backgroundColor ?? null, theme, privacy: privacy() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, size, theme, front, entered]);

  // teclado: nada chega ao board enquanto a prévia está aberta; Esc volta ao agora
  useEffect(() => {
    if (!live) return;
    const onKey = (e: KeyboardEvent) => {
      // o alvo pode ser a própria janela (tecla sem foco em elemento): só elementos têm closest()
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('[data-studio-drawer], [role="dialog"], input, textarea, select')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        useStudioUi.getState().setPreview(null);
        return;
      }
      if (e.key === 'Tab' || e.key === 'F6') return;
      e.stopPropagation();
      e.preventDefault();
    };
    const block = (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('paste', block, true);
    window.addEventListener('cut', block, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('paste', block, true);
      window.removeEventListener('cut', block, true);
    };
  }, [live]);

  if (!shown) return null;
  const visible = entered && !leaving;
  const fade = reduce ? '' : 'transition-opacity duration-[220ms] ease-out';
  return (
    <div
      ref={boxRef}
      data-testid={leaving ? undefined : 'version-preview'}
      data-studio-keep
      className={cn('absolute inset-0 z-[45] cursor-grab touch-none active:cursor-grabbing', fade, visible ? 'opacity-100' : 'opacity-0', leaving && 'pointer-events-none')}
      onPointerDown={(e) => {
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          /* ponteiro já liberado (ou sintético): arrastar continua funcionando sem a captura */
        }
        drag.current = { x: e.clientX, y: e.clientY, cx: camera.x, cy: camera.y };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (d) setCamera((c) => ({ ...c, x: d.cx + e.clientX - d.x, y: d.cy + e.clientY - d.y }));
      }}
      onPointerUp={() => (drag.current = null)}
      onWheel={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        setCamera((c) => {
          const zoom = Math.min(8, Math.max(0.05, c.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
          const k = zoom / c.zoom;
          return { zoom, x: px - (px - c.x) * k, y: py - (py - c.y) * k };
        });
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {canvases.map((ref, i) => (
        <canvas
          key={i}
          ref={ref}
          className={cn('absolute inset-0 h-full w-full', fade, i === front ? 'opacity-100' : 'opacity-0')}
          style={{ filter: 'sepia(0.28) saturate(0.85)' }}
          aria-hidden="true"
        />
      ))}
      <div role="status" className="pointer-events-auto absolute start-1/2 top-[64px] flex -translate-x-1/2 items-center gap-2.5 rounded-full bg-brand-900 py-1.5 pe-1.5 ps-3.5 text-[13px] font-semibold text-brand-100 shadow-pop" onPointerDown={(e) => e.stopPropagation()}>
        <HourglassIcon size={15} />
        <span>{t('studio.time.viewingAt', { when: formatDateTime(shown.createdAt) })}</span>
        <button type="button" className="rounded-full bg-brand-100 px-3 py-1 text-[12.5px] font-bold text-brand-900 hover:bg-white" onClick={() => useStudioUi.getState().setPreview(null)}>
          {t('studio.time.backToNow')}
        </button>
      </div>
    </div>
  );
}
