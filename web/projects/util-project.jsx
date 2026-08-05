import { useState } from 'react';
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

const STATUS_META = {
    pending: { label: 'Awaiting approval', color: COLOR.attention, variant: 'outline' },
    approved: { label: 'Active', color: COLOR.positive, variant: 'filled' },
    change_pending: { label: 'Change requested', color: COLOR.attention, variant: 'outline' },
    rejected: { label: 'Rejected', color: COLOR.negative, variant: 'filled' },
    released: { label: 'Released', color: COLOR.identity, variant: 'light' },
    imported: { label: 'Imported', color: COLOR.outside, variant: 'light' },
};

// A leaf that is approved but has no OpenStack project yet. The reconciler runs
// on an interval, so "granted" and "usable" are minutes apart — and calling that
// window "Active" sends people looking for a project that is not there.
// Only meaningful while provisioning actually runs; with the reconciler off,
// nothing ever gets an ID and every project would be stuck on "Setting up".
const PROVISIONING_META = { label: 'Setting up', color: COLOR.attention, variant: 'filled' };

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

// Formats a date value as a locale date string, or '—' if falsy.
export function formatDate(d) {
    return d ? new Date(d).toLocaleDateString() : '—';
}

// Formats a date value as "MM/DD/YYYY (relative)" or '—' if falsy.
export function formatRelativeDate(d) {
    return d ? `${new Date(d).toLocaleDateString()} (${dayjs(d).fromNow()})` : '—';
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

// Extracts a user-friendly error message from a thrown value.
export function formatError(err) {
    return err?.message ?? String(err);
}

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
