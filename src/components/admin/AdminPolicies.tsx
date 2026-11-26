import { useEffect, useMemo, useState } from 'react';
import { isValidExtensionId } from '../../extensions/schema';
import { Save, X } from 'lucide-react';
import { MailSettingsSection } from './MailSettings';
import { mailPanelVisible } from '../../utils/featureGates';
import { useAppStore } from '../../store/useAppStore';
import { policiesOf } from '../../store/workspaceSlice';
import type { WorkspacePolicies } from '../../types/workspace';
import { normalizeDomain } from '../../utils/workspace';
import { useT } from '../../i18n/useT';
import { AdminSection, NumberField, Tag, Toggle } from './adminUi';
import { isServerMode } from '../../utils/serverConfig';
import { api } from '../../utils/api';
import type { DomainSignupStatus } from '../../utils/apiContract';

type ExtensionsMode = NonNullable<WorkspacePolicies['allowExtensions']>;

/** Políticas e domínios (`#/admin/policies`) — salvar registra `policy_changed` com antes/depois. */
export function AdminPolicies() {
  // Chat 09 · R5: no multi_org o e-mail é do servidor inteiro — a seção não existe (as rotas também recusam)
  const mailPanel = useAppStore((s) => mailPanelVisible(s.serverInfo?.mode));
  return (
    <>
      <OrganizationForm />
      <PoliciesForm />
      {/* Chat 08.5 · B2: e-mail pelo painel (salva à parte: é do servidor, não é política da organização) */}
      {mailPanel && <MailSettingsSection />}
    </>
  );
}

function OrganizationForm() {
  const t = useT();
  const workspace = useAppStore((s) => s.workspace);
  const updateWorkspace = useAppStore((s) => s.updateWorkspace);
  const toast = useAppStore((s) => s.toast);
  const [name, setName] = useState(workspace.name);
  const [domains, setDomains] = useState<string[]>(workspace.allowedEmailDomains);
  const [requireDomain, setRequireDomain] = useState(workspace.requireDomainForMembers);
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setName(workspace.name);
    setDomains(workspace.allowedEmailDomains);
    setRequireDomain(workspace.requireDomainForMembers);
  }, [workspace]);

  const dirty = name.trim() !== workspace.name || domains.join(',') !== workspace.allowedEmailDomains.join(',') || requireDomain !== workspace.requireDomainForMembers;
  const addDomain = () => {
    const d = normalizeDomain(draft);
    if (!d) return setInvalid(true);
    if (!domains.includes(d)) setDomains([...domains, d]);
    setDraft('');
  };
  const save = () => {
    const r = updateWorkspace({ name, allowedEmailDomains: domains, requireDomainForMembers: requireDomain });
    toast(r.ok ? t('admin.policies.saved') : r.error, r.ok ? 'success' : 'danger');
  };

  return (
    <AdminSection
      title={t('admin.policies.orgTitle')}
      description={t('admin.policies.orgDescription')}
      aside={
        <button type="button" className="od-btn od-btn-primary od-btn-sm" disabled={!dirty} onClick={save}>
          <Save size={15} /> {t('common.save')}
        </button>
      }
    >
      <label className="block">
        <span className="mb-1.5 block text-sm font-semibold text-ink">{t('admin.policies.orgName')}</span>
        <input className="od-input" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="mt-4">
        <span className="mb-1.5 block text-sm font-semibold text-ink">{t('admin.policies.domains')}</span>
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-panel-sunken p-2 ring-1 ring-line">
          {domains.map((d) => (
            <span key={d} className="inline-flex items-center gap-1 rounded-full bg-panel px-2.5 py-1 text-[12.5px] font-semibold text-ink ring-1 ring-line">
              @{d}
              <button type="button" className="text-ink-subtle hover:text-danger" onClick={() => setDomains(domains.filter((x) => x !== d))} aria-label={t('admin.policies.removeDomain', { domain: d })}>
                <X size={13} />
              </button>
            </span>
          ))}
          <input
            className="h-8 min-w-[160px] flex-1 bg-transparent px-1.5 text-[13px] text-ink outline-none placeholder:text-ink-subtle"
            value={draft}
            placeholder={t('admin.policies.domainPlaceholder')}
            aria-invalid={invalid}
            aria-label={t('admin.policies.domains')}
            onChange={(e) => {
              setDraft(e.target.value);
              setInvalid(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addDomain();
              }
            }}
            onBlur={() => draft.trim() && addDomain()}
          />
        </div>
        <span className={`mt-1 block text-xs ${invalid ? 'text-danger' : 'text-ink-subtle'}`}>{invalid ? t('admin.policies.domainInvalid') : t('admin.policies.domainsHint')}</span>
      </div>
      <Toggle checked={requireDomain} onChange={setRequireDomain} label={t('admin.policies.requireDomain')} hint={t('admin.policies.requireDomainHint')} />
    </AdminSection>
  );
}

