import { useState } from 'react';
import { formatError } from '/helper/api-error.js';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

// Sentinel value matching backend common.UnlimitedQuota: -1 means no cap on a resource.
export const UNLIMITED_QUOTA = -1;

// Well-known node IDs bootstrapped by the backend.
export const ROOT_NODE_ID = 'root';
export const UNASSIGNED_NODE_ID = 'unassigned';

// ── Node helpers ────────────────────────────────────────────────────────────

export function isBudget(node) { return node?.kind === 'budget'; }
export function isProject(node) { return node?.kind === 'project'; }

// Strips the "user:" prefix from an owner token; returns '' when unset.
export function ownerEmail(node) {
    const token = node?.owner || '';
    return token.startsWith('user:') ? token.slice(5) : token;
}

// Human-readable title of a node: budgets have names, projects usually only a purpose.
export function nodeTitle(node) {
    if (!node) return '';
    if (node.status === 'imported') return node.os_project_name || node.os_project_id || node.name || node.id;
    return node.name || node.reason || node.id;
}

// ── Colour language ─────────────────────────────────────────────────────────
// Colour carries exactly one meaning here: the state of a thing. It never marks
// what KIND of thing something is — a person, a group, a number and a date all
// look the same, and the label beside them says which is which. Five roles, and
// nothing outside this list:
export const COLOR = {
    // Who and what: people, groups, tokens, plain values. Neutral on purpose —
    // three differently coloured badges in a row read as three severities.
    identity: 'gray',
    // Needs a human: waiting for a decision, a change proposed, a dead end.
    attention: 'orange',
    // Granted, active, will be added.
    positive: 'green',
    // Rejected, over the limit, destroys something.
    negative: 'red',
    // Exists in OpenStack but outside the managed lifecycle (imported/adopt).
    outside: 'violet',
    // Explanation, not state: info alerts and the neutral fill of a usage bar.
    info: 'blue',
};

// ── Status vocabulary ───────────────────────────────────────────────────────
// One place defines how every status looks and reads across the whole UI.

// Every status also carries the sentence that explains it. A badge is a label,
// not an explanation, and the words we chose ("Released", "Imported") are ours
// rather than everyday language — so each one has to say what it means for the
// person reading it: what happened, what it costs, what they can do next.
// The words themselves live in the translations under projects.status.<status>;
// only the colours are decided here.
const STATUS_META = {
    pending: { color: COLOR.attention, variant: 'outline' },
    approved: { color: COLOR.positive, variant: 'filled' },
    change_pending: { color: COLOR.attention, variant: 'outline' },
    rejected: { color: COLOR.negative, variant: 'filled' },
    // The one people ask about: they gave the project up, expect it gone, and
    // see it still listed and still charged. Both are true and both are
    // deliberate — releasing asks for deletion, it does not perform it.
    released: { color: COLOR.identity, variant: 'light' },
    imported: { color: COLOR.outside, variant: 'light' },
};

// A leaf that is approved but has no OpenStack project yet. The reconciler runs
// on an interval, so "granted" and "usable" are minutes apart — and calling that
// window "Active" sends people looking for a project that is not there.
// Only meaningful while provisioning actually runs; with the reconciler off,
// nothing ever gets an ID and every project would be stuck on "Setting up".
const PROVISIONING_META = { color: COLOR.attention, variant: 'filled' };

// openstackProjectUrl is where a project opens in the OpenStack dashboard, or
// null when there is nowhere to go: no dashboard configured, no OpenStack
// project yet, or one that is on its way out. Horizon's project switch keeps
// its target through the login, so the link works signed out as well.
export function openstackProjectUrl(dashboardUrl, node) {
    if (!dashboardUrl || !node?.os_project_id) return null;
    if (node.status !== 'approved' && node.status !== 'change_pending') return null;
    return `${dashboardUrl.replace(/\/+$/, '')}/auth/switch/${encodeURIComponent(node.os_project_id)}/?next=/project/`;
}

export function isProvisioning(node, provisioningEnabled) {
    return Boolean(provisioningEnabled)
        && node?.kind === 'project'
        && node?.status === 'approved'
        && !node?.os_project_id;
}

