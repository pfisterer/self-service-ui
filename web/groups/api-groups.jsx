import { useMemo } from 'react';
import { apiError, apiErrorMessage } from '/helper/api-error.js';
import { useClient } from '/providers/client.jsx';
// Named imports, as in llm/api-llm.jsx: an operation missing from the client fails the build, not the browser.
import {
    manageAddManager, manageAddMember, manageChangeRelation, manageCreateGroup, manageDeleteGroup, manageEffectiveMembers, manageGetGroup,
    manageGetMe, manageHistory, manageListGroups, manageListSources, manageRemoveManager, manageRemoveMember, manageSearchPrincipals,
    manageUpdateGroup,
} from '@dhbw-cloud/role-provider-client';

// useGroupsApi is the one place that knows the transport of the groups section: the role provider's /v1/manage, reached through the UI's own proxy. Every call returns clean data or throws an Error carrying the server's message and status.
function unwrap(res) {
    if (apiErrorMessage(res)) throw apiError(res);
    return res?.data;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function useGroupsApi() {
    const client = useClient('groups');

    return useMemo(() => {
        const call = async (op, opts = {}) => unwrap(await op({ client, ...opts }));
        return {
            getMe: () => call(manageGetMe),
            // One page { items, total }. For admins: { parent } lists the groups in a group, { q, source? } searches, { source } is the top of a source's tree; everybody else gets the groups they maintain, narrowed by q.
            listGroups: ({ q, source, parent, limit } = {}) => call(manageListGroups, {
                query: Object.fromEntries(Object.entries({ q, source, parent, limit }).filter(([, v]) => v)),
            }),
            // Admins only: every source with its number of groups, the local one first.
            listSources: () => call(manageListSources),
            createGroup: ({ id, displayName, description, managers }) =>
                call(manageCreateGroup, { body: { id, display_name: displayName, description, managers }, headers: JSON_HEADERS }),
            getGroup: (group) => call(manageGetGroup, { path: { group } }),
            updateGroup: (group, { displayName, description }) =>
                call(manageUpdateGroup, { path: { group }, body: { display_name: displayName, description }, headers: JSON_HEADERS }),
            deleteGroup: (group) => call(manageDeleteGroup, { path: { group } }),
            // expiresAt: a Date or null for an entry that does not expire.
            addMember: (group, { member, relation, expiresAt }) =>
                call(manageAddMember, {
                    path: { group },
                    body: { member, relation: relation === 'member' ? '' : relation, ...(expiresAt ? { expires_at: expiresAt.toISOString() } : {}) },
                    headers: JSON_HEADERS,
                }),
            removeMember: (group, { member, relation }) => call(manageRemoveMember, { path: { group }, query: { member, relation } }),
            // One step on the server: the entry never holds both roles or neither, and its end date stays.
            changeRelation: (group, { member, relation, newRelation }) =>
                call(manageChangeRelation, { path: { group }, body: { member, relation, new_relation: newRelation }, headers: JSON_HEADERS }),
            effectiveMembers: (group) => call(manageEffectiveMembers, { path: { group } }),
            addManager: (group, manager) => call(manageAddManager, { path: { group }, body: { manager }, headers: JSON_HEADERS }),
            removeManager: (group, manager) => call(manageRemoveManager, { path: { group }, query: { manager } }),
            history: (group) => call(manageHistory, { path: { group } }),
            // In the shape PrincipalTokenAutocomplete expects: groups with their labels (the source in the description, so "wwi23seb" and its origin read together), then addresses.
            searchPrincipals: async (q, limit) => {
                const res = await call(manageSearchPrincipals, { query: { q, limit } });
                return [
                    ...(res?.groups ?? []).map(g => ({
                        token: g.token,
                        label: g.display_name && g.display_name !== g.id ? g.display_name : '',
                        description: [g.description, g.source_name && `(${g.source_name})`].filter(Boolean).join(' '),
                    })),
                    ...(res?.users ?? []).map(email => ({ token: `user:${email}` })),
                ];
            },
        };
    }, [client]);
}