/** Chat 08.5 · C: política ligada mas inativa (falta e-mail/domínio) ou teto do dia atingido — visível à administração. */
export function DomainSignupNotice({ policy, demo }: { policy: boolean; demo?: DomainSignupStatus }) {
  const t = useT();
  const mailOn = useAppStore((s) => !!s.serverInfo?.email);
  const domains = useAppStore((s) => s.workspace.allowedEmailDomains.join(','));
  const [status, setStatus] = useState<DomainSignupStatus | null>(demo ?? null);
  useEffect(() => {
    if (demo || !api || !isServerMode()) return;
    let alive = true;
    api
      .signupStatus()
      .then((v) => alive && setStatus(v))
      .catch(() => alive && setStatus(null));
    return () => {
      alive = false;
    };
  }, [demo, policy, mailOn, domains]);
  if (!status || !(demo || policy)) return null;
  const missingText = { mail: t('admin.policies.domainSignupMissingMail'), domain: t('admin.policies.domainSignupMissingDomain'), multiOrg: t('admin.policies.domainSignupMissingMultiOrg') };
  return (
    <div className="mb-2 space-y-1.5" data-testid="domain-signup-notice">
      {!status.active && status.missing.length > 0 && (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-ink ring-1 ring-line" role="note">
          <strong>{t('admin.policies.domainSignupInactive')}</strong> {status.missing.map((m) => missingText[m]).join(' · ')}
        </p>
      )}
      {status.reached.length > 0 && (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-ink ring-1 ring-line" role="note" data-testid="domain-signup-reached">
          {t('admin.policies.domainSignupReached', { domains: status.reached.map((r) => r.domain).join(', '), max: status.maxPerDay })}
        </p>
      )}
    </div>
  );
}

