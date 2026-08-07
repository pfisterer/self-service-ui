import { createContext, useContext, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '/providers/auth.jsx';
import { useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';

// What the header has to know about the cloud section without opening it:
//
//   isRoot     whether to offer the Root Admin entry at all
//   pending    how many requests wait for this user's decision — the number
//              that used to be the reason for an "Approvals" tab. Without it
//              nobody learns that something arrived until they go looking.
//   hasBudgets whether the budget view has anything for this user: a budget
//              they manage, or one they may request. A first-time student has
//              neither, and the entry is left out (see nav.jsx) instead of
//              leading to a box that says so.
//
// It lives above the header (see index.jsx) because the menu is rendered there,
// and the views below call refresh() after every decision so the badge follows
// what just happened.

const CloudStatusContext = createContext(null);
const EMPTY = { isRoot: false, pending: 0, hasBudgets: false, ready: false, refresh: () => {} };

export function CloudStatusProvider({ children }) {
    const api = useNodesApi();
    const { user } = useAuth();

    // Independent questions, asked in parallel and cached under one key so the
    // header does not re-ask on every render. Promise.allSettled keeps the old
    // behaviour: one failing half degrades to its default rather than emptying
    // the badge or the menu.
    const statusQuery = useQuery({
        queryKey: projectKeys.rootStatus(),
        queryFn: async () => {
            const [role, pending, myBudgets, eligible] = await Promise.allSettled([
                // `allowed` reflects the REAL caller (it stays true while
                // impersonating, so they can still reset), but an impersonated
                // identity has dropped root, so the entry follows the
                // impersonated user instead.
                api.getRoleSwitch(),
                // 'direct': what is this user's to decide. Requests inside
                // delegated sub-budgets belong to their manager — counting them
                // would nag a root admin with the whole organization.
                api.countToManage('direct'),
                // Counts only, no rows — the menu asks "any?", not "which?".
                api.countMyBudgets(),
                api.countEligibleForMe(),
            ]);
            const count = (r) => (r.status === 'fulfilled' ? (r.value ?? 0) : 0);
            return {
                isRoot: role.status === 'fulfilled'
                    && !!role.value?.allowed
                    && !role.value?.impersonated_user,
                pending: count(pending),
                hasBudgets: count(myBudgets) > 0 || count(eligible) > 0,
            };
        },
        enabled: !!api && !!user,
    });

    const value = useMemo(() => ({
        isRoot: statusQuery.data?.isRoot ?? false,
        pending: statusQuery.data?.pending ?? 0,
        hasBudgets: statusQuery.data?.hasBudgets ?? false,
        // Whether the answers above are KNOWN yet. Until the query settles,
        // isRoot is false because nothing has been asked — not because the user
        // is not root. Anything that acts on the difference (a route that
        // unregisters, a redirect) has to wait for this, or it fires on every
        // page load before the answer arrives.
        ready: statusQuery.isSuccess || statusQuery.isError,
        refresh: statusQuery.refetch,
    }), [statusQuery.data, statusQuery.isSuccess, statusQuery.isError, statusQuery.refetch]);

    return <CloudStatusContext.Provider value={value}>{children}</CloudStatusContext.Provider>;
}

// Inert outside the provider (e.g. when the cloud section is not configured at
// all), so callers never need to check.
export function useCloudStatus() {
    return useContext(CloudStatusContext) ?? EMPTY;
}