// Returns Mantine badge color + variant for a node status.
export function statusStyle(status, provisioning = false) {
    if (provisioning) return PROVISIONING_META;
    return STATUS_META[status] ?? { color: 'gray', variant: 'outline' };
}

// Returns the human-readable label for a status string. Takes `t` rather than
// reaching for the i18n instance: this module is imported by plain functions as
// well as components, and a parameter keeps both honest.
export function statusLabel(t, status, provisioning = false) {
    if (provisioning) return t('projects.status.provisioning.label');
    return STATUS_META[status] ? t(`projects.status.${status}.label`) : status;
}

// Returns the sentence explaining a status, or '' for one we have no words for
// — callers render no tooltip rather than an empty one.
export function statusDescription(t, status, provisioning = false) {
    if (provisioning) return t('projects.status.provisioning.description');
    return STATUS_META[status] ? t(`projects.status.${status}.description`) : '';
}

// Returns true for reconciler-imported OpenStack projects that are not yet
// part of the managed lifecycle (read-only until adopted).
export function isImported(node) {
    return node?.status === 'imported';
}

// ── Resource kinds ──────────────────────────────────────────────────────────

// An availability is a resource you either have or do not: a network, an image,
// a GPU flavour. It travels in the same quota map as everything else, as 0 or 1,
// so nothing about the VALUE says which kind it is — only the definition does.
export function isAvailability(resource) {
    return resource?.kind === 'bool';
}

// visibleResources narrows the catalogue to what is in scope at one node.
//
// The server decides this and sends it as `available_resources`: everything at
// the root, and below that only what was actually delegated. Without the filter
// a budget granted two of forty GPU flavours would show all forty.
//
// A node WITHOUT the field falls back to the whole catalogue. That is the older
// server, and showing too much is recoverable; showing nothing would make a
// budget look like it had no resources at all.
export function visibleResources(resources, node) {
    const all = resources || [];
    const scope = node?.available_resources;
    if (!Array.isArray(scope)) return all;
    const inScope = new Set(scope);
    return all.filter(r => inScope.has(r.id));
}

// groupResources sorts the catalogue into its display groups, keeping the
// catalogue's own order inside each one so two nodes never reshuffle relative to
// each other. Resources without a group land in one unnamed bucket at the end.
export function groupResources(resources) {
    const groups = new Map();
    for (const r of resources || []) {
        const key = r.group || '';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
    }
    // The unnamed bucket last: a heading-less block reads as a footnote, and it
    // looks wrong above named sections.
    const named = [...groups.entries()].filter(([k]) => k !== '');
    const unnamed = groups.has('') ? [['', groups.get('')]] : [];
    return [...named, ...unnamed];
}

// ── Quota helpers ───────────────────────────────────────────────────────────

// Sums the usage of all statuses in a node's usage rollup for one resource.
export function usedAmount(node, resourceId) {
    const usage = node?.usage ?? {};
    return Object.values(usage).reduce((sum, s) => sum + (s?.limit?.[resourceId] ?? 0), 0);
}

// Remaining free capacity of a budget for one resource; Infinity when uncapped.
export function freeAmount(node, resourceId) {
    const cap = node?.limit?.[resourceId];
    if (cap === UNLIMITED_QUOTA || cap === undefined || cap === null) return Infinity;
    return cap - usedAmount(node, resourceId);
}

// True when the requested quota fits into the budget's remaining capacity.
//
// Availabilities are skipped: they consume nothing, so "does it fit" is not a
// question about them. Left in, every granted availability would eat 1 from a
// budget that never counted it — and a budget whose availability sat at 0 would
// refuse a request that the server accepts, which is the worse direction: the UI
// would block something the API allows.
export function quotaFits(budget, requestedQuota, resources) {
    return (resources || [])
        .filter(r => !isAvailability(r))
        .every(r => (requestedQuota?.[r.id] ?? 0) <= freeAmount(budget, r.id));
}

// hasAutoApprove reports whether the budget grants requests without a manager.
export function hasAutoApprove(budget) {
    return !!budget?.auto_approve;
}

// isPoolAutoApprove reports whether the budget's auto-approve has no per-person
// limit: the budget's own free capacity is then the only bound — the shape of
// a budget handed to one person or shared by a team.
export function isPoolAutoApprove(budget) {
    return hasAutoApprove(budget)
        && Object.keys(budget.auto_approve.per_requester_limit || {}).length === 0;
}

