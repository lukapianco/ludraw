import { useSyncExternalStore } from 'react';
import { currentCollab, onCollabChange, type CollabSession } from './session';

/** A sessão de edição ao vivo do board aberto (ou null). Re-renderiza quando o estado muda. */
export function useCollabSession(): CollabSession | null {
  return useSyncExternalStore(
    (cb) => onCollabChange(() => cb()),
    () => snapshot(),
  );
}

// `useSyncExternalStore` precisa de um valor estável entre leituras: a sessão é mutada no lugar, então o
// instantâneo é uma cópia rasa nova só quando `emit` é chamado.
let last: CollabSession | null = null;
let lastStatus = '';
function snapshot(): CollabSession | null {
  const cur = currentCollab();
  const key = cur ? `${cur.boardId}|${cur.status}|${cur.readOnly}` : '';
  if (key !== lastStatus) {
    lastStatus = key;
    last = cur ? { ...cur } : null;
  }
  return last;
}
