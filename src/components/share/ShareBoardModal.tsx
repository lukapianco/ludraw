import { useMemo, useState, type ReactNode } from 'react';
import { Code2, Copy, Crown, Link2, Mail, RefreshCw, ShieldAlert, Trash2, UserPlus, Users, Wand2 } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useBoardStore } from '../../store/useBoardStore';
import { policiesOf, wsView } from '../../store/workspaceSlice';
import type { BoardMember, BoardRole, PublicShareLink } from '../../types/workspace';
import { BOARD_ROLE_LABEL_KEYS, effectiveBoardRole } from '../../utils/permissions';
import { allowedLinkLifetimes, boardContextFor, canSeeBoard, DAY_MS, effectiveLinkExpiry, invitationStatus, publicLinkHidden, teamIdsOf, type Viewer } from '../../utils/workspace';
import { displayName, roleLabel } from '../../utils/workspaceDisplay';
import { absoluteHashUrl } from '../../utils/router';
import { initials } from '../../utils/format';
import { cn } from '../../utils/cn';
import { useBoardCan, useOrgMembers, useWorkspaceCan } from '../../hooks/useWorkspace';
import { Modal } from '../ui/Modal';
import { useT } from '../../i18n/useT';
import { formatDateTime } from '../../i18n/format';
import { copyText } from '../../utils/clipboardText';
import { isServerMode } from '../../utils/serverConfig';
import { PasswordInput } from '../ui/PasswordInput';

type Tab = 'people' | 'facilitators' | 'link';
type AclRole = Exclude<BoardRole, 'owner'>;
const ACL_ROLES: AclRole[] = ['editor', 'commenter', 'viewer'];
const ACL_EXPIRY_DAYS = [0, 7, 30, 90] as const;

/**
 * Chat 06 — Compartilhar um board: pessoas (ACL com papel e prazo), facilitadores e link público
 * de Visitor. Toda ação passa pelo store (`can()` + Audit Log); o modal só desabilita e explica.
 * Diferença de mercado: uma única ficha em três "abas-cartão" com o motivo de cada bloqueio à vista,
 * em vez de um popover de convite com upsell.
 */
export function ShareBoardModal({ boardId, tab: initialTab = 'people', onClose }: { boardId: string; tab?: Tab; onClose: () => void }) {
  const t = useT();
  const meta = useAppStore((s) => s.boards.find((b) => b.id === boardId));
  const [tab, setTab] = useState<Tab>(initialTab);
  if (!meta) return null;
  const tabs: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: 'people', label: t('share.tabs.people'), icon: <Users size={15} /> },
    { id: 'facilitators', label: t('share.tabs.facilitators'), icon: <Wand2 size={15} /> },
    { id: 'link', label: t('share.tabs.link'), icon: <Link2 size={15} /> },
  ];
  return (
    <Modal open onClose={onClose} width={640} icon={<UserPlus size={20} />} title={t('share.title', { name: meta.name })} description={t('share.description')}>
      <div className="mb-4 flex gap-1 rounded-xl bg-panel-sunken p-1 ring-1 ring-line" role="tablist" aria-label={t('share.tabsLabel')}>
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            onClick={() => setTab(x.id)}
            className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[13px] font-semibold transition-colors', tab === x.id ? 'bg-panel text-ink shadow-panel' : 'text-ink-muted hover:text-ink')}
          >
            {x.icon}
            <span className="truncate">{x.label}</span>
          </button>
        ))}
      </div>
      <div className="-m-1 max-h-[min(560px,64vh)] overflow-y-auto p-1">
        {tab === 'people' && <PeopleSection boardId={boardId} />}
        {tab === 'facilitators' && <FacilitatorsSection boardId={boardId} />}
        {tab === 'link' && <LinkSection boardId={boardId} />}
      </div>
      {/* Chat 08.2: "Incorporar em outro site" mora aqui (antes: menus Exportar da Régua e do ⋯) */}
      <div className="mt-3 flex justify-end border-t border-line pt-3">
        <button type="button" data-testid="share-embed" className="od-btn od-btn-ghost od-btn-sm" onClick={() => useAppStore.getState().openModal({ type: 'embed', boardId })}>
          <Code2 size={14} /> {t('board.topBar.embedAnotherSite')}
        </button>
      </div>
    </Modal>
  );
}

