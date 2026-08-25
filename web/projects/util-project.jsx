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
// rather than everyday English — so each one has to say what it means for the
// person reading it: what happened, what it costs, what they can do next.
const STATUS_META = {
    pending: {
        label: 'Awaiting approval', color: COLOR.attention, variant: 'outline',
        description: 'Requested, but nothing exists yet. Someone who manages the paying budget has to approve it first.',
    },
    approved: {
        label: 'Active', color: COLOR.positive, variant: 'filled',
        description: 'Approved and running. The OpenStack project exists and the resources shown here are reserved for you.',
    },
    change_pending: {
        label: 'Change requested', color: COLOR.attention, variant: 'outline',
        description: 'A change is waiting for a decision. Until it is approved the project keeps running on its previous limits, and those are what it costs.',
    },
    rejected: {
        label: 'Rejected', color: COLOR.negative, variant: 'filled',
        description: 'The request was turned down. Nothing was created and nothing is charged to the budget.',
    },
    released: {
        // The one people ask about: they gave the project up, expect it gone,
        // and see it still listed and still charged. Both are true and both are
        // deliberate — releasing asks for deletion, it does not perform it.
        label: 'Released', color: COLOR.identity, variant: 'light',
        description: 'You gave this project up. It stays listed — and keeps using its budget — until OpenStack has actually deleted it, because until then the machines are still running. This cannot be undone.',
    },
    imported: {
        label: 'Imported', color: COLOR.outside, variant: 'light',
        description: 'Found in OpenStack but not managed here — it was created outside the self-service. It has to be adopted into a budget before it can be changed.',
    },
};

// A leaf that is approved but has no OpenStack project yet. The reconciler runs
// on an interval, so "granted" and "usable" are minutes apart — and calling that
// window "Active" sends people looking for a project that is not there.
// Only meaningful while provisioning actually runs; with the reconciler off,
// nothing ever gets an ID and every project would be stuck on "Setting up".
const PROVISIONING_META = {
    label: 'Setting up', color: COLOR.attention, variant: 'filled',
    description: 'Approved. The OpenStack project is being created — this usually takes a few minutes.',
};

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

// Returns the human-readable label for a status string.
export function statusLabel(status, provisioning = false) {
    if (provisioning) return PROVISIONING_META.label;
    return STATUS_META[status]?.label ?? status;
}

// Returns the sentence explaining a status, or '' for one we have no words for
// — callers render no tooltip rather than an empty one.
export function statusDescription(status, provisioning = false) {
    if (provisioning) return PROVISIONING_META.description;
    return STATUS_META[status]?.description ?? '';
}

// Returns true for reconciler-imported OpenStack projects that are not yet
// part of the managed lifecycle (read-only until adopted).
export function isImported(node) {
    return node?.status === 'imported';
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
export function quotaFits(budget, requestedQuota, resources) {
    return (resources || []).every(r => (requestedQuota?.[r.id] ?? 0) <= freeAmount(budget, r.id));
}

// autoApproveHeadroom returns the largest request a budget would approve on the
// spot for this user, or null when the budget has no auto-approve policy.
//
// The backend grants instantly while the requester's own ACTIVE usage under the
// budget stays within its per-requester limit AND every ancestor still has room
// (see the auto-approve branch of CreateNode). Both halves are mirrored here:
// the personal cap minus what this user already holds, capped by the budget's
// own free capacity. Own usage is summed from the caller's projects because the
// node's `usage` is the total over all owners.
export function autoApproveHeadroom(budget, resources, myProjects) {
    const perRequester = budget?.auto_approve?.per_requester_limit;
    if (!perRequester) return null;

    const mine = {};
    for (const project of myProjects || []) {
        if (project?.parent_id !== budget.id) continue;
        // Same definition of "active" the server uses for this sum.
        if (project.status !== 'approved' && project.status !== 'change_pending') continue;
        for (const r of resources || []) {
            mine[r.id] = (mine[r.id] || 0) + (project.limit?.[r.id] || 0);
        }
    }

    const out = {};
    for (const r of resources || []) {
        const personal = Math.max(0, (perRequester[r.id] ?? 0) - (mine[r.id] || 0));
        const free = freeAmount(budget, r.id);
        out[r.id] = Math.max(0, Math.min(personal, free));
    }
    return out;
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
    const hasDateChange = Boolean(dateFrom && dateTo &&
        new Date(dateFrom).getTime() !== new Date(dateTo).getTime());

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
export function expiryLabel(d) {
    if (!d) return '';
    return `${isExpired(d) ? 'Expired' : 'Valid until'} ${formatRelativeDate(d)}`;
}

// expiryValue is the same information without the leading words, for places
// that already carry a "Valid until:" label of their own.
export function expiryValue(d) {
    if (!d) return '';
    return isExpired(d) ? `${formatRelativeDate(d)} — expired` : formatRelativeDate(d);
}

export function isExpired(d) {
    return !!d && dayjs(d).isBefore(dayjs());
}

// ── Requests waiting for a decision ─────────────────────────────────────────

// The four kinds of thing a manager decides on. Used by the filter in the
// budget tree; the keys are also what `requestType` returns.
export const REQUEST_TYPES = [
    { value: 'project', label: 'New projects' },
    { value: 'budget', label: 'New budgets' },
    { value: 'change', label: 'Change requests' },
    { value: 'imported', label: 'Imported' },
];

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
