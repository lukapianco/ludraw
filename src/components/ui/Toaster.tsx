import { CircleCheck, CircleAlert, Info } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { cn } from '../../utils/cn';
import { useT } from '../../i18n/useT';

/**
 * Toasts discretos na base da tela (feedback de ações: exportado, copiado, salvo…).
 * Chat 05: aviso pode ter uma linha de ajuda (`detail`) e um botão de ação (`action`).
 */
export function Toaster() {
  const t = useT();
  const toasts = useAppStore((s) => s.toasts);
  const dismiss = useAppStore((s) => s.dismissToast);
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[1100] flex flex-col items-center gap-2 px-4">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={cn(
            'pointer-events-auto flex max-w-md animate-slide-up items-start gap-2.5 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-pop',
            'bg-ink text-ink-inverse',
          )}
          data-toast
        >
          <button type="button" onClick={() => dismiss(toast.id)} className="flex min-w-0 items-start gap-2.5 text-start" aria-label={t('common.toaster.messageDismissNotice', { message: toast.message })}>
            {toast.tone === 'success' ? (
              <CircleCheck size={17} className="mt-px shrink-0 text-brand-300 dark:text-brand-700" />
            ) : toast.tone === 'danger' ? (
              <CircleAlert size={17} className="mt-px shrink-0 text-[var(--od-danger-on-inverse)]" />
            ) : (
              <Info size={17} className="mt-px shrink-0 opacity-70" />
            )}
            <span className="min-w-0">
              <span className="block">{toast.message}</span>
              {toast.detail && <span className="mt-0.5 block text-xs font-normal opacity-80">{toast.detail}</span>}
            </span>
          </button>
          {toast.action && (
            <button
              type="button"
              className="shrink-0 self-center rounded-lg bg-[rgba(244,249,236,0.14)] px-2.5 py-1 text-xs font-bold hover:bg-[rgba(244,249,236,0.24)] dark:bg-[rgba(18,48,31,0.10)] dark:hover:bg-[rgba(18,48,31,0.18)]"
              onClick={() => {
                dismiss(toast.id);
                toast.action?.run();
              }}
              data-toast-action
            >
              {toast.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
