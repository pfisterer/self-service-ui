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

// ── Status vocabulary ───────────────────────────────────────────────────────
// One place defines how every status looks and reads across the whole UI.

const STATUS_META = {
    pending: { label: 'Awaiting approval', color: 'blue', variant: 'outline' },
    approved: { label: 'Active', color: 'green', variant: 'filled' },
    change_pending: { label: 'Change requested', color: 'orange', variant: 'outline' },
    rejected: { label: 'Rejected', color: 'red', variant: 'filled' },
    released: { label: 'Released', color: 'gray', variant: 'light' },
    imported: { label: 'Imported', color: 'violet', variant: 'light' },
};

// Returns Mantine badge color + variant for a node status.
export function statusStyle(status) {
    return STATUS_META[status] ?? { color: 'gray', variant: 'outline' };
}

// Returns the human-readable label for a status string.
export function statusLabel(status) {
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

export function normalizeArrayResponse(res) {
    if (Array.isArray(res?.data)) return res.data;
    if (Array.isArray(res?.data?.data)) return res.data.data;
    if (Array.isArray(res)) return res;
    return [];
}

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