// autoApproveHeadroom returns the largest request a budget would approve on the
// spot for this user, or null when the budget has no auto-approve policy.
//
// The backend grants instantly while the requester's own ACTIVE usage under the
// budget stays within its per-requester limit (if it has one) AND every ancestor
// still has room (see autoApprovable in the API). Both halves are mirrored here:
// the personal cap minus what this user already holds, capped by the budget's
// own free capacity. Own usage is summed from the caller's projects because the
// node's `usage` is the total over all owners. A pool has no personal cap, so
// its headroom is the budget's free capacity — Infinity where it has no cap.
export function autoApproveHeadroom(budget, resources, myProjects) {
    if (!hasAutoApprove(budget)) return null;
    const pool = isPoolAutoApprove(budget);
    const perRequester = budget.auto_approve.per_requester_limit || {};

    const mine = {};
    for (const project of myProjects || []) {
        if (project?.parent_id !== budget.id) continue;
        // Same definition of "active" the server uses for this sum.
        if (project.status !== 'approved' && project.status !== 'change_pending') continue;
        for (const r of resources || []) {
            if (isAvailability(r)) continue;
            mine[r.id] = (mine[r.id] || 0) + (project.limit?.[r.id] || 0);
        }
    }

    const out = {};
    for (const r of resources || []) {
        // "How much of this is left for you" means nothing for an availability;
        // it is granted or it is not, and the per-requester cap does not divide.
        if (isAvailability(r)) continue;
        const personal = pool ? Infinity : Math.max(0, (perRequester[r.id] ?? 0) - (mine[r.id] || 0));
        const free = freeAmount(budget, r.id);
        out[r.id] = Math.max(0, Math.min(personal, free));
    }
    return out;
}

// beyondAutoApproveRefused reports whether the budget refuses requests its
// auto-approve does not cover, instead of queueing them for a manager.
export function beyondAutoApproveRefused(budget) {
    return hasAutoApprove(budget) && budget.allow_requests_beyond_auto_approve === false;
}

// autoApproveFacts answers the two questions a budget's auto-approve raises —
// what it grants without asking, and what happens to the rest — as two separate
// values rather than one sentence assembled from clauses. null without a policy.
export function autoApproveFacts(t, resources, budget) {
    if (!hasAutoApprove(budget)) return null;
    const amount = isPoolAutoApprove(budget)
        ? '' : resourceSummaryText(resources, budget.auto_approve.per_requester_limit);
    return {
        // A pool grants whatever the budget still has, so it has no figure of
        // its own to show.
        grants: amount
            ? t('projects.autoApprove.perPerson', { amount })
            : t('projects.autoApprove.whileRoom'),
        beyond: beyondAutoApproveRefused(budget)
            ? t('projects.autoApprove.beyondRefused')
            : t('projects.autoApprove.beyondManager'),
    };
}

// What happens when a request is sent — the same decision the API makes, made
// early so the form can say it before the button is pressed:
//   'direct'    the viewer manages the budget; created active on the spot
//   'refused'   the viewer manages the budget, but it has no room: a manager's
//               own creation is checked on the spot and turned down
//   'instant'   the budget's auto-approve grants it (or it needs no approval)
//   'approval'  a manager of the budget decides
//   'blocked'   beyond what auto-approve grants, and the budget takes no
//               requests beyond that — the server refuses it
//
// requestOutcome is for a NEW project under `budget`.
export function requestOutcome({ budget, manages, quota, resources, myProjects }) {
    if (!budget) return null;
    if (manages) return quotaFits(budget, quota, resources) ? 'direct' : 'refused';
    const headroom = autoApproveHeadroom(budget, resources, myProjects);
    if (!headroom) return 'approval';
    const fits = (resources || [])
        .filter(r => !isAvailability(r))
        .every(r => (quota?.[r.id] ?? 0) <= (headroom[r.id] ?? 0));
    if (fits) return 'instant';
    return beyondAutoApproveRefused(budget) ? 'blocked' : 'approval';
}

