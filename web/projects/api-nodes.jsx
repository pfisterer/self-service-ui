import { useMemo } from 'react';
import { apiErrorMessage } from '/helper/api-error.js';
import { useClient } from '../providers/client.jsx';
import { normalizeObjectResponse } from './util-project.jsx';

// useNodesApi wraps every node-tree SDK operation with uniform error handling,
// so views and modals never deal with transport envelopes, headers or the
// hey-api error shape. Every function either returns clean data or THROWS an
// Error with the server's message — callers handle errors in one place
// (typically useAsyncRefresh's onError or a try/catch around a submit).
//
// Returns null until the SDK module is loaded; callers should render a loader.

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function unwrapObject(res) {
    const err = apiErrorMessage(res);
    if (err) throw new Error(err);
    return normalizeObjectResponse(res);
}

function unwrapVoid(res) {
    const err = apiErrorMessage(res);
    if (err) throw new Error(err);
}

// Every listing answers with { items, total }: total counts the matches BEFORE
// the page was cut, so a caller can always tell a complete list from the first
// page of a longer one. Nothing in this UI may show a list without knowing that.
function unwrapPage(res) {
    const err = apiErrorMessage(res);
    if (err) throw new Error(err);
    const data = normalizeObjectResponse(res);
    const items = Array.isArray(data.items) ? data.items : [];
    return { items, total: Number.isInteger(data.total) ? data.total : items.length };
}

// PAGE_SIZE is one page of tree children or search hits — small enough that a
// course budget with hundreds of student projects arrives in readable chunks
// and the DOM never holds more rows than someone asked to see.
export const PAGE_SIZE = 50;

