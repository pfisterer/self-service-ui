import { useMemo } from 'react';
import { apiError, apiErrorMessage } from '/helper/api-error.js';
import { useClient } from '/providers/client.jsx';
// Named imports for the same reason as in dyndns/api-zones.jsx: an operation
// missing from the client fails the build, not the browser.
import {
    blockMachine, createAccessRule, createKey, deleteAccessRule, deleteFleetPackage,
    deleteKey, forgetMachine, getFleet, getMe, getUsage, listAccessRules, listGpuTiers, listTiers,
    searchPrincipals, unblockMachine, updateAccessRule,
} from '@dhbw-cloud/llm-client';

// useLlmApi is the one place that knows the transport of the LLM section.
// Every call returns clean data or throws an Error carrying the server's
// message (and its status, so useApiMutation can recognise a 409).
function unwrap(res) {
    if (apiErrorMessage(res)) throw apiError(res);
    return res?.data;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function useLlmApi() {
    const client = useClient('llm');

    return useMemo(() => {
        const call = async (op, opts = {}) => unwrap(await op({ client, ...opts }));
        return {
            getMe: () => call(getMe),
            getUsage: () => call(getUsage),
            createKey: (name) => call(createKey, { body: { name }, headers: JSON_HEADERS }),
            deleteKey: (id) => call(deleteKey, { path: { id } }),

            getFleet: () => call(getFleet),
            blockMachine: (serial) => call(blockMachine, { path: { serial } }),
            unblockMachine: (serial) => call(unblockMachine, { path: { serial } }),
            forgetMachine: (serial) => call(forgetMachine, { path: { serial } }),
            deletePackage: () => call(deleteFleetPackage),

            listAccessRules: async () => (await call(listAccessRules)) ?? [],
            createAccessRule: (rule) => call(createAccessRule, { body: rule, headers: JSON_HEADERS }),
            updateAccessRule: (id, rule) => call(updateAccessRule, { path: { id }, body: rule, headers: JSON_HEADERS }),
            deleteAccessRule: (id) => call(deleteAccessRule, { path: { id } }),
            listTiers: async () => (await call(listTiers)) ?? [],
            listGpuTiers: async () => (await call(listGpuTiers)) ?? [],
            // Same shape as the projects facade's searchPrincipalDetails, for
            // the shared PrincipalTokenAutocomplete: groups first, then people.
            searchPrincipalDetails: async (q, limit = 10) => {
                const data = await call(searchPrincipals, { query: { q, limit } });
                return [
                    ...(data?.groups ?? []).filter(g => g?.token),
                    ...(data?.users ?? []).map(email => ({ token: `user:${email}`, description: null })),
                ];
            },
        };
    }, [client]);
}

// Downloads (profile, package, CSV, guide) are plain links rather than SDK
// calls: the browser has to save the answer as a file, and in BFF mode the
// session cookie authenticates a same-origin navigation just as it does a
// fetch. Resolved relative to the base URL, like the swagger page does.
export function llmDownloadUrl(path, params) {
    // The base itself against the page, so a relative one ("/api/llm/") works too.
    const base = new URL(window.appconfig?.llmBaseUrl || '', window.location.href);
    const url = new URL(path.replace(/^\//, ''), base);
    for (const [k, v] of Object.entries(params ?? {})) {
        if (v) url.searchParams.set(k, v);
    }
    return url.href;
}