/* --------------------------------- Pessoas --------------------------------- */

function PeopleSection({ boardId }: { boardId: string }) {
  const t = useT();
  const meta = useAppStore((s) => s.boards.find((b) => b.id === boardId))!;
  const directory = useAppStore((s) => s.directory);
  const members_ = useOrgMembers();
  const share = useBoardCan(boardId, 'board.share');
  const guests = useWorkspaceCan('workspace.guests.invite');
  const [pick, setPick] = useState('');
  const [role, setRole] = useState<AclRole>('editor');
  const [days, setDays] = useState<number>(0);
  const app = useAppStore.getState;

  const members = meta.members ?? [];
  const inAcl = new Set(members.map((m) => m.userId));
  // Chat 06: convites ainda não aceitos para este board (link copiável de novo)
  const invitations = useAppStore((s) => s.invitations);
  const pendingInvites = invitations.filter((i) => i.boardId === boardId && invitationStatus(i) === 'pending');
  const candidates = members_
    .filter((a) => a.status === 'active' && a.id !== meta.ownerId && !inAcl.has(a.id) && a.role !== 'visitor')
    .filter((a) => a.role !== 'guest_b2b' || guests.allowed);
  const report = (r: { ok: boolean; error?: string }) => (r.ok ? true : (app().toast(r.error ?? '', 'danger'), false));

  const add = () => {
    if (!pick) return;
    const ok = report(app().setBoardMember(boardId, pick, role, days ? Date.now() + days * DAY_MS : undefined));
    if (ok) setPick('');
  };

  return (
    <div className="space-y-4">
      {!share.allowed && <Notice tone="warning">{share.reason}</Notice>}
      <div className="rounded-xl ring-1 ring-line">
        <PersonRow name={displayName(meta.ownerId, directory, meta.ownerName)} detail={t('share.people.ownerDetail')} right={<span className="flex items-center gap-1 text-xs font-semibold text-ink-muted"><Crown size={13} /> {t(BOARD_ROLE_LABEL_KEYS.owner)}</span>} />
        {members.map((m) => (
          <AclRow key={m.userId} boardId={boardId} member={m} disabled={!share.allowed} />
        ))}
        {(meta.invitedGuestIds ?? []).filter((g) => !inAcl.has(g)).map((g) => (
          <PersonRow
            key={g}
            name={displayName(g, directory)}
            detail={t('share.people.invitedGuest')}
            right={
              <button type="button" className="od-tool h-8 w-8 hover:text-danger" disabled={!share.allowed} onClick={() => report(app().removeBoardMember(boardId, g))} aria-label={t('share.people.remove')}>
                <Trash2 size={15} />
              </button>
            }
          />
        ))}
        {members.length === 0 && !(meta.invitedGuestIds ?? []).length && <p className="border-t border-line px-3.5 py-3 text-sm text-ink-muted">{t('share.people.empty')}</p>}
      </div>

      <fieldset disabled={!share.allowed} className="rounded-xl bg-panel-sunken p-3.5 ring-1 ring-line disabled:opacity-60">
        <legend className="sr-only">{t('share.people.addTitle')}</legend>
        <div className="mb-2 text-sm font-semibold text-ink">{t('share.people.addTitle')}</div>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_130px_120px_auto]">
          <select className="od-input h-9 text-[13px]" value={pick} onChange={(e) => setPick(e.target.value)} aria-label={t('share.people.person')}>
            <option value="">{candidates.length ? t('share.people.choosePerson') : t('share.people.noCandidates')}</option>
            {candidates.map((a) => (
              <option key={a.id} value={a.id}>
                {t('share.people.option', { name: a.name, role: roleLabel(a.role) })}
              </option>
            ))}
          </select>
          <select className="od-input h-9 text-[13px]" value={role} onChange={(e) => setRole(e.target.value as AclRole)} aria-label={t('share.people.role')}>
            {ACL_ROLES.map((r) => (
              <option key={r} value={r}>{t(BOARD_ROLE_LABEL_KEYS[r])}</option>
            ))}
          </select>
          <ExpirySelect value={days} onChange={setDays} />
          <button type="button" className="od-btn od-btn-primary h-9" onClick={add} disabled={!pick}>{t('share.people.add')}</button>
        </div>
        <button type="button" className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-800 hover:underline dark:text-brand-200" onClick={() => app().openModal({ type: 'invite', boardId, role: guests.allowed ? 'guest_b2b' : 'member' })}>
          <Mail size={14} /> {t('share.people.inviteByEmail')}
        </button>
        {!guests.allowed && <p className="mt-1.5 text-xs text-ink-subtle">{guests.reason}</p>}
      </fieldset>

      {pendingInvites.length > 0 && (
        <div>
          <div className="mb-1.5 text-xs font-semibold text-ink-muted">{t('share.people.pendingInvites')}</div>
          <div className="rounded-xl ring-1 ring-line">
            {pendingInvites.map((i) => (
              <PersonRow
                key={i.id}
                name={i.email}
                detail={`${roleLabel(i.role)} · ${t('admin.invites.expires', { date: formatDateTime(i.expiresAt) })}`}
                right={
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="od-btn od-btn-ghost od-btn-sm h-8"
                      onClick={() => void copyText(absoluteHashUrl(`#/invite/${i.token}`)).then((ok) => app().toast(ok ? t('workspace.invite.copied') : t('share.copyFailed'), ok ? 'success' : 'danger'))}
                    >
                      <Copy size={14} /> {t('admin.invites.copyLink')}
                    </button>
                    <button type="button" className="od-tool h-8 w-8 hover:text-danger" onClick={() => report(app().revokeInvitation(i.id))} aria-label={t('admin.invites.revoke')} title={t('admin.invites.revoke')}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AclRow({ boardId, member, disabled }: { boardId: string; member: BoardMember; disabled: boolean }) {
  const t = useT();
  const directory = useAppStore((s) => s.directory);
  const acc = useOrgMembers().find((a) => a.id === member.userId);
  const app = useAppStore.getState;
  const expired = !!member.expiresAt && member.expiresAt <= Date.now();
  const report = (r: { ok: boolean; error?: string }) => !r.ok && app().toast(r.error ?? '', 'danger');
  return (
    <PersonRow
      name={displayName(member.userId, directory)}
      detail={[acc ? roleLabel(acc.role) : '', member.expiresAt ? (expired ? t('share.people.expired') : t('share.people.until', { date: formatDateTime(member.expiresAt) })) : t('share.people.noExpiry')].filter(Boolean).join(' · ')}
      muted={expired}
      right={
        <div className="flex items-center gap-1">
          <select
            className="od-input h-8 w-[118px] text-[12.5px]"
            value={member.role === 'owner' ? 'editor' : member.role}
            disabled={disabled}
            onChange={(e) => report(app().setBoardMember(boardId, member.userId, e.target.value as AclRole, member.expiresAt ?? null))}
            aria-label={t('share.people.roleOf', { name: displayName(member.userId, directory) })}
          >
            {ACL_ROLES.map((r) => (
              <option key={r} value={r}>{t(BOARD_ROLE_LABEL_KEYS[r])}</option>
            ))}
          </select>
          <ExpirySelect
            compact
            disabled={disabled}
            value={-1}
            onChange={(d) => report(app().setBoardMember(boardId, member.userId, member.role === 'owner' ? 'editor' : member.role, d ? Date.now() + d * DAY_MS : null))}
          />
          <button type="button" className="od-tool h-8 w-8 hover:text-danger" disabled={disabled} onClick={() => report(app().removeBoardMember(boardId, member.userId))} aria-label={t('share.people.remove')}>
            <Trash2 size={15} />
          </button>
        </div>
      }
    />
  );
}

function ExpirySelect({ value, onChange, compact, disabled }: { value: number; onChange: (days: number) => void; compact?: boolean; disabled?: boolean }) {
  const t = useT();
  return (
    <select
      className={cn('od-input h-9 text-[13px]', compact && 'h-8 w-[104px] text-[12.5px]')}
      value={value}
      disabled={disabled}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (v >= 0) onChange(v);
      }}
      aria-label={t('share.people.expiry')}
    >
      {compact && <option value={-1}>{t('share.people.changeExpiry')}</option>}
      {ACL_EXPIRY_DAYS.map((d) => (
        <option key={d} value={d}>{d === 0 ? t('share.people.noExpiry') : t('share.people.days', { count: d })}</option>
      ))}
    </select>
  );
}

/* ------------------------------- Facilitadores ------------------------------- */

function FacilitatorsSection({ boardId }: { boardId: string }) {
  const t = useT();
  const s = useAppStore();
  const meta = s.boards.find((b) => b.id === boardId)!;
  const openBoardId = useBoardStore((b) => b.boardId);
  const facilitatorIds = useBoardStore((b) => b.facilitatorIds);
  const share = useBoardCan(boardId, 'board.share');
  const ws = useMemo(() => wsView(s), [s]);
  const isOpen = openBoardId === boardId;
  const orgMembersList = useOrgMembers();

  // Quem pode facilitar: pessoas ativas que editam este board (admin é facilitador implícito)
  const candidates = useMemo(
    () =>
      orgMembersList
        .filter((a) => a.status === 'active' && a.id !== meta.ownerId && a.role !== 'visitor')
        .map((a) => {
          const viewer: Viewer = { userId: a.id, workspaceRole: a.role, teamIds: teamIdsOf(a.id, s.teams), status: a.status === 'invited' ? 'suspended' : a.status, guestExpiresAt: a.guestExpiresAt ?? null };
          const role = canSeeBoard(viewer, meta, ws) ? effectiveBoardRole(boardContextFor(viewer, meta, ws)) : null;
          return { account: a, role };
        })
        .filter((x) => x.role === 'editor' || x.role === 'owner'),
    [orgMembersList, s.teams, meta, ws],
  );

  if (!isOpen) return <Notice tone="info">{t('share.facilitators.openBoard')}</Notice>;
  const current = new Set(facilitatorIds ?? [meta.ownerId]);
  const toggle = (id: string, on: boolean) => {
    const next = new Set(current);
    if (on) next.add(id);
    else next.delete(id);
    useBoardStore.getState().setFacilitators([...next]);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted">{t('share.facilitators.intro')}</p>
      {!share.allowed && <Notice tone="warning">{share.reason}</Notice>}
      <div className="rounded-xl ring-1 ring-line">
        <PersonRow name={displayName(meta.ownerId, s.directory, meta.ownerName)} detail={t('share.facilitators.ownerAlways')} right={<input type="checkbox" checked disabled aria-label={t('share.facilitators.ownerAlways')} />} />
        {candidates.map(({ account, role }) => {
          const implicit = role === 'owner';
          return (
            <PersonRow
              key={account.id}
              name={account.name}
              detail={implicit ? t('share.facilitators.adminImplicit') : roleLabel(account.role)}
              right={
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--od-accent)]"
                  checked={implicit || current.has(account.id)}
                  disabled={implicit || !share.allowed}
                  onChange={(e) => toggle(account.id, e.target.checked)}
                  aria-label={t('share.facilitators.toggle', { name: account.name })}
                />
              }
            />
          );
        })}
        {candidates.length === 0 && <p className="border-t border-line px-3.5 py-3 text-sm text-ink-muted">{t('share.facilitators.empty')}</p>}
      </div>
    </div>
  );
}

/* -------------------------------- Link público -------------------------------- */

function LinkSection({ boardId }: { boardId: string }) {
  const t = useT();
  const meta = useAppStore((s) => s.boards.find((b) => b.id === boardId))!;
  const policies = useAppStore((s) => policiesOf(s));
  const canLink = useBoardCan(boardId, 'board.publicLink');
  const share = useBoardCan(boardId, 'board.share');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const app = useAppStore.getState;
  const link: PublicShareLink | undefined = meta.publicLink;
  const enabled = !!link?.enabled && !link.revokedAt;
  const lifetimes = allowedLinkLifetimes(policies);
  const expiry = link ? effectiveLinkExpiry(link, policies) : null;
  // prazo escolhido: deduzido da duração gravada (expiresAt − createdAt); sem expiração = "Sem prazo"
  const lifetimeId = !link
    ? null
    : link.expiresAt == null
      ? 'never'
      : (lifetimes.find((l) => l.ms !== null && Math.abs(link.expiresAt! - (link.createdAt ?? 0) - l.ms) < 60_000)?.id ?? null);
  const url = link ? absoluteHashUrl(`#/board/${encodeURIComponent(boardId)}?share=${link.token}`) : '';
  const hidden = publicLinkHidden(link);

  const run = async (patch: Parameters<ReturnType<typeof app>['setPublicLink']>[1]) => {
    setBusy(true);
    const r = await app().setPublicLink(boardId, patch);
    setBusy(false);
    if (!r.ok) app().toast(r.error, 'danger');
    return r.ok;
  };

  if (!canLink.allowed && !enabled) {
    return (
      <div className="space-y-3">
        <Notice tone="warning">{canLink.reason}</Notice>
        <LocalPasswordNote />
      </div>
    );
  }

  const downloadValue = link?.allowDownload === undefined ? 'policy' : link.allowDownload ? 'allow' : 'block';

  return (
    <div className="space-y-4">
      {!canLink.allowed && <Notice tone="warning">{canLink.reason}</Notice>}
      <div className="flex items-center justify-between gap-3 rounded-xl bg-panel-sunken px-3.5 py-3 ring-1 ring-line">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink">{t('share.link.toggle')}</div>
          <div className="text-xs text-ink-muted">{enabled ? (expiry ? t('share.link.expiresAt', { date: formatDateTime(expiry) }) : t('share.link.neverExpires')) : t('share.link.off')}</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={busy || !canLink.allowed}
          onClick={() => void run({ enabled: !enabled, ...(password && !enabled ? { password } : {}) })}
          className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50', enabled ? 'bg-accent' : 'bg-line-strong')}
          aria-label={t('share.link.toggle')}
        >
          <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', enabled ? 'start-[22px]' : 'start-0.5')} />
        </button>
      </div>

      {policies.requirePasswordOnPublicLinks && !link?.passwordHash && <Notice tone="info">{t('workspace.errors.passwordRequired')}</Notice>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label={t('share.link.level')}>
          <select className="od-input h-9 text-[13px]" value={link?.accessLevel ?? 'viewer'} disabled={busy || !canLink.allowed} onChange={(e) => void run({ accessLevel: e.target.value as PublicShareLink['accessLevel'] })}>
            {(['viewer', 'commenter', 'editor'] as const).map((r) => (
              <option key={r} value={r}>{t(BOARD_ROLE_LABEL_KEYS[r])}</option>
            ))}
          </select>
        </Labeled>
        <Labeled label={t('share.link.lifetime')}>
          <div className="flex flex-wrap gap-1">
            {lifetimes.map((l) => {
              const selected = enabled && lifetimeId === l.id;
              return (
                <button
                  key={l.id}
                  type="button"
                  aria-pressed={selected}
                  className={cn('od-btn od-btn-sm h-8 px-2.5', selected ? 'bg-accent text-[var(--od-accent-contrast)] ring-1 ring-selection font-semibold' : 'od-btn-secondary')}
                  disabled={busy || !canLink.allowed}
                  onClick={() => void run({ lifetime: l.id })}
                >
                  {t(`share.link.lifetimes.${l.id}` as const)}
                </button>
              );
            })}
          </div>
          {policies.maxPublicLinkLifetimeDays !== null && <span className="mt-1 block text-xs text-ink-subtle">{t('share.link.maxLifetime', { count: policies.maxPublicLinkLifetimeDays })}</span>}
        </Labeled>
      </div>

      <Labeled label={t('share.link.password')}>
        <div className="flex gap-2">
          <PasswordInput className="od-input h-9 text-[13px]" value={password} placeholder={link?.passwordHash ? t('share.link.passwordSet') : t('share.link.passwordPlaceholder')} onChange={(e) => setPassword(e.target.value)} disabled={busy || !canLink.allowed} autoComplete="new-password" />
          <button type="button" className="od-btn od-btn-secondary h-9 shrink-0" disabled={busy || !password || !canLink.allowed} onClick={() => void run({ password }).then((ok) => ok && setPassword(''))}>
            {t('share.link.setPassword')}
          </button>
          {link?.passwordHash && (
            <button type="button" className="od-btn od-btn-ghost h-9 shrink-0" disabled={busy || !canLink.allowed || policies.requirePasswordOnPublicLinks} onClick={() => void run({ password: null })}>
              {t('share.link.removePassword')}
            </button>
          )}
        </div>
        <LocalPasswordNote />
      </Labeled>

      <Labeled label={t('share.link.download')}>
        <select
          className="od-input h-9 text-[13px]"
          value={policies.allowViewerExport ? downloadValue : 'block'}
          disabled={busy || !canLink.allowed || !policies.allowViewerExport}
          onChange={(e) => void run({ allowDownload: e.target.value === 'policy' ? null : e.target.value === 'allow' })}
        >
          <option value="policy">{t('share.link.downloadPolicy')}</option>
          <option value="allow">{t('share.link.downloadAllow')}</option>
          <option value="block">{t('share.link.downloadBlock')}</option>
        </select>
        {!policies.allowViewerExport && <span className="mt-1 block text-xs text-ink-subtle">{t('share.link.downloadCeiling')}</span>}
      </Labeled>

      {link && (
        <div className="rounded-xl ring-1 ring-line">
          {hidden ? (
            // Chat 08.7 · R5 (S-17): sem LUDRAW_JWT_SECRET o servidor guarda só o hash — o endereço apareceu na criação
            <div className="flex flex-wrap items-center gap-2 px-3.5 py-2.5" data-testid="public-link-once">
              <p className="min-w-0 flex-1 text-xs text-ink-muted">{t('share.link.onceNote')}</p>
              <button type="button" className="od-btn od-btn-primary h-9 shrink-0" disabled={busy || !canLink.allowed} data-testid="public-link-regenerate" onClick={() => {
                const r = app().regeneratePublicLink(boardId);
                if (!r.ok) app().toast(r.error, 'danger');
              }}>
                <RefreshCw size={15} /> {t('share.link.regenerateToCopy')}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3.5 py-2.5">
              <input className="od-input h-9 min-w-0 flex-1 font-mono text-[12px]" value={url} readOnly onFocus={(e) => e.target.select()} aria-label={t('share.link.url')} />
              <button type="button" className="od-btn od-btn-primary h-9 shrink-0" disabled={!enabled} onClick={() => void copyText(url).then((ok) => app().toast(ok ? t('share.link.copied') : t('share.copyFailed'), ok ? 'success' : 'danger'))}>
                <Copy size={15} /> {t('share.link.copy')}
              </button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 border-t border-line px-3.5 py-2.5 text-xs text-ink-muted">
            <span className="me-auto">{link.lastUsedAt ? t('share.link.lastUsed', { date: formatDateTime(link.lastUsedAt) }) : t('share.link.neverUsed')}</span>
            <button type="button" className="od-btn od-btn-ghost od-btn-sm" disabled={busy || !canLink.allowed} onClick={() => {
              const r = app().regeneratePublicLink(boardId);
              if (!r.ok) app().toast(r.error, 'danger');
            }}>
              <RefreshCw size={14} /> {t('share.link.regenerate')}
            </button>
            <button type="button" className="od-btn od-btn-ghost od-btn-sm text-danger" disabled={busy || !share.allowed || !enabled} onClick={() => {
              const r = app().revokePublicLink(boardId);
              if (!r.ok) app().toast(r.error, 'danger');
            }}>
              <Trash2 size={14} /> {t('share.link.revoke')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Ajuste do usuário (Chat 06): a senha local não é segurança real sem servidor. */
function LocalPasswordNote() {
  const t = useT();
  return (
    <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-ink-subtle">
      <ShieldAlert size={13} className="mt-0.5 shrink-0" /> {isServerMode() ? t('server.client.publicLinkNote') : t('share.link.localPasswordNote')}
    </p>
  );
}

/* --------------------------------- Peças --------------------------------- */

function PersonRow({ name, detail, right, muted }: { name: string; detail?: string; right?: ReactNode; muted?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3 border-t border-line px-3.5 py-2.5 first:border-t-0', muted && 'opacity-60')}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-bold text-brand-900 dark:text-brand-200">{initials(name)}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-ink" title={name}>{name}</div>
        {detail && <div className="truncate text-xs text-ink-subtle">{detail}</div>}
      </div>
      {right}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold text-ink-muted">{label}</div>
      {children}
    </div>
  );
}

export function Notice({ tone, children }: { tone: 'warning' | 'info'; children: ReactNode }) {
  return (
    <div role="status" className={cn('rounded-xl px-3.5 py-2.5 text-sm ring-1 ring-line', tone === 'warning' ? 'bg-warning-soft text-ink' : 'bg-accent-soft text-ink')}>
      {children}
    </div>
  );
}
