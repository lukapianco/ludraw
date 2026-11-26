import { useMemo } from 'react';
import { useLocale, useT } from '../../i18n/useT';
import type { MailKind, MailLang } from '../../utils/apiContract';
import { mailBannerArtFor, mailBannerDataUrl } from '../../utils/mailBanners';
import { composeMail, type MailParams } from '../../utils/mailLayout';

/** Exemplos de parâmetros por tipo (dados fictícios). */
const SAMPLE: Record<MailKind, { url?: string; params?: MailParams }> = {
  invitation: { url: 'https://draw.example.com/#/invite/K7f2Qm9xL4', params: { inviter: 'Ana Souza', role: 'membro', days: 7 } },
  resetPassword: { url: 'https://draw.example.com/#/reset/c2VjcmV0LXRva2Vu', params: { minutes: 30 } },
  resetPasswordSso: { url: 'https://draw.example.com/#/login', params: { provider: 'Login da empresa' } },
  verifyEmail: { url: 'https://draw.example.com/#/verify/dmVyaWZ5LXRva2Vu', params: { minutes: 60 } },
  testMail: {},
  joinLink: { url: 'https://draw.example.com/#/signup/c2lnbnVwLXRva2Vu', params: { minutes: 60 } },
  joinExisting: { url: 'https://draw.example.com/#/login' },
  accessConfirm: { url: 'https://draw.example.com/#/access/YWNjZXNzLXRva2Vu', params: { minutes: 60 } },
  accessExisting: { url: 'https://draw.example.com/#/login' },
  domainSignup: { url: 'https://draw.example.com/#/signup/ZG9tYWluLXRva2Vu', params: { minutes: 60 } },
};

const KINDS = Object.keys(SAMPLE) as MailKind[];

/**
 * Chat 08.5 · B2 — prévia dos e-mails com o MESMO montador do servidor (`composeMail`). Aqui a faixa entra
 * em SVG; no e-mail de verdade ela vai como PNG embutido. Uma ilustração por tipo de e-mail.
 */
export function MailPreviews({ kinds = KINDS }: { kinds?: MailKind[] } = {}) {
  const t = useT();
  const locale = useLocale();
  const lang: MailLang = locale === 'en' ? 'en' : 'pt-BR';
  const mails = useMemo(
    () =>
      kinds.map((kind) => {
        const sample = SAMPLE[kind];
        return {
          kind,
          ...composeMail({ kind, lang, org: 'Empresa Exemplo', url: sample.url, params: sample.params, translate: (key, params) => t(key as never, params as never), bannerSrc: mailBannerDataUrl(mailBannerArtFor(kind)) }),
        };
      }),
    [kinds, lang, t],
  );
  return (
    <div className="grid gap-6 2xl:grid-cols-2" data-testid="mail-previews">
      {mails.map((m) => (
        <figure key={m.kind} className="min-w-0">
          <figcaption className="mb-2 text-xs font-semibold text-ink-muted">
            <code>{m.kind}</code> · {m.subject}
          </figcaption>
          <iframe title={m.subject} srcDoc={m.html} sandbox="" className="h-[760px] w-full rounded-2xl bg-white ring-1 ring-line" data-mail-kind={m.kind} />
        </figure>
      ))}
    </div>
  );
}
