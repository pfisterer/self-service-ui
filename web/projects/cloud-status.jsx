import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '/providers/auth.jsx';
import { useClient } from '../providers/client.jsx';

// What the header has to know about the cloud section without opening it:
//
//   isRoot   whether to offer the Root Admin entry at all
//   pending  how many requests wait for this user's decision — the number that
//            used to be the reason for an "Approvals" tab. Without it nobody
//            learns that something arrived until they go looking.
//
// It lives above the header (see index.jsx) because the menu is rendered there,
// and the views below call refresh() after every decision so the badge follows
// what just happened.

const CloudStatusContext = createContext(null);
const EMPTY = { isRoot: false, pending: 0, refresh: () => {} };

export function CloudStatusProvider({ children }) {
    const { sdk, client } = useClient('projects');
    const { user } = useAuth();
    const [state, setState] = useState({ isRoot: false, pending: 0 });

    const refresh = useCallback(async () => {
        if (!client || !sdk || !user) return;
        // Role-switch eligibility is the proxy for "is a root admin": `allowed`
        // reflects the REAL caller (it stays true while impersonating, so they
        // can still reset), but an impersonated identity has dropped root, so
        // the entry must follow the impersonated user instead.
        const [role, toManage] = await Promise.allSettled([
            sdk.getRoleSwitch({ client }),
            // 'direct': the badge counts what is this user's to decide. Requests
            // inside delegated sub-budgets belong to their manager — counting
            // them would nag a root admin with the whole organization.
            sdk.listNodesToManage({ client, query: { limit: 200, offset: 0, scope: 'direct' } }),
        ]);
        setState({
            isRoot: role.status === 'fulfilled'
                && !!role.value?.data?.allowed
                && !role.value?.data?.impersonated_user,
            pending: toManage.status === 'fulfilled'
                ? (toManage.value?.data || []).length
                : 0,
        });
    }, [client, sdk, user]);

    useEffect(() => { refresh(); }, [refresh]);

    const value = useMemo(() => ({ ...state, refresh }), [state, refresh]);
    return <CloudStatusContext.Provider value={value}>{children}</CloudStatusContext.Provider>;
}

// Inert outside the provider (e.g. when the cloud section is not configured at
// all), so callers never need to check.
export function useCloudStatus() {
    return useContext(CloudStatusContext) ?? EMPTY;
}
