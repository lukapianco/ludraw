import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronDown, Cpu, FileArchive, FolderOpen, Fingerprint, Palette, Puzzle, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { extensionContext, shortHash, useExtensionsStore, type InstalledExtension } from '../../store/useExtensionsStore';
import { contributionCounts, type ContributionCounts } from '../../extensions/registry';
import { ThemeRegistry, useRegistry } from '../../extensions/registries';
import { localizedDescription, localizedName, type ValidationIssue } from '../../extensions/schema';
import type { InstallPreview } from '../../extensions/loader';
import type { ExtensionManifest } from '../../extensions/types';
import type { MessageDescriptor } from '../../i18n/types';
import { translateMessage } from '../../i18n';
import { formatDateTime } from '../../i18n/format';
import { useLocale, useT } from '../../i18n/useT';
import { useWorkspaceCan } from '../../hooks/useWorkspace';
import { explainExtension } from '../../utils/permissions';
import { cn } from '../../utils/cn';
import { ConfirmButton, Tag, Toggle } from '../admin/adminUi';
import { Notice } from '../share/ShareBoardModal';
import { Modal } from '../ui/Modal';
import { ElevatedRiskNotice, PermissionList } from './ExtensionPermissions';
import { KILL_REASON_KEYS } from '../../store/useExtensionsStore';
import { useExtensionRuntimeStore } from '../../store/useExtensionRuntimeStore';
import { isElevatedRisk } from '../../extensions/schema';
import { formatDateTime as formatWhen } from '../../i18n/format';
import type { KillReason } from '../../extensions/host/connection';

/**
 * Chat 06.5 · Rodada A — Gerenciador de Extensões (Configurações → Extensões, pessoal deste navegador).
 *
 * Diferença do padrão de mercado: não há loja nem busca remota — a instalação é só por arquivo local,
 * e cada extensão aparece como uma "ficha" com licença, proveniência e hash visíveis ANTES de ativar.
 * A política do workspace (`allowExtensions`, `extensionAllowlist`) aparece só para leitura (edição em
 * `#/admin/policies`); toda decisão passa por `can()`/`explainExtension`.
 */
