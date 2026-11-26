/**
 * LuDraw — Chat 09.1 · R7: tela "onde trabalhar" do programa desktop (documento local `desktop`, o único com a ponte).
 *
 * - Primeira abertura: escolhe Modo Local ou o servidor da organização. A escolha fica guardada no computador.
 * - Servidor lembrado: testa e segue sozinha; com problema, explica e deixa tentar de novo ou usar o Modo Local
 *   (o servidor nunca é obrigatório).
 * - Não existe "criar organização" aqui.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useT } from '../../i18n/useT';
import { getLocale, PSEUDO_LOCALE } from '../../i18n';
import { useAppStore } from '../../store/useAppStore';
import type { ServerInfo } from '../../utils/apiContract';
import { desktopBridge } from '../../utils/desktop';
import { diagnoseServer, ssoOriginOf, type ServerProblem } from '../../utils/desktopRules';
import { CLIENT_API_VERSION, normalizeServerUrl, probeInfo } from '../../utils/serverConfig';
import { Logo } from '../ui/Logo';
import { DesktopPlaceCard, type ServerStep } from './DesktopPlaceCard';

const PROBE_MS = 8000;

/** Idioma que o menu nativo passa a usar (o pseudo-idioma dos testes não é gravado). */
const langToSave = () => (getLocale() === PSEUDO_LOCALE ? 'en' : getLocale());

/** Uma requisição simples chega ao endereço? (a resposta não é lida; falha = rede, porta ou certificado) */
async function reachable(url: string): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_MS);
  try {
    await fetch(`${url}/`, { mode: 'no-cors', credentials: 'omit', cache: 'no-store', signal: ctrl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function testServer(raw: string): Promise<{ url: string; info: ServerInfo | null; problem: ServerProblem | null }> {
  const url = normalizeServerUrl(raw);
  if (!url) return { url: '', info: null, problem: 'invalidUrl' };
  const info = await probeInfo(url, PROBE_MS);
  const reached = info ? true : await reachable(url);
  const port = reached ? null : await desktopBridge.probePort(url).catch(() => 'closed' as const);
  const problem = diagnoseServer({ validUrl: true, https: url.startsWith('https:'), info, reachable: reached, port, clientApiVersion: CLIENT_API_VERSION });
  return { url, info, problem };
}

export function DesktopWelcome() {
  const t = useT();
  const theme = useAppStore((s) => s.theme);
  const reduceMotion = useAppStore((s) => s.preferences.reduceMotion);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const [url, setUrl] = useState('');
  const [step, setStep] = useState<ServerStep>({ step: 'idle' });
  const [localFailed, setLocalFailed] = useState(false);
  const [version, setVersion] = useState('');
  const started = useRef(false);
  /** Cada tentativa tem um número: cancelar ou digitar de novo invalida a anterior. */
  const attempt = useRef(0);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.classList.toggle('od-reduce-motion', reduceMotion);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#16161A' : '#194B32');
  }, [theme, reduceMotion]);

  const connect = useCallback(async (raw: string) => {
    const mine = ++attempt.current;
    const normalized = normalizeServerUrl(raw);
    setStep(normalized ? { step: 'connecting', host: new URL(normalized).host } : { step: 'problem', problem: 'invalidUrl' });
    if (!normalized) return;
    const result = await testServer(raw);
    if (mine !== attempt.current) return;
    if (result.problem || !result.info) {
      setStep({ step: 'problem', problem: result.problem ?? 'notLuDraw' });
      return;
    }
    try {
      await desktopBridge.useServer(result.url, result.info.sso.enabled ? ssoOriginOf(result.info) : null, langToSave());
    } catch (e) {
      if (mine === attempt.current) setStep({ step: 'failed', reason: String(e).includes('save-failed') ? 'saveFailed' : 'openFailed' });
    }
  }, []);

  useEffect(() => {
    if (started.current) return; // StrictMode monta duas vezes; a abertura automática é uma só
    started.current = true;
    void desktopBridge
      .state()
      .then((s) => {
        setVersion(s.version);
        if (s.place?.mode !== 'server') return;
        const saved = s.place.url.replace(/\/+$/, '');
        setUrl(saved);
        if (s.auto) void connect(saved);
      })
      .catch(() => undefined);
  }, [connect]);

  const test = async () => {
    const mine = ++attempt.current;
    setStep({ step: 'testing' });
    const result = await testServer(url);
    if (mine !== attempt.current) return;
    setStep(result.problem || !result.info ? { step: 'problem', problem: result.problem ?? 'notLuDraw' } : { step: 'ok', info: result.info });
  };

  const useLocal = async () => {
    attempt.current++;
    setLocalFailed(false);
    try {
      await desktopBridge.useLocal(langToSave());
    } catch {
      setLocalFailed(true);
    }
  };

  const themeLabel = theme === 'dark' ? t('common.lightMode') : t('common.darkMode');
  return (
    <div className="flex min-h-full flex-col bg-[var(--od-app-bg)]">
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <Logo markSize={28} />
        <button type="button" className="od-tool" onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </header>
      <main className="flex flex-1 items-center justify-center px-5 pb-8 sm:px-8">
        <DesktopPlaceCard
          url={url}
          step={step}
          onUrl={(v) => {
            attempt.current++;
            setUrl(v);
            setStep({ step: 'idle' });
          }}
          onLocal={() => void useLocal()}
          onTest={() => void test()}
          onConnect={() => void connect(url)}
          onCancel={() => {
            attempt.current++;
            setStep({ step: 'idle' });
          }}
          localFailed={localFailed}
        />
      </main>
      <footer className="px-5 pb-5 text-center text-xs text-ink-subtle sm:px-8">{version && t('desktop.welcome.version', { version })}</footer>
    </div>
  );
}
