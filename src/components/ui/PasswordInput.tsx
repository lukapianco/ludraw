import { useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useT } from '../../i18n/useT';

/**
 * Chat 07 · B — campo de senha com o botão de mostrar/esconder (mesmo desenho do campo da entrada).
 * Use no lugar de `<input type="password">`; aceita as mesmas propriedades do input.
 */
export function PasswordInput({ className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const t = useT();
  const [visible, setVisible] = useState(false);
  return (
    <span className="relative block">
      <input {...props} type={visible ? 'text' : 'password'} className={cn('pe-10', className)} />
      <button
        type="button"
        className="absolute end-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-panel-hover hover:text-ink"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t('server.passwordInput.hide') : t('server.passwordInput.show')}
        aria-pressed={visible}
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </span>
  );
}
