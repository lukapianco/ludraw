/**
 * LuDraw i18n — liga a preferência salva (`preferences.locale`) ao motor (Chat 05.6).
 *
 * - Preferência ausente = "Seguir o navegador": reage ao evento `languagechange`.
 * - `<html lang dir>` é atualizado pelo motor a cada troca (`setLocale`).
 * - A troca vale na hora: componentes com `useT()` re-renderizam; o `App` também assina o idioma,
 *   então as telas abaixo dele são redesenhadas sem recarregar a página.
 */
import { useEffect, useLayoutEffect, type ReactNode } from 'react';
import { useAppStore } from '../store/useAppStore';
import { applyLocalePreference } from './index';

export function I18nProvider({ children }: { children: ReactNode }) {
  const preference = useAppStore((s) => s.preferences.locale ?? null);

  useLayoutEffect(() => {
    applyLocalePreference(preference);
  }, [preference]);

  useEffect(() => {
    if (preference) return;
    const onChange = () => applyLocalePreference(null);
    window.addEventListener('languagechange', onChange);
    return () => window.removeEventListener('languagechange', onChange);
  }, [preference]);

  return <>{children}</>;
}
