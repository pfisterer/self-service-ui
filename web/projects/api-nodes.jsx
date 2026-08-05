import { useMemo } from 'react';
import { useClient } from '../providers/client.jsx';
import { normalizeArrayResponse, normalizeObjectResponse } from './util-project.jsx';

// useNodesApi wraps every node-tree SDK operation with uniform error handling,
// so views and modals never deal with transport envelopes, headers or the
// hey-api error shape. Every function either returns clean data or THROWS an
// Error with the server's message — callers handle errors in one place
// (typically useAsyncRefresh's onError or a try/catch around a submit).
//
// Returns null until the SDK module is loaded; callers should render a loader.

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// Extracts the server's error message from a hey-api result envelope.
function errorOf(res) {
    return res?.error?.error ?? res?.error?.detail ?? res?.error?.message
        ?? (res?.error ? String(res.error) : null);
}

function unwrapArray(res) {
    const err = errorOf(res);
    if (err) throw new Error(err);
    return normalizeArrayResponse(res);
}

function unwrapObject(res) {
    const err = errorOf(res);
    if (err) throw new Error(err);
    return normalizeObjectResponse(res);
}

function unwrapVoid(res) {
    const err = errorOf(res);
    if (err) throw new Error(err);
}

export function useNodesApi() {
    const { client, sdk } = useClient('projects');

    return useMemo(() => {
        if (!client || !sdk) return null;

        // Lists are capped generously; the deployment scale (one university)
        // stays far below this, so the UI skips pagination controls.
        const PAGE = { limit: 500, offset: 0 };

        return {
            // ── Configuration ────────────────────────────────────────────
            getConfig: async () =>
                unwrapObject(await sdk.getConfig({ client })),

            // ── Reading the tree ─────────────────────────────────────────
            getNode: async (id) =>
                unwrapObject(await sdk.getNode({ client, path: { id } })),
            listChildren: async (id) =>
                unwrapArray(await sdk.listNodeChildren({ client, path: { id }, query: PAGE })),
            listMine: async () =>
                unwrapArray(await sdk.listMyNodes({ client, query: PAGE })),
            listMyBudgets: async () =>
                unwrapArray(await sdk.listMyBudgets({ client, query: PAGE })),
            // scope 'direct' = requests nobody else manages, 'subtree' = everything
            // below my budgets, including what a sub-budget's manager should handle.
            listToManage: async (scope = 'direct') =>
                unwrapArray(await sdk.listNodesToManage({ client, query: { ...PAGE, scope } })),
            listEligibleForMe: async () =>
                unwrapArray(await sdk.listEligibleBudgets({ client, query: PAGE })),
            listEligibleForOwner: async (ownerTokens) =>
                unwrapArray(await sdk.listEligibleBudgetsForOwner({
                    client, query: { ...PAGE, owner_token: ownerTokens },
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

            // ── Group search (token pickers) ─────────────────────────────
            searchGroups: async (q, limit = 50) => {
                const res = await sdk.searchGroups({ client, query: { q, limit } });
                const err = errorOf(res);
                if (err) throw new Error(err);
                return res?.data?.tokens || [];
            },
        };
    }, [client, sdk]);
}
