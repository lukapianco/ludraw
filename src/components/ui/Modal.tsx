import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useT } from '../../i18n/useT';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
  className?: string;
}

/** Modal com overlay suave, fecha com Esc/clique fora. */
export function Modal({ open, onClose, title, description, icon, children, footer, width = 480, className }: ModalProps) {
  const t = useT();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[950] flex animate-fade-in items-center justify-center bg-[rgba(12,22,16,0.38)] p-4 backdrop-blur-[2px] dark:bg-[rgba(0,0,0,0.55)]"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-od-menu
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn('relative w-full animate-modal-in rounded-2xl bg-panel shadow-modal', className)}
        style={{ maxWidth: width }}
      >
        <button type="button" onClick={onClose} className="od-tool absolute end-3 top-3 h-8 w-8" aria-label={t('common.close')}>
          <X size={18} />
        </button>
        {(title || icon) && (
          <div className="flex items-start gap-3 px-6 pb-2 pt-6">
            {icon && <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-brand-900 dark:text-brand-200">{icon}</div>}
            <div className="min-w-0 pe-8">
              {title && <h2 className="text-lg font-bold text-ink">{title}</h2>}
              {description && <p className="mt-1 text-base text-ink-muted">{description}</p>}
            </div>
          </div>
        )}
        {children && <div className="px-6 py-3">{children}</div>}
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 px-6 pb-6 pt-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