function PoliciesForm() {
  const t = useT();
  const current = useAppStore((s) => policiesOf(s));
  const updatePolicies = useAppStore((s) => s.updatePolicies);
  const toast = useAppStore((s) => s.toast);
  const [draft, setDraft] = useState<WorkspacePolicies>(current);
  const [allowlist, setAllowlist] = useState((current.extensionAllowlist ?? []).join(', '));
  useEffect(() => {
    setDraft(current);
    setAllowlist((current.extensionAllowlist ?? []).join(', '));
  }, [current]);

  const set = <K extends keyof WorkspacePolicies>(k: K, v: WorkspacePolicies[K]) => setDraft((d) => ({ ...d, [k]: v }));
  // Chat 07: sem valor na política, vale o padrão do servidor (LUDRAW_ALLOW_LOCAL_MODE)
  const serverLocalAllowed = useAppStore((s) => s.serverInfo?.localMode === 'allowed');
  const next = useMemo<WorkspacePolicies>(() => ({ ...draft, extensionAllowlist: allowlist.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean) }), [draft, allowlist]);
  const changed = (Object.keys(next) as (keyof WorkspacePolicies)[]).filter((k) => JSON.stringify(next[k] ?? null) !== JSON.stringify(current[k] ?? null)).length;
  // Chat 06.5: ids da lista de permitidas precisam ser reverse-dns válidos
  const invalidIds = (next.extensionAllowlist ?? []).filter((id) => !isValidExtensionId(id));
  const save = () => {
    const r = updatePolicies(next);
    toast(r.ok ? t('admin.policies.savedCount', { count: changed }) : r.error, r.ok ? 'success' : 'danger');
  };

  return (
    <AdminSection
      title={t('admin.policies.title')}
      description={t('admin.policies.description')}
      aside={
        <div className="flex items-center gap-2">
          {changed > 0 && <span className="text-xs text-ink-muted">{t('admin.policies.pending', { count: changed })}</span>}
          <button type="button" className="od-btn od-btn-ghost od-btn-sm" disabled={!changed} onClick={() => setDraft(current)}>{t('admin.policies.discard')}</button>
          <button type="button" className="od-btn od-btn-primary od-btn-sm" disabled={!changed || invalidIds.length > 0} title={invalidIds.length ? t('admin.policies.allowlistInvalid', { ids: invalidIds.join(', ') }) : undefined} onClick={save}>
            <Save size={15} /> {t('common.save')}
          </button>
        </div>
      }
    >
      <h3 className="mt-1 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{t('admin.policies.groupLinks')}</h3>
      <div className="divide-y divide-[var(--od-border)]">
        <Toggle checked={draft.allowPublicLinks} onChange={(v) => set('allowPublicLinks', v)} label={t('admin.policies.allowPublicLinks')} hint={t('admin.policies.allowPublicLinksHint')} />
        <Toggle checked={draft.requirePasswordOnPublicLinks} onChange={(v) => set('requirePasswordOnPublicLinks', v)} label={t('admin.policies.requirePassword')} hint={t('admin.policies.requirePasswordHint')} disabled={!draft.allowPublicLinks} />
        <NumberField label={t('admin.policies.maxLifetime')} hint={t('admin.policies.maxLifetimeHint')} value={draft.maxPublicLinkLifetimeDays} allowEmpty emptyLabel={t('admin.policies.noLimit')} onChange={(v) => set('maxPublicLinkLifetimeDays', v)} disabled={!draft.allowPublicLinks} />
        <Toggle checked={draft.allowViewerExport} onChange={(v) => set('allowViewerExport', v)} label={t('admin.policies.allowViewerExport')} hint={t('admin.policies.allowViewerExportHint')} />
      </div>

      <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{t('admin.policies.groupPeople')}</h3>
      <div className="divide-y divide-[var(--od-border)]">
        <Toggle checked={draft.allowGuests} onChange={(v) => set('allowGuests', v)} label={t('admin.policies.allowGuests')} hint={t('admin.policies.allowGuestsHint')} />
        <Toggle checked={draft.allowMembersInviteGuests} onChange={(v) => set('allowMembersInviteGuests', v)} label={t('admin.policies.membersInviteGuests')} disabled={!draft.allowGuests} />
        <NumberField label={t('admin.policies.guestExpiry')} hint={t('admin.policies.guestExpiryHint')} value={draft.guestDefaultExpiryDays} allowEmpty emptyLabel={t('admin.policies.noLimit')} onChange={(v) => set('guestDefaultExpiryDays', v)} disabled={!draft.allowGuests} />
        <Toggle checked={draft.allowMembersCreateTeams} onChange={(v) => set('allowMembersCreateTeams', v)} label={t('admin.policies.membersCreateProjects')} hint={t('admin.policies.membersCreateProjectsHint')} />
        {/* Chat 08.5 · B: "Pedir acesso" na entrada (só com servidor; desligado por padrão) */}
        {isServerMode() && <Toggle checked={draft.allowAccessRequests === true} onChange={(v) => set('allowAccessRequests', v)} label={t('admin.policies.allowAccessRequests')} hint={t('admin.policies.allowAccessRequestsHint')} />}
        {/* Chat 08.5 · C: o servidor recusa ligar sem e-mail ou sem domínio; aqui aparece o que falta e o teto do dia */}
        {isServerMode() && (
          <div>
            <Toggle checked={draft.allowDomainSignup === true} onChange={(v) => set('allowDomainSignup', v)} label={t('admin.policies.allowDomainSignup')} hint={t('admin.policies.allowDomainSignupHint')} />
            <DomainSignupNotice policy={current.allowDomainSignup === true} />
          </div>
        )}
      </div>

      {isServerMode() && (
        <>
          <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{t('admin.policies.groupServer')}</h3>
          <div className="divide-y divide-[var(--od-border)]">
            <Toggle checked={draft.allowLocalMode ?? serverLocalAllowed} onChange={(v) => set('allowLocalMode', v)} label={t('admin.policies.allowLocalMode')} hint={t('admin.policies.allowLocalModeHint')} />
            <Toggle checked={draft.distinctPresenceColors !== false} onChange={(v) => set('distinctPresenceColors', v)} label={t('admin.policies.distinctPresenceColors')} hint={t('admin.policies.distinctPresenceColorsHint')} />
          </div>
        </>
      )}

      <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{t('admin.policies.groupRetention')}</h3>
      <div className="divide-y divide-[var(--od-border)]">
        <NumberField label={t('admin.policies.trashRetention')} hint={t('admin.policies.trashRetentionHint')} value={draft.trashRetentionDays} onChange={(v) => set('trashRetentionDays', v ?? 30)} />
        <NumberField label={t('admin.policies.snapshotRetention')} hint={t('admin.policies.snapshotHint')} value={draft.snapshotRetentionDays} onChange={(v) => set('snapshotRetentionDays', v ?? 30)} />
        <NumberField label={t('admin.policies.snapshotInterval')} hint={t('admin.policies.snapshotHint')} value={draft.autoSnapshotIntervalMin} onChange={(v) => set('autoSnapshotIntervalMin', v ?? 15)} />
      </div>

      <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{t('admin.policies.groupExtensions')}</h3>
      <div className="divide-y divide-[var(--od-border)]">
        <label className="flex flex-wrap items-center justify-between gap-3 py-2.5">
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink">{t('admin.policies.extensions')}</span>
            <span className="mt-0.5 block text-xs text-ink-muted">{t('admin.policies.extensionsHint')}</span>
          </span>
          <select className="od-input h-9 w-auto text-[13px]" value={draft.allowExtensions ?? 'all'} onChange={(e) => set('allowExtensions', e.target.value as ExtensionsMode)}>
            <option value="all">{t('admin.policies.extensionsAll')}</option>
            <option value="packs_only">{t('admin.policies.extensionsPacks')}</option>
            <option value="none">{t('admin.policies.extensionsNone')}</option>
          </select>
        </label>
        <label className="block py-2.5">
          <span className="block text-sm font-semibold text-ink">{t('admin.policies.allowlist')}</span>
          <span className="mt-0.5 block text-xs text-ink-muted">{t('admin.policies.allowlistHint')}</span>
          <input className="od-input mt-2 font-mono text-[12.5px]" value={allowlist} onChange={(e) => setAllowlist(e.target.value)} disabled={(draft.allowExtensions ?? 'all') === 'none'} aria-invalid={invalidIds.length > 0} />
          {(next.extensionAllowlist ?? []).length > 0 && (
            <span className="mt-2 flex flex-wrap gap-1.5">
              {(next.extensionAllowlist ?? []).map((id) => (
                <Tag key={id} tone={isValidExtensionId(id) ? 'brand' : 'warning'}>
                  <span className="font-mono">{id}</span>
                </Tag>
              ))}
            </span>
          )}
          {invalidIds.length > 0 && <span className="mt-1.5 block text-xs text-warning">{t('admin.policies.allowlistInvalid', { ids: invalidIds.join(', ') })}</span>}
        </label>
      </div>
    </AdminSection>
  );
}