export function ExtensionsManager() {
  const t = useT();
  const locale = useLocale();
  const store = useExtensionsStore();
  const policies = useAppStore((s) => s.workspace.policies);
  // assina sessão e "Visualizar como…" para os motivos de bloqueio acompanharem
  useAppStore((s) => `${s.session.userId}|${s.session.workspaceRole}|${JSON.stringify(s.session.viewAs)}|${!!s.linkSession}`);
  const manage = useWorkspaceCan('extensions.manage');
  const devFolders = useWorkspaceCan('extensions.useScripts');
  const canEditPolicy = useWorkspaceCan('workspace.policies.manage');
  const navigate = useAppStore((s) => s.navigate);
  const toast = useAppStore((s) => s.toast);
  const themes = useRegistry(ThemeRegistry);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<InstallPreview | null>(null);
  const [failure, setFailure] = useState<{ error: MessageDescriptor; issues?: ValidationIssue[] } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    folderRef.current?.setAttribute('webkitdirectory', '');
  }, []);

  const safe = store.safeMode.url || store.safeMode.persisted;
  const mode = policies?.allowExtensions ?? 'all';
  const allowlist = policies?.extensionAllowlist ?? [];
  const builtins = store.extensions.filter((e) => e.builtin);
  const installed = store.extensions.filter((e) => !e.builtin);

  const run = async (input: Parameters<typeof store.prepareInstall>[0]) => {
    setBusy(true);
    try {
      const r = await store.prepareInstall(input);
      if (r.ok) setPreview(r.preview);
      else setFailure({ error: r.error, issues: r.issues });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-panel p-5 shadow-panel md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-ink">{t('extensions.manager.title')}</h2>
            <p className="mt-1 max-w-[60ch] text-sm text-ink-muted">{t('extensions.manager.intro')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="od-btn od-btn-primary" disabled={!manage.allowed || busy} title={manage.reason} onClick={() => fileRef.current?.click()}>
              <FileArchive size={16} /> {t('extensions.manager.installFile')}
            </button>
            <button
              type="button"
              className="od-btn od-btn-ghost"
              disabled={!manage.allowed || !devFolders.allowed || busy}
              title={!manage.allowed ? manage.reason : devFolders.allowed ? t('extensions.manager.devFolderHint') : t('permissions.denied.extensionsDevPolicy')}
              onClick={() => folderRef.current?.click()}
            >
              <FolderOpen size={16} /> {t('extensions.manager.installFolder')}
            </button>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".ludraw-ext,.zip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void run({ kind: 'zip', file });
          }}
        />
        <input
          ref={folderRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            if (files.length) void run({ kind: 'folder', files });
          }}
        />

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl bg-panel-sunken p-3.5 ring-1 ring-line">
            <div className="text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{t('extensions.manager.policyTitle')}</div>
            <div className="mt-1 text-sm font-semibold text-ink">{t(mode === 'none' ? 'extensions.manager.policyNone' : mode === 'packs_only' ? 'extensions.manager.policyPacksOnly' : 'extensions.manager.policyAll')}</div>
            <div className="mt-0.5 text-xs text-ink-subtle">{allowlist.length ? t('extensions.manager.policyAllowlist', { count: allowlist.length }) : t('extensions.manager.policyAnyId')}</div>
            {canEditPolicy.allowed && (
              <button type="button" className="mt-2 text-xs font-semibold text-brand-700 underline-offset-2 hover:underline dark:text-brand-300" onClick={() => navigate({ name: 'admin', section: 'policies' })}>
                {t('extensions.manager.editPolicy')}
              </button>
            )}
          </div>
          <div className={cn('rounded-xl p-3.5 ring-1 ring-line', safe ? 'bg-warning-soft' : 'bg-panel-sunken')}>
            <Toggle checked={store.safeMode.persisted} onChange={(on) => void store.setSafeMode(on)} label={t('extensions.manager.safeMode')} hint={t('extensions.manager.safeModeHint')} />
            {store.safeMode.url && <p className="mt-2 text-xs text-ink">{t('extensions.manager.safeModeUrl')}</p>}
          </div>
        </div>

        {!store.persistent && (
          <div className="mt-3">
            <Notice tone="warning">{t('history.storage.fallbackDetail')}</Notice>
          </div>
        )}
        {!manage.allowed && manage.reason && (
          <div className="mt-3">
            <Notice tone="info">{manage.reason}</Notice>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-ink" htmlFor="od-ext-theme-select">
            <Palette size={16} className="text-ink-muted" /> {t('extensions.manager.themeLabel')}
          </label>
          <select
            id="od-ext-theme-select"
            className="od-input max-w-[280px]"
            value={store.themeChoice && themes.some((th) => th.id === store.themeChoice) ? store.themeChoice : ''}
            disabled={!themes.length || safe}
            onChange={(e) => void store.setTheme(e.target.value || null)}
          >
            <option value="">{t('extensions.manager.themeCore')}</option>
            {themes.map((th) => (
              <option key={th.id} value={th.id}>
                {th.label}
              </option>
            ))}
          </select>
          {!themes.length && <span className="text-xs text-ink-subtle">{t('extensions.manager.themeNone')}</span>}
        </div>
      </section>

      <ExtensionList title={t('extensions.manager.builtinTitle')} hint={t('extensions.manager.builtinHint')} items={builtins} locale={locale} safe={safe} />
      <ExtensionList title={t('extensions.manager.installedTitle')} hint={t('extensions.manager.installedHint')} items={installed} locale={locale} safe={safe} empty={t('extensions.manager.installedEmpty')} />

      <InstallDialog
        preview={preview}
        locale={locale}
        onClose={() => setPreview(null)}
        onConfirm={async () => {
          if (!preview) return;
          const r = await store.confirmInstall(preview);
          setPreview(null);
          if (r.ok) toast(t(preview.existing ? 'extensions.manager.updated' : 'extensions.manager.installed', { name: localizedName(preview.manifest, locale) }), 'success');
          else toast(r.error, 'danger');
        }}
      />
      <Modal open={!!failure} onClose={() => setFailure(null)} title={t('extensions.manager.failedTitle')} icon={<AlertTriangle size={18} />} width={560}>
        {failure && (
          <div className="space-y-3">
            <p className="text-sm text-ink">{translateMessage(failure.error)}</p>
            {!!failure.issues?.length && (
              <ul className="max-h-[300px] space-y-1.5 overflow-y-auto rounded-xl bg-danger-soft p-3 text-sm">
                {failure.issues.map((i, idx) => (
                  <li key={idx} className="text-danger">
                    <code className="me-1.5 rounded bg-panel px-1 py-0.5 text-2xs text-ink-muted">{i.path}</code>
                    {translateMessage(i.message)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function ExtensionList({ title, hint, items, locale, safe, empty }: { title: string; hint: string; items: InstalledExtension[]; locale: string; safe: boolean; empty?: string }) {
  return (
    <section>
      <div className="mb-2 px-1">
        <h3 className="text-sm font-bold text-ink">{title}</h3>
        <p className="text-xs text-ink-subtle">{hint}</p>
      </div>
      {items.length === 0 && empty ? <div className="rounded-2xl bg-panel px-5 py-6 text-center text-sm text-ink-subtle shadow-panel">{empty}</div> : null}
      <div className="space-y-3">
        {items.map((ext) => (
          <ExtensionCard key={ext.record.id} ext={ext} locale={locale} safe={safe} />
        ))}
      </div>
    </section>
  );
}

/** Ficha de uma extensão (também usada no Design System › Telas e fluxos › Extensões). */
export function ExtensionCard({ ext, locale, safe, defaultOpen = false }: { ext: InstalledExtension; locale: string; safe: boolean; defaultOpen?: boolean }) {
  const t = useT();
  const store = useExtensionsStore();
  const toast = useAppStore((s) => s.toast);
  const [open, setOpen] = useState(defaultOpen);
  const [approving, setApproving] = useState(false);
  const runtime = useExtensionRuntimeStore((s) => s.states[ext.record.id]);
  const network = useExtensionRuntimeStore((s) => s.network).filter((n) => n.extensionId === ext.record.id);
  const { record, manifest } = ext;
  const name = manifest ? localizedName(manifest, locale) : record.name;
  const description = manifest ? localizedDescription(manifest, locale) : undefined;
  const policy = explainExtension(extensionContext(), { id: record.id, kind: record.kind, dev: record.dev });
  const active = store.activeIds.includes(record.id);
  const toggleDisabled = (!record.enabled && (!policy.allowed || ext.status !== 'ok')) || safe;
  const reason = safe ? translateMessage({ key: 'extensions.manager.safeModeActive' }) : !policy.allowed && policy.reason ? translateMessage(policy.reason) : ext.problem ? translateMessage(ext.problem) : undefined;

  return (
    <article className={cn('rounded-2xl bg-panel p-4 shadow-panel md:p-5', ext.status !== 'ok' && 'ring-1 ring-[var(--od-danger)]')} data-extension-id={record.id} data-active={active ? 'true' : 'false'}>
      <div className="flex flex-wrap items-start gap-3">
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', active ? 'bg-accent-soft text-brand-900 dark:text-brand-200' : 'bg-panel-sunken text-ink-muted')}>
          <Puzzle size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h4 className="text-[15px] font-bold text-ink">{name}</h4>
            <span className="text-xs text-ink-subtle">{record.version}</span>
            {ext.builtin && <Tag tone="brand">{t('extensions.manager.tagOfficial')}</Tag>}
            <Tag>{record.kind === 'script' ? t('extensions.manager.tagScript') : t('extensions.manager.tagPack')}</Tag>
            {record.dev && <Tag tone="warning">{t('extensions.manager.tagDev')}</Tag>}
            {ext.status === 'tampered' && <Tag tone="warning">{t('extensions.manager.tagTampered')}</Tag>}
            {ext.status === 'invalid' && <Tag tone="warning">{t('extensions.manager.tagInvalid')}</Tag>}
            {active && <Tag tone="brand">{t('extensions.manager.tagActive')}</Tag>}
          </div>
          <div className="text-xs text-ink-subtle">{t('extensions.manager.byPublisher', { publisher: record.publisher })}</div>
          {description && <p className="mt-1.5 text-sm text-ink-muted">{description}</p>}
          {reason && (record.enabled || ext.status !== 'ok' || !policy.allowed) && <p className="mt-1.5 text-xs text-warning">{reason}</p>}
        </div>
      </div>
      {/* interruptor numa faixa própria: funciona em qualquer largura (lista e frame do Design System) */}
      <div className="mt-3 rounded-xl bg-panel-sunken px-3 ring-1 ring-line">
        <Toggle
          checked={record.enabled && !safe}
          disabled={toggleDisabled}
          onChange={async (on) => {
            const r = await store.setEnabled(record.id, on);
            if (!r.ok && r.needsApproval) setApproving(true);
            else if (!r.ok) toast(r.error, 'danger');
          }}
          label={record.enabled && !safe ? t('extensions.manager.on') : t('extensions.manager.off')}
        />
      </div>

      <button type="button" className="mt-3 flex items-center gap-1 text-xs font-semibold text-ink-muted hover:text-ink" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <ChevronDown size={14} className={cn('transition-transform duration-base ease-out', open && 'rotate-180')} />
        {t('extensions.manager.details')}
      </button>
      {open && (
        <div className="mt-3 grid animate-fade-in gap-3 border-t border-line pt-3 text-sm md:grid-cols-2">
          <Detail label={t('extensions.manager.license')}>{manifest?.license ?? '—'}</Detail>
          <Detail label={t('extensions.manager.source')}>{t(record.source === 'builtin' ? 'extensions.manager.sourceBuiltin' : record.source === 'folder' ? 'extensions.manager.sourceFolder' : 'extensions.manager.sourceFile')}</Detail>
          <Detail label={t('extensions.manager.provenance')}>{manifest ? <ProvenanceText manifest={manifest} /> : '—'}</Detail>
          <Detail label={t('extensions.manager.permissions')} wide>
            {manifest ? (
              <PermissionList
                manifest={manifest}
                approved={record.approvedPermissions}
                onToggle={
                  record.kind === 'script'
                    ? async (perm, granted) => {
                        const r = await store.setPermission(record.id, perm, granted);
                        if (!r.ok) toast(r.error, 'danger');
                      }
                    : undefined
                }
              />
            ) : (
              '—'
            )}
          </Detail>
          {record.kind === 'script' && (
            <Detail label={t('extensions.manager.runtime')} wide>
              <span className="inline-flex flex-wrap items-center gap-2">
                <Cpu size={14} className="text-ink-muted" />
                {runtime?.state === 'running'
                  ? t('extensions.manager.runtimeRunning')
                  : runtime?.state === 'starting'
                    ? t('extensions.manager.runtimeStarting')
                    : runtime?.state === 'killed'
                      ? t('extensions.manager.runtimeKilled', { reason: t(KILL_REASON_KEYS[(runtime.reason as KillReason) ?? 'error'] ?? 'extensions.kill.error') })
                      : t('extensions.manager.runtimeStopped')}
                {runtime?.state === 'killed' && (
                  <button type="button" className="od-btn od-btn-ghost od-btn-sm" onClick={() => store.restart(record.id)}>
                    <RotateCcw size={14} /> {t('extensions.manager.restart')}
                  </button>
                )}
              </span>
              {network.length > 0 && (
                <div className="mt-2">
                  <div className="text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{t('extensions.manager.networkLog')}</div>
                  <ul className="mt-1 space-y-0.5 font-mono text-2xs text-ink-muted">
                    {network.slice(-8).map((n, i) => (
                      <li key={i} className={n.ok ? undefined : 'text-danger'}>
                        {n.ok ? t('extensions.manager.networkEntry', { host: n.host, time: formatWhen(n.at) }) : t('extensions.manager.networkBlocked', { host: n.host, time: formatWhen(n.at) })}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Detail>
          )}
          <Detail label={t('extensions.manager.contributions')}>{manifest ? <CountsText counts={contributionCounts(manifest)} /> : '—'}</Detail>
          {record.installedAt > 0 && <Detail label={t('extensions.manager.installedAt')}>{formatDateTime(record.updatedAt || record.installedAt)}</Detail>}
          {record.packageHash && (
            <Detail label={t('extensions.manager.hash')} wide>
              <span className="inline-flex items-center gap-1.5 font-mono text-xs text-ink">
                <Fingerprint size={14} className="text-ink-muted" /> {shortHash(record.packageHash)}
              </span>
              <p className="mt-1 text-xs text-ink-subtle">{t('extensions.manager.hashHonesty')}</p>
            </Detail>
          )}
          {!ext.builtin && (
            <div className="md:col-span-2">
              <ConfirmButton
                label={t('extensions.manager.remove')}
                confirmLabel={t('extensions.manager.removeConfirm')}
                icon={<Trash2 size={15} />}
                onConfirm={async () => {
                  const r = await store.remove(record.id);
                  if (!r.ok) toast(r.error, 'danger');
                }}
              />
            </div>
          )}
        </div>
      )}
      {approving && manifest && (
        <ApproveDialog
          manifest={manifest}
          locale={locale}
          onClose={() => setApproving(false)}
          onConfirm={async () => {
            setApproving(false);
            const r = await store.approvePermissions(record.id);
            if (!r.ok) toast(r.error, 'danger');
          }}
        />
      )}
    </article>
  );
}

/** Chat 06.5 · B: aprovação das permissões de uma extensão já presente (embutida programável). */
function ApproveDialog({ manifest, locale, onClose, onConfirm }: { manifest: ExtensionManifest; locale: string; onClose: () => void; onConfirm: () => void | Promise<void> }) {
  const t = useT();
  const [risk, setRisk] = useState(false);
  const blocked = isElevatedRisk(manifest.permissions) && !risk;
  return (
    <Modal
      open
      onClose={onClose}
      width={560}
      icon={<ShieldCheck size={18} />}
      title={t('extensions.permissions.approveTitle', { name: localizedName(manifest, locale) })}
      description={t('extensions.manager.byPublisher', { publisher: manifest.publisher })}
      footer={
        <>
          <button type="button" className="od-btn od-btn-ghost" onClick={onClose}>
            {t('extensions.install.cancel')}
          </button>
          <button type="button" className="od-btn od-btn-primary" disabled={blocked} onClick={() => void onConfirm()}>
            {t('extensions.permissions.approveConfirm')}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="rounded-xl bg-panel-sunken p-3.5 ring-1 ring-line">
          <div className="mb-2 text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{t('extensions.permissions.title')}</div>
          <PermissionList manifest={manifest} />
        </div>
        <ElevatedRiskNotice manifest={manifest} confirmed={risk} onConfirm={setRisk} />
        <p className="text-xs text-ink-subtle">{t('extensions.permissions.approveHint')}</p>
      </div>
    </Modal>
  );
}

function Detail({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn(wide && 'md:col-span-2')}>
      <div className="text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{label}</div>
      <div className="mt-0.5 text-ink">{children}</div>
    </div>
  );
}

function ProvenanceText({ manifest }: { manifest: ExtensionManifest }) {
  const t = useT();
  const p = manifest.provenance;
  return (
    <span>
      {p.originalWork ? t('extensions.manager.originalWork') : t('extensions.manager.notOriginalWork')}
      {p.thirdParty.length > 0 && <span className="block text-xs text-ink-subtle">{p.thirdParty.map((tp) => `${tp.name} (${tp.license})`).join(' · ')}</span>}
    </span>
  );
}

function CountsText({ counts }: { counts: ContributionCounts }) {
  const t = useT();
  const parts = (Object.keys(counts) as Array<keyof ContributionCounts>)
    .filter((k) => counts[k] > 0)
    .map((k) => {
      switch (k) {
        case 'shapes':
          return t('extensions.manager.countShapes', { count: counts[k] });
        case 'templates':
          return t('extensions.manager.countTemplates', { count: counts[k] });
        case 'themes':
          return t('extensions.manager.countThemes', { count: counts[k] });
        case 'stickers':
          return t('extensions.manager.countStickers', { count: counts[k] });
        case 'palettes':
          return t('extensions.manager.countPalettes', { count: counts[k] });
        case 'elementTypes':
          return t('extensions.manager.countElementTypes', { count: counts[k] });
        case 'commands':
          return t('extensions.manager.countCommands', { count: counts[k] });
        case 'panels':
          return t('extensions.manager.countPanels', { count: counts[k] });
        case 'importers':
          return t('extensions.manager.countImporters', { count: counts[k] });
        case 'exporters':
          return t('extensions.manager.countExporters', { count: counts[k] });
      }
    });
  return <span>{parts.join(' · ') || '—'}</span>;
}

/** Tela de aprovação da instalação/atualização (EXTENSIONS_SPEC §5.4 e §5.7). */
export function InstallDialog({ preview, locale, onClose, onConfirm }: { preview: InstallPreview | null; locale: string; onClose: () => void; onConfirm: () => void | Promise<void> }) {
  const t = useT();
  const [risk, setRisk] = useState(false);
  useEffect(() => setRisk(false), [preview]);
  if (!preview) return null;
  const blocked = isElevatedRisk(preview.manifest.permissions) && !risk;
  const m = preview.manifest;
  const update = preview.existing;
  return (
    <Modal
      open
      onClose={onClose}
      width={560}
      icon={<ShieldCheck size={18} />}
      title={t(update ? 'extensions.install.titleUpdate' : 'extensions.install.title', { name: localizedName(m, locale) })}
      description={t('extensions.manager.byPublisher', { publisher: m.publisher })}
      footer={
        <>
          <button type="button" className="od-btn od-btn-ghost" onClick={onClose}>
            {t('extensions.install.cancel')}
          </button>
          <button type="button" className="od-btn od-btn-primary" disabled={blocked} onClick={() => void onConfirm()}>
            {t(update ? 'extensions.install.confirmUpdate' : 'extensions.install.confirm')}
          </button>
        </>
      }
    >
      <InstallSummary preview={preview} />
      <div className="mt-3">
        <ElevatedRiskNotice manifest={m} confirmed={risk} onConfirm={setRisk} />
      </div>
    </Modal>
  );
}

/** Conteúdo da aprovação (também exibido no Design System). */
export function InstallSummary({ preview }: { preview: InstallPreview }) {
  const t = useT();
  const m = preview.manifest;
  const update = preview.existing;
  return (
    <div className="space-y-3 text-sm">
      {update && (
        <Notice tone="info">
          {t('extensions.install.updateDiff', { from: update.version, to: m.version })}
          {preview.sameContent && <span className="block text-xs">{t('extensions.install.sameContent')}</span>}
          {!preview.sameContent && <span className="block text-xs">{t('extensions.install.hashChanged', { before: shortHash(update.packageHash), after: preview.shortHash })}</span>}
        </Notice>
      )}
      {preview.dev && <Notice tone="warning">{t('extensions.install.devWarning')}</Notice>}
      <div className="grid gap-3 rounded-xl bg-panel-sunken p-3.5 ring-1 ring-line md:grid-cols-2">
        <Detail label={t('extensions.manager.permissions')} wide>
          <PermissionList manifest={m} />
          {update && preview.newPermissions.length > 0 && <p className="mt-1.5 text-xs text-warning">{preview.newPermissions.join(', ')}</p>}
        </Detail>
        <Detail label={t('extensions.manager.license')}>{m.license}</Detail>
        <Detail label={t('extensions.manager.provenance')}>
          <ProvenanceText manifest={m} />
        </Detail>
        <Detail label={t('extensions.manager.contributions')}>
          <CountsText counts={contributionCounts(m)} />
        </Detail>
        <Detail label={t('extensions.manager.hash')} wide>
          <span className="inline-flex items-center gap-1.5 font-mono text-[15px] font-bold tracking-wider text-ink">
            <Fingerprint size={16} className="text-ink-muted" /> {preview.shortHash}
          </span>
          <p className="mt-1 text-xs text-ink-subtle">{t('extensions.install.compareHash')}</p>
        </Detail>
      </div>
      <p className="text-xs text-ink-subtle">{t('extensions.manager.hashHonesty')}</p>
    </div>
  );
}