// changeOutcome is for a proposed change to an active project `node` under
// `budget` (null when the viewer cannot see it). It mirrors leafChangeDecision
// in the API: giving back, ending sooner and member changes never wait; growing
// and extending take effect at once only where the budget's auto-approve covers
// them — for growth only the DIFFERENCE has to fit, since the project already
// holds its current size.
//
// `manages`: the viewer manages the budget — the hard limit of a budget that
// takes no requests beyond its auto-approve does not bind them.
export function changeOutcome({ node, budget, quota, terminationDate, resources, myProjects, manages = false }) {
    const current = node?.limit || {};
    const counted = (resources || []).filter(r => !isAvailability(r));
    const grows = (resources || []).some(r => isAvailability(r)
        ? (quota?.[r.id] ?? 0) > 0 && (current[r.id] ?? 0) <= 0
        : (quota?.[r.id] ?? 0) > (current[r.id] ?? 0));
    const endOf = (d) => (d ? new Date(d).getTime() : null);
    const currentEnd = endOf(node?.termination_date);
    const nextEnd = endOf(terminationDate);
    const extendsEnd = nextEnd !== null && currentEnd !== null && nextEnd > currentEnd;

    if (!grows && !extendsEnd) return 'instant';
    const beyond = beyondAutoApproveRefused(budget) && !manages ? 'blocked' : 'approval';
    if (!hasAutoApprove(budget) || budget.status !== 'approved') return 'approval';
    if (extendsEnd) {
        const budgetEnd = endOf(budget.termination_date);
        if (budgetEnd !== null && nextEnd > budgetEnd) return beyond;
    }
    if (grows) {
        // An availability newly switched on is no quantity: the policy grants
        // it like a new request would (it is in the budget's scope, or the
        // form would not have offered it).
        const headroom = autoApproveHeadroom(budget, resources, myProjects);
        const fits = counted.every(r =>
            (quota?.[r.id] ?? 0) - (current[r.id] ?? 0) <= (headroom[r.id] ?? 0));
        if (!fits) return beyond;
    }
    return 'instant';
}

// resourceBarSegments turns absolute amounts into the widths of the three
// stacked segments of a usage bar. Split out of ResourceBar so the arithmetic
// can be checked without rendering anything: the clamping is the whole point.
// Each segment is capped by what the ones before it left over, so the segments
// never sum past 100 — otherwise an over-committed budget draws a bar that
// runs out of its own track.
export function resourceBarSegments(limit, { approved = 0, changePending = 0, incoming = 0 } = {}) {
    const pct = (v) => (limit > 0 ? Math.round((v / limit) * 100) : 0);
    const approvedPct = Math.min(100, pct(approved));
    const pendingPct = Math.min(100 - approvedPct, pct(changePending));
    const incomingPct = Math.min(100 - approvedPct - pendingPct, pct(incoming));
    return { approvedPct, pendingPct, incomingPct, totalPct: approvedPct + pendingPct + incomingPct };
}

// limitDelta is one row of the before/after table: what a resource is now, what
// it would become, and the difference. A missing key means 0 — a quota that
// does not mention a resource grants none of it.
export function limitDelta(limitFrom, limitTo, resourceId) {
    const before = limitFrom?.[resourceId] ?? 0;
    const after = limitTo?.[resourceId] ?? 0;
    return { before, after, d: after - before };
}