export function useNodesApi() {
    const { client, sdk } = useClient('projects');

    return useMemo(() => {
        if (!client || !sdk) return null;

        // Lists that grow with one person's own work — the projects they own,
        // the budgets delegated to them, the decisions on their desk. These are
        // bounded by what a human can keep track of, so they are fetched in one
        // go; the views say so when the cap is ever hit rather than pretending
        // the list is complete.
        const BOUNDED = { limit: 500, offset: 0 };

        return {
            // ── Configuration ────────────────────────────────────────────
            getConfig: async () =>
                unwrapObject(await sdk.getConfig({ client })),

            // ── Reading the tree ─────────────────────────────────────────
            getNode: async (id) =>
                unwrapObject(await sdk.getNode({ client, path: { id } })),
            // The one list that has no natural bound: a course budget holds as
            // many projects as it has students. Loaded one page at a time.
            listChildren: async (id, { limit = PAGE_SIZE, offset = 0 } = {}) =>
                unwrapPage(await sdk.listNodeChildren({ client, path: { id }, query: { limit, offset } })),
            // Full-text search over everything below the budgets the caller
            // manages. Server-side because the tree is no longer fully loaded.
            searchNodes: async (q, { limit = PAGE_SIZE, offset = 0 } = {}) =>
                unwrapPage(await sdk.searchNodes({ client, query: { q, limit, offset } })),
            listMine: async () =>
                unwrapPage(await sdk.listMyNodes({ client, query: BOUNDED })),
            listMyBudgets: async () =>
                unwrapPage(await sdk.listMyBudgets({ client, query: BOUNDED })),
            // scope 'direct' = requests nobody else manages, 'subtree' = everything
            // below my budgets, including what a sub-budget's manager should handle.
            listToManage: async (scope = 'direct') =>
                unwrapPage(await sdk.listNodesToManage({ client, query: { ...BOUNDED, scope } })),
            listEligibleForMe: async () =>
                unwrapPage(await sdk.listEligibleBudgets({ client, query: BOUNDED })),
            listEligibleForOwner: async (ownerTokens) =>
                unwrapPage(await sdk.listEligibleBudgetsForOwner({
                    client, query: { ...BOUNDED, owner_token: ownerTokens },
                })),

            // ── Creating and editing ─────────────────────────────────────
            createNode: async (body) =>
                unwrapObject(await sdk.createNode({ client, body, headers: JSON_HEADERS })),
            updateNode: async (id, body) =>
                unwrapObject(await sdk.updateNode({ client, path: { id }, body, headers: JSON_HEADERS })),
            requestChange: async (id, body) =>
                unwrapObject(await sdk.requestNodeChange({ client, path: { id }, body, headers: JSON_HEADERS })),

            // ── Lifecycle decisions ──────────────────────────────────────
            approve: async (id, modifiedLimit = null) =>
                unwrapObject(await sdk.approveNode({
                    client, path: { id },
                    body: modifiedLimit ? { modified_limit: modifiedLimit } : {},
                    headers: JSON_HEADERS,
                })),
            reject: async (id, reason) =>
                unwrapObject(await sdk.rejectNode({
                    client, path: { id },
                    body: reason ? { reason } : {},
                    headers: JSON_HEADERS,
                })),
            release: async (id) =>
                unwrapObject(await sdk.releaseNode({ client, path: { id } })),

            // ── Structural operations ────────────────────────────────────
            move: async (id, newParentId) =>
                unwrapObject(await sdk.reparentNode({
                    client, path: { id }, body: { new_parent_id: newParentId }, headers: JSON_HEADERS,
                })),
            transferOwner: async (id, newOwner) =>
                unwrapObject(await sdk.transferNodeOwner({
                    client, path: { id }, body: { new_owner: newOwner }, headers: JSON_HEADERS,
                })),
            adopt: async (id, body) =>
                unwrapObject(await sdk.promoteNode({ client, path: { id }, body, headers: JSON_HEADERS })),
            deleteNode: async (id) =>
                unwrapVoid(await sdk.deleteNode({ client, path: { id } })),

            // ── Root-admin surface ───────────────────────────────────────
            // Role-switch eligibility doubles as "is a root admin".
            getRoleSwitch: async () => unwrapObject(await sdk.getRoleSwitch({ client })),
            // Only the COUNT is wanted, so ask for one row: the listing reports
            // how many matches it was cut from, which makes the badge exact
            // without fetching a single row it would ever show.
            countToManage: async (scope = 'direct') =>
                unwrapPage(await sdk.listNodesToManage({ client, query: { limit: 1, offset: 0, scope } })).total,
            getReconcileStatus: async () => {
                const res = await sdk.getAdminReconcileStatus({ client });
                // 503 = the reconciler is switched off in this environment. Not
                // an error: the panel simply has nothing to show.
                if (res.response?.status === 503) return null;
                return unwrapObject(res);
            },
            triggerReconcile: async () => unwrapObject(await sdk.triggerAdminReconcile({ client })),
            clearRoleSwitch: async () => unwrapObject(await sdk.clearRoleSwitch({ client })),
            setRoleSwitch: async (body) =>
                unwrapObject(await sdk.setRoleSwitch({ client, body, headers: JSON_HEADERS })),
            // Impersonation candidates come from the same principal search that
            // fills every token field — there is no separate "assumable
            // identities" list, because it would expose the same addresses
            // behind a second door.
            searchIdentities: async (q, limit) => {
                const data = unwrapObject(await sdk.searchPrincipals({ client, query: { q, limit } }));
                return (data?.users || []).map(email => ({ email, label: email }));
            },

            // ── Principal search (token pickers) ─────────────────────────
            // Returns ready-to-use tokens: groups (matched on name, display name
            // or description) followed by users (matched on their email address
            // only, and only for a non-empty query — staff are not browsable).
            // Same endpoint as searchPrincipals, but keeping the group labels
            // and descriptions the autocomplete shows under each option.
            searchPrincipalDetails: async (q, limit = 10) => {
                const data = unwrapObject(await sdk.searchPrincipals({ client, query: { q, limit } }));
                return [
                    ...(data?.groups || []).filter(g => g?.token),
                    ...(data?.users || []).map(email => ({ token: `user:${email}`, description: 'Individual person' })),
                ];
            },
            searchPrincipals: async (q, limit = 50) => {
                const res = await sdk.searchPrincipals({ client, query: { q, limit } });
                const err = apiErrorMessage(res);
                if (err) throw new Error(err);
                return [
                    ...(res?.data?.groups || []).map(g => g?.token).filter(Boolean),
                    ...(res?.data?.users || []).map(email => `user:${email}`),
                ];
            },
        };
    }, [client, sdk]);
}
