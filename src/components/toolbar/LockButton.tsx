import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { cn } from '../../utils/cn';
import { Tooltip } from '../ui/Tooltip';
import { LockIcon, UnlockIcon } from '../icons/od';
import { useT } from '../../i18n/useT';

/** Tempo para destravar segurando (mouse ou teclado). */
export const HOLD_MS = 2000;
const R = 15;
const LEN = 2 * Math.PI * R;

interface LockButtonProps {
  locked: boolean;
  onLock: () => void;
  onUnlock: () => void;
}

/**
 * Bloquear da Cinta (Chat 08.2 · C-2, `STUDIO_V2_SPEC.md` §16.2).
 *  - Destravado → o clique trava na hora (nível padrão, Ctrl + Shift + L).
 *  - Travado → é preciso SEGURAR 2 s: com o mouse (botão pressionado) OU com o teclado (Enter/Espaço pressionados). Um
 *    ANEL de progresso em volta do ícone mostra o tempo; soltar antes cancela (o anel volta). Dica curta: "Segure 2 s
 *    para destravar" (antes era um texto comprido dentro da barra).
 */
export function LockButton({ locked, onLock, onUnlock }: LockButtonProps) {
  const t = useT();
  const [holding, setHolding] = useState(false);
  const [done, setDone] = useState(false);
  const timer = useRef<number | null>(null);
  /** Evita que o "click" disparado ao soltar (mouse ou Espaço) depois de destravar trave de novo. */
  const suppressClick = useRef(false);

  const cancel = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  const start = () => {
    if (!locked || timer.current) return;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setHolding(false);
      setDone(true);
      suppressClick.current = true;
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 600);
      onUnlock();
    }, HOLD_MS);
  };

  useEffect(() => cancel, []);
  useEffect(() => {
    if (!locked) setDone(false);
  }, [locked]);

  const isHoldKey = (e: ReactKeyboardEvent) => e.key === 'Enter' || e.key === ' ';

  return (
    <Tooltip label={locked ? t('board.lockButton.hold2SUnlock') : t('board.lockButton.lock')} shortcut={locked ? undefined : 'Ctrl + Shift + L'} side="top" disabled={holding}>
      <button
        type="button"
        data-lock-button
        data-locked={locked}
        data-holding={holding}
        aria-label={locked ? t('board.lockButton.unlockHold2Seconds') : t('board.lockButton.lock')}
        aria-pressed={locked}
        className={cn('od-tool relative', locked && 'text-brand-800 dark:text-brand-200')}
        data-active={locked}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          if (!locked) onLock();
        }}
        onPointerDown={(e) => {
          if (e.button === 0) start();
        }}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onKeyDown={(e) => {
          if (!locked || !isHoldKey(e)) return;
          // segurar Enter/Espaço = segurar o botão (a repetição da tecla não reinicia o tempo)
          e.preventDefault();
          e.stopPropagation();
          if (!e.repeat) start();
        }}
        onKeyUp={(e) => {
          if (!isHoldKey(e)) return;
          if (locked) e.preventDefault();
          cancel();
        }}
        onBlur={cancel}
      >
        {/* anel de progresso: 2 s lineares ao segurar; volta suave ao soltar */}
        <svg aria-hidden="true" viewBox="0 0 36 36" className="pointer-events-none absolute inset-0 h-full w-full -rotate-90" data-lock-ring>
          <circle
            cx="18"
            cy="18"
            r={R}
            fill="none"
            stroke="var(--od-selection)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={LEN}
            strokeDashoffset={holding ? 0 : LEN}
            style={{ transition: holding ? `stroke-dashoffset ${HOLD_MS}ms linear` : 'stroke-dashoffset 220ms cubic-bezier(0.22, 1, 0.36, 1)' }}
          />
        </svg>
        <span className="relative">{locked && !done ? <LockIcon size={18} /> : <UnlockIcon size={18} />}</span>
      </button>
    </Tooltip>
  );
}