// nodeChanges answers "what would this change actually do" for a proposed edit:
// which of limit, termination date and member list moved, and who was added,
// removed or given a different role.
//
// Members are compared by token, not by position: the API returns them in no
// guaranteed order, and a list-identity comparison would report every reorder
// as a change. `usersTo === undefined` means the caller is not editing members
// at all, which is different from editing them down to an empty list — hence
// hasUserData rather than checking for an empty array.
export function nodeChanges({ resources, limitFrom, limitTo, dateFrom, dateTo, usersFrom, usersTo } = {}) {
    const hasLimitChange = Boolean(limitFrom && limitTo && resources &&
        resources.some(r => (limitFrom[r.id] ?? 0) !== (limitTo[r.id] ?? 0)));
    // An end given to something that had none is a change too — it is what a
    // budget receiving an end does to everything below it.
    const hasDateChange = Boolean(dateTo &&
        (!dateFrom || new Date(dateFrom).getTime() !== new Date(dateTo).getTime()));

    const hasUserData = usersTo !== undefined && usersTo !== null;
    const from = usersFrom || [];
    const to = usersTo || [];
    const fromMap = new Map(from.map(u => [u.token, u]));
    const toMap = new Map(to.map(u => [u.token, u]));
    const added = hasUserData ? to.filter(u => !fromMap.has(u.token)) : [];
    const removed = hasUserData ? from.filter(u => !toMap.has(u.token)) : [];
    // Carries `previous_role` along: "what it was" is part of the change, and
    // the caller would otherwise have to rebuild the same lookup to render the
    // "member → reader" arrow.
    const roleChanged = hasUserData ? to.flatMap(u => {
        const previous = fromMap.get(u.token);
        return previous && previous.openstack_role !== u.openstack_role
            ? [{ ...u, previous_role: previous.openstack_role }]
            : [];
    }) : [];

    return {
        hasLimitChange,
        hasDateChange,
        added,
        removed,
        roleChanged,
        hasUserChanges: added.length > 0 || removed.length > 0 || roleChanged.length > 0,
    };
}

// One-line resource summary, e.g. "8 vCPUs · 16 GB RAM · 200 GB Disk".
export function resourceSummaryText(resources, quota) {
    if (!resources || !quota) return '';
    return resources
        .filter(r => (quota[r.id] ?? 0) !== 0)
        .map(r => {
            // An availability reads as its own name. "1 DHBW IPv4" invites the
            // question of what two would be, and there is no answer.
            if (isAvailability(r)) return r.name;
            const v = quota[r.id] === UNLIMITED_QUOTA ? '∞' : quota[r.id];
            return r.unit ? `${v} ${r.unit} ${r.name}` : `${v} ${r.name}`;
        })
        .join(' · ');
}

// The resources a project is CHARGED for beyond what it declared, i.e. where
// OpenStack measures more than the granted limit.
//
// Mirrors chargedQuota in the API (internal/tree/service.go) rather than
// re-inventing the rule, including both of its edge cases: a resource MISSING
// from os_in_use means "OpenStack does not measure this", not zero, and an
// unlimited limit stays unlimited. Only a measured value strictly above a
// finite limit is an overage.
//
// Without this the card says "Overcommitted" and then lists the declared
// limit — which is exactly the number that is NOT being billed, so the badge
// states there is a problem while the figures next to it deny it.
export function overageEntries(resources, node) {
    const inUse = node?.os_in_use;
    if (!resources || !inUse) return [];
    return resources.flatMap(r => {
        const limit = node.limit?.[r.id] ?? 0;
        if (limit === UNLIMITED_QUOTA) return [];
        const used = inUse[r.id];
        if (used === undefined || used <= limit) return [];
        return [{ ...r, limit, used }];
    });
}

// "8 Cores · 5 GB RAM" for the overage rows above, in the same shape as
// resourceSummaryText so the two lines read as a pair.
export function overageText(entries) {
    return entries.map(r => (r.unit ? `${r.used} ${r.unit} ${r.name}` : `${r.used} ${r.name}`)).join(' · ');
}

// childrenById turns the per-branch query results of the budget tree into one
// lookup: node id → the loaded page, branches still in flight left out.
//
// It returns a PLAIN OBJECT, and that is load-bearing. react-query hands a
// `combine` result through replaceEqualDeep, which preserves the previous
// reference when the contents are equal — but only for plain objects and
// arrays; anything else (a Map, for one) it returns as-is, i.e. a fresh
// reference on every call. The tree data is memoised on this value and Mantine's
// Tree re-initialises its controller whenever `data` changes identity, and that
// sets state. A Map therefore rendered the view into an infinite loop, which is
// how it shipped in 0.8.13-test.1: "Maximum update depth exceeded", the whole
// section replaced by the error boundary.
//
// If this ever needs a richer container, the identity has to be pinned some
// other way first.
export function childrenById(ids, results) {
    const out = {};
    ids.forEach((id, i) => {
        const page = results[i]?.data;
        if (page) out[id] = page;
    });
    return out;
}

// ── Generic helpers (unchanged semantics) ───────────────────────────────────

