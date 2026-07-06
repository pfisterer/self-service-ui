import { useState } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

// Sentinel value matching backend common.UnlimitedQuota: -1 means no cap on a resource.
export const UNLIMITED_QUOTA = -1;

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

// Returns Mantine badge color + variant for a request/delegation status.
export function statusStyle(status) {
    switch (status) {
        case 'approved': return { color: 'green', variant: 'filled' };
        case 'pending': return { color: 'blue', variant: 'outline' };
        case 'change_pending': return { color: 'orange', variant: 'outline' };
        case 'change_rejected': return { color: 'red', variant: 'outline' };
        case 'rejected': return { color: 'red', variant: 'filled' };
        case 'released': return { color: 'gray', variant: 'light' };
        case 'openstack_only': return { color: 'violet', variant: 'light' };
        default: return { color: 'gray', variant: 'outline' };
    }
}

// Returns the human-readable label for a status string.
export function statusLabel(status) {
    const labels = {
        approved: 'Approved',
        pending: 'Pending',
        change_pending: 'Change Pending',
        change_rejected: 'Change Rejected',
        rejected: 'Rejected',
        released: 'Released',
        openstack_only: 'OpenStack Only',
    };
    return labels[status] ?? status;
}

// Returns true when a request is a read-only synthetic openstack_only record.
export function isReadOnly(req) {
    return req?.status === 'openstack_only';
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
// Usage:
//   const { loading, error, refresh } = useAsyncRefresh(async () => {
//       const res = await sdk.listMyProjects({ client });
//       setRequests(normalizeArrayResponse(res));
//   });
//   useEffect(() => { refresh(); }, [client, sdk]);
export function useAsyncRefresh(fetcher, onError) {
    const [loading, setLoading] = useState(false);

    const refresh = async () => {
        setLoading(true);
        try {
            await fetcher();
        } catch (e) {
            onError?.(formatError(e));
        } finally {
            setLoading(false);
        }
    };

    return { loading, refresh };
}
