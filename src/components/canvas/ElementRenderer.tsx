import { useStudioUi } from '../studio/studioUi';
import { memo, useMemo, type ComponentType } from 'react';
import { renderSafeElement } from '../../utils/contentSafety';
import type { CanvasElement } from '../../types/canvas';
import { useBoardStore } from '../../store/useBoardStore';
import { StickyNoteView } from '../elements/StickyNoteView';
import { ShapeView } from '../elements/ShapeView';
import { TextView } from '../elements/TextView';
import { FreehandView } from '../elements/FreehandView';
import { ConnectorView } from '../elements/ConnectorView';
import { ImageView } from '../elements/ImageView';
import { MindMapView } from '../elements/MindMapView';
import { FrameView } from '../elements/FrameView';
import { KanbanView } from '../elements/KanbanView';
import { TableView } from '../elements/TableView';
import { CommentPinView } from '../elements/CommentPinView';
import { UnsupportedElementView } from '../elements/UnsupportedElementView';
import { DeclarativeElementView } from '../elements/DeclarativeElementView';

/**
 * Roteador modular de elementos (CLAUDE.md §3.4).
 * Para adicionar um novo tipo nos próximos chats, basta registrar o componente aqui:
 *   REGISTRY.kanban = KanbanView;
 * O CanvasStage não conhece nenhum tipo específico.
 */
type ViewProps<T extends CanvasElement = CanvasElement> = { element: T; isEditing: boolean };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REGISTRY: Partial<Record<CanvasElement['type'], ComponentType<ViewProps<any>>>> = {
  sticky: StickyNoteView,
  shape: ShapeView,
  text: TextView,
  freehand: FreehandView,
  connector: ConnectorView,
  image: ImageView,
  mindmap: MindMapView,
  frame: FrameView,
  // Chat 04
  kanban: KanbanView,
  table: TableView,
  comment: CommentPinView,
};

export function registerElementView<T extends CanvasElement>(type: T['type'], view: ComponentType<ViewProps<T>>): void {
  REGISTRY[type] = view as ComponentType<ViewProps<CanvasElement>>;
}

// Chat 06.5: tipos compostos de extensões (peças declarativas, sem JS de render — EXTENSIONS_SPEC §4)
registerElementView('composite', DeclarativeElementView);

interface ElementRendererProps {
  id: string;
}

export const ElementRenderer = memo(function ElementRenderer({ id }: ElementRendererProps) {
  const stored = useBoardStore((s) => s.elements[id]);
  // Chat 08.7 · R4 (S-30/S-31): link inseguro e cor com url(…) não chegam à tela (boards antigos, Yjs, backup)
  const element = useMemo(() => (stored ? renderSafeElement(stored) : stored), [stored]);
  const isEditing = useBoardStore((s) => s.editingId === id);
  // Chat 08.2: "Destacar por tag" (Exibir) — só visualização; o que não tem a tag fica esmaecido
  const dimmed = useStudioUi((s) => {
    if (!s.highlightTags.length || !element || element.type === 'frame' || element.type === 'comment') return false;
    const tags = (element as { tags?: unknown }).tags;
    return !(Array.isArray(tags) && tags.some((tag) => typeof tag === 'object' && tag && s.highlightTags.includes((tag as { id: string }).id)));
  });
  if (!element) return null;

  const View = REGISTRY[element.type] ?? UnsupportedElementView;
  // Traço livre e conector: só o traço recebe o ponteiro. Frame: só o cabeçalho (o corpo deixa
  // o ponteiro passar para seleção por área e duplo clique dentro dele).
  const strokeOnlyHit = element.type === 'freehand' || element.type === 'connector' || element.type === 'frame';

  return (
    <div
      data-element-id={id}
      data-locked={element.locked ? 'true' : undefined}
      data-od-dimmed={dimmed ? 'true' : undefined}
      className="absolute"
      style={{
        left: element.x,
        top: element.y,
        width: element.width,
        height: element.height,
        transform: element.rotation && element.type !== 'connector' ? `rotate(${element.rotation}deg)` : undefined,
        transformOrigin: 'center center',
        opacity: element.opacity ?? 1,
        pointerEvents: strokeOnlyHit ? 'none' : 'auto',
      }}
    >
      <View element={element} isEditing={isEditing} />
    </div>
  );
});