export function normalizeObjectResponse(res, fallback = {}) {
    if (res?.data && typeof res.data === 'object' && !Array.isArray(res.data)) {
        if (res.data.data && typeof res.data.data === 'object' && !Array.isArray(res.data.data)) {
            return res.data.data;
        }
        return res.data;
    }
    if (res && typeof res === 'object' && !Array.isArray(res)) {
        return res;
    }
    return fallback;
}

export function formatRoleLabel(roleId) {
    if (!roleId) return '';
    return roleId.charAt(0).toUpperCase() + roleId.slice(1);
}

export function getAuthUserEmail(user) {
    const profile = user?.profile || {};
    return profile.email || '';
}

// Re-exported so the projects area keeps one import for its formatting, while
// the decision itself lives in one module for the whole UI.
export { formatDate, formatDateTime } from '../format-date.js';
import { formatDate } from '../format-date.js';

// Formats a date value as "05.08.2026 (in 2 months)" or '—' if falsy.
export function formatRelativeDate(d) {
    return d ? `${formatDate(d)} (${dayjs(d).fromNow()})` : '—';
}

// expiryTone turns "how much time is left" into a colour. A date years away is
// background information; one that is days away is the most important thing on
// the card, and grey text does not say that.
export function expiryTone(d) {
    if (!d) return 'gray';
    const days = dayjs(d).diff(dayjs(), 'day');
    if (days <= 14) return 'red';
    if (days <= 60) return 'orange';
    return 'gray';
}

// expiryLabel reads as a sentence in both directions: "Valid until 4/8/2027
// (in a year)" / "Expired 2/8/2026 (2 days ago)". The relative part comes from
// dayjs' relativeTime plugin, so "in 13 days", "in a month", "in a year" are
// phrased the way a person would say them.
export function expiryLabel(t, d) {
    if (!d) return '';
    return isExpired(d)
        ? t('projects.expiry.expiredOn', { date: formatRelativeDate(d) })
        : t('projects.expiry.validUntil', { date: formatRelativeDate(d) });
}

// expiryValue is the same information without the leading words, for places
// that already carry a "Valid until:" label of their own.
export function expiryValue(t, d) {
    if (!d) return '';
    return isExpired(d) ? t('projects.expiry.expiredValue', { date: formatRelativeDate(d) }) : formatRelativeDate(d);
}

export function isExpired(d) {
    return !!d && dayjs(d).isBefore(dayjs());
}

// ── Requests waiting for a decision ─────────────────────────────────────────

// The four kinds of thing a manager decides on. Used by the filter in the
// budget tree; the values are also what `requestType` returns.
export const REQUEST_TYPE_VALUES = ['project', 'budget', 'change', 'imported'];

export function requestTypes(t) {
    return REQUEST_TYPE_VALUES.map(value => ({ value, label: t(`projects.requestTypes.${value}`) }));
}

// Classifies a node into one of REQUEST_TYPES; null when it waits for nobody.
export function requestType(node) {
    if (isImported(node)) return 'imported';
    if (node?.status === 'change_pending') return 'change';
    if (node?.status !== 'pending') return null;
    return isBudget(node) ? 'budget' : 'project';
}

// Re-exported so the existing `import { formatError } from './util-project.jsx'`
// call sites keep working; the implementation lives with its sibling
// apiErrorMessage in /helper/api-error.js. Imported rather than re-exported
// straight through because useAsyncRefresh below calls it locally.
export { formatError };

// Custom hook that wraps an async fetcher with loading and error state.
// `loaded` flips true after the first attempt completes and stays true, so
// callers can show a loader only on the INITIAL load and keep rendering stale
// content across refreshes (stale-while-revalidate) — no blank-out flicker.
// Usage:
//   const { loading, loaded, refresh } = useAsyncRefresh(async () => {
//       setNodes(await api.listMine());
//   });
//   useEffect(() => { refresh(); }, [api]);
export function useAsyncRefresh(fetcher, onError) {
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);

    const refresh = async () => {
        setLoading(true);
        try {
            await fetcher();
        } catch (e) {
            onError?.(formatError(e));
        } finally {
            setLoading(false);
            setLoaded(true);
        }
    };

    return { loading, loaded, refresh };
}
