import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CURSOR_GLIDE } from '../../utils/collaboration';
import { COLLABORATOR_PALETTE, presenceColor } from '../../collab/protocol';
import { useCollabUi } from '../../collab/presenceStore';
import { useAppStore } from '../../store/useAppStore';
import { useBoardStore } from '../../store/useBoardStore';
import { CURSOR_IDLE_MS } from '../../utils/collaboration';
import { layoutPresence, topLevelIds, unionRect, type PresencePersonInput } from '../../utils/presenceLayout';
import { worldRectToScreen, worldToScreen } from '../../utils/math';
import { CollaboratorCursor, PresenceBox, PresenceEditFrame, PresenceLabelTag } from '../ui/Presence';

/**
 * Camada de presença sobre o canvas (Chat 08): cursor de cada pessoa (some após 6 s parada e respeita
 * "Mostrar cursores dos colaboradores"), caixa de seleção por arrasto, contorno do que ela selecionou e do que
 * está editando. Em votação anônima com cursores ocultos o servidor nem manda a posição — não há o que desenhar.
 */
export function RemotePresence() {
  const users = useCollabUi((s) => s.users);
  const cursors = useCollabUi((s) => s.cursors);
  const selection = useCollabUi((s) => s.selection);
  const marquee = useCollabUi((s) => s.marquee);
  const editing = useCollabUi((s) => s.editing);
  const hidden = useCollabUi((s) => s.hidden);
  const camera = useBoardStore((s) => s.camera);
  const elements = useBoardStore((s) => s.elements);
  const me = useBoardStore((s) => s.access.userId);
  const presenting = useBoardStore((s) => s.presenting);
  const showCursors = useAppStore((s) => s.preferences.showCursors);
  const inertia = useAppStore((s) => s.preferences.cursorInertia && !s.preferences.reduceMotion);
  const [now, setNow] = useState(() => Date.now());

  // reavalia a cada segundo para o cursor parado sumir
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const byId = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  if (hidden || presenting || users.length < 2) return null;
  const colorOf = (id: string) => byId.get(id)?.color ?? presenceColor(id, COLLABORATOR_PALETTE);

  const viewport = useBoardStore.getState().viewport;
  const rectOf = (id: string) => {
    const el = elements[id];
    return el && el.type !== 'comment' ? worldRectToScreen({ x: el.x, y: el.y, width: el.width, height: el.height }, camera) : null;
  };
  // Chat 08.2 (STUDIO_V2_SPEC §6): UMA caixa e UMA etiqueta por pessoa; edição só no objeto editado
  const people: PresencePersonInput[] = [];
  const uids = new Set([...Object.keys(selection), ...Object.keys(editing)]);
  for (const uid of uids) {
    const u = byId.get(uid);
    if (!u || uid === me) continue;
    const ids = (selection[uid] ?? []).filter((id) => elements[id] && elements[id].type !== 'comment');
    const top = topLevelIds(ids, (id) => elements[id]?.parentId ?? null);
    const editId = editing[uid] && elements[editing[uid]!] ? editing[uid]! : null;
    people.push({
      uid,
      name: u.name,
      color: colorOf(uid),
      selection: unionRect(top.map(rectOf)),
      editing: editId ? rectOf(editId) : null,
      selectionIsEditing: !!editId && top.length === 1 && top[0] === editId,
    });
  }
  // Chat 08.6 · B: etiqueta em 11 px (era 10,5) — largura estimada por letra 6,7 px (era 6,4)
  const layout = layoutPresence(people, viewport, (text) => ({ width: Math.ceil(text.length * 6.7) + 12, height: 18 }));

  return (
    <div className="pointer-events-none absolute inset-0 z-[7] overflow-hidden" aria-hidden="true" data-testid="remote-presence">
      {Object.entries(marquee).map(([uid, r]) => {
        const u = byId.get(uid);
        if (!u || uid === me || !r) return null;
        const s = worldRectToScreen(r, camera);
        const color = colorOf(uid);
        // mesmo desenho da caixa de seleção local: borda 1 px + preenchimento 8 %, na cor da pessoa
        return (
          <div
            key={`m:${uid}`}
            data-remote-marquee={uid}
            className="absolute rounded-[2px]"
            style={{ left: s.x, top: s.y, width: s.width, height: s.height, border: `1px solid ${color}`, background: `color-mix(in srgb, ${color} 8%, transparent)` }}
          />
        );
      })}
      {layout.edits.map((e) => (
        <PresenceEditFrame key={`e:${e.uid}`} uid={e.uid} name={e.name} color={e.color} rect={e.rect} />
      ))}
      {layout.boxes.map((b) => (
        <PresenceBox key={`b:${b.uid}`} uid={b.uid} color={b.color} rect={b.rect} />
      ))}
      {layout.labels.map((l) => (
        <PresenceLabelTag key={`l:${l.uid}`} label={l} />
      ))}
      {showCursors &&
        Object.entries(cursors).map(([uid, c]) => {
          const u = byId.get(uid);
          if (!u || uid === me || now - c.at > CURSOR_IDLE_MS) return null;
          return <RemoteCursor key={uid} name={u.name} color={colorOf(uid)} x={c.x} y={c.y} inertia={inertia} />;
        })}
    </div>
  );
}

/**
 * Um cursor remoto. Com inércia, cada posição nova chega por uma transição CSS com desaceleração (o navegador
 * retoma do ponto em que o cursor está, então os envios a ~30 Hz viram um deslize contínuo). Mover a PRÓPRIA tela
 * redesenha sem transição, para o cursor não ficar para trás. Sem inércia (ou "Reduzir movimento"): salto direto.
 */
function RemoteCursor({ name, color, x, y, inertia }: { name: string; color: string; x: number; y: number; inertia: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const pos = useRef({ x, y });

  const draw = (animate: boolean) => {
    const el = ref.current;
    if (!el) return;
    const p = worldToScreen(pos.current, useBoardStore.getState().camera);
    el.style.transition = animate ? CURSOR_GLIDE : 'none';
    el.style.transform = `translate(${p.x}px, ${p.y}px)`;
  };

  useLayoutEffect(() => draw(false), []);

  // a câmera local mudou: redesenha na hora, sem deslize
  useEffect(
    () =>
      useBoardStore.subscribe((s, prev) => {
        if (s.camera !== prev.camera) draw(false);
      }),
    [],
  );

  useEffect(() => {
    pos.current = { x, y };
    draw(inertia);
  }, [x, y, inertia]);

  return (
    <div ref={ref} className="absolute start-0 top-0" style={{ willChange: 'transform' }} data-remote-cursor>
      <CollaboratorCursor name={name} color={color} style={{ left: 0, top: 0 }} />
    </div>
  );
}
