import { useMemo } from 'react';
import { apiError, apiErrorMessage } from '/helper/api-error.js';
import { allPages } from '/helper/pages.js';
import { useClient } from '/providers/client.jsx';
// Named imports for the same reason as in dyndns/api-zones.jsx: an operation
// missing from the client fails the build, not the browser.
import {
    blockMachine, createApiToken, createKey, deleteApiToken, deleteCatalogModel, deleteFleetPackage,
    deleteKey, forgetMachine, listApiTokens, getFleet, getFleetInference, getMe, getModelAliases, getModelCatalog, getUsage,
    putCatalogModel, putTierModel, setDefaultProject, setFleetModel, unblockMachine,
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
            // Without a project the key goes to the default project.
            createKey: (name, project) => call(createKey, { body: { name, ...(project ? { project } : {}) }, headers: JSON_HEADERS }),
            setDefaultProject: (project) => call(setDefaultProject, { body: { project }, headers: JSON_HEADERS }),
            deleteKey: (id) => call(deleteKey, { path: { id } }),
            // Personal API tokens (aiaas_…) for the management API — scripts, CI, notebooks. Not the LLM keys above: those are for the OpenAI-compatible API. ttlHours as the API defines it: 0 means the configured default. The created token comes back directly (201), with its secret in token_string, as from os-mgt-api.
            // Paged like every list of the AI service; a service from before paging answered { tokens }.
            listApiTokens: () => allPages(async (page) => {
                const res = await call(listApiTokens, { query: page });
                return res?.tokens ?? res;
            }),
            createApiToken: ({ readOnly = false, description = '', ttlHours = 0 } = {}) =>
                call(createApiToken, { body: { read_only: readOnly, description, ttl_hours: ttlHours }, headers: JSON_HEADERS }),
            deleteApiToken: (id) => call(deleteApiToken, { path: { id } }),
            // Which models currently stand behind each alias, with counts and health.
            getModelAliases: () => call(getModelAliases),

            getFleet: () => call(getFleet),
            getFleetInference: () => call(getFleetInference),
            blockMachine: (serial) => call(blockMachine, { path: { serial } }),
            unblockMachine: (serial) => call(unblockMachine, { path: { serial } }),
            forgetMachine: (serial) => call(forgetMachine, { path: { serial } }),
            // Empty model: back to the profile's.
            setFleetModel: (serials, model) => call(setFleetModel, { body: { serials, model }, headers: JSON_HEADERS }),
            deletePackage: () => call(deleteFleetPackage),

            // Admins: the platform's own models (docs/bauplan.md 10.16). Every change answers with the whole catalogue.
            getModels: () => call(getModelCatalog),
            saveModel: (m) => call(putCatalogModel, { path: { key: m.key }, body: m, headers: JSON_HEADERS }),
            deleteModel: (key) => call(deleteCatalogModel, { path: { key } }),
            setTierModel: (tier, model) => call(putTierModel, { path: { tier }, body: { model }, headers: JSON_HEADERS }),
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
