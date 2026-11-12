import { useEffect } from 'react';
import { useAuth } from '/providers/auth.jsx';
import { applyRequestHeaders, noteResponseStatus, requestSession } from '/providers/request-session.js';
import { useSession } from '/providers/session.jsx';

import { client as projectsClient } from '@dhbw-cloud/os-mgt-client';
import { client as dyndnsClient } from '@dhbw-cloud/dynamic-zones-client';
import { client as llmClient } from '@dhbw-cloud/llm-client';
import { client as groupsClient } from '@dhbw-cloud/role-provider-client';

// The generated clients are build-time dependencies (see d6). They used to be
// fetched from the API server at runtime, which meant a UI built against an
// operation the deployed API does not have failed silently in the browser.
//
// WHERE the API lives is still runtime configuration — one image serves every
// environment — so only setConfig happens here, not the import.
//
// This runs at module scope on purpose. config.js is a plain script tag ahead
// of the bundle, so window.appconfig is already there; and doing it in an
// effect would be too late: React runs CHILD effects before parent ones, so a
// query in a route would have fired its first request before a provider effect
// could have set the base URL. The old async gate hid that by not rendering
// children until the client existed.
projectsClient.setConfig({ baseUrl: window?.appconfig?.cloudResourcesBaseUrl });
dyndnsClient.setConfig({ baseUrl: window?.appconfig?.dynamicZonesBaseUrl });
llmClient.setConfig({ baseUrl: window?.appconfig?.llmBaseUrl });
groupsClient.setConfig({ baseUrl: window?.appconfig?.groupsBaseUrl });

const CLIENTS = { projects: projectsClient, dyndns: dyndnsClient, llm: llmClient, groups: groupsClient };

// The headers every request carries (token pre-BFF, X-Act-As) and the 401 handling live in request-session.js, shared with the upload with progress (helper/upload.js), so the two ways a request leaves the UI cannot drift. The interceptors are registered once and read the current values at request time.
for (const c of Object.values(CLIENTS)) {
    c.interceptors.request.use((request) => {
        applyRequestHeaders(request.headers);
        return request;
    });
    c.interceptors.response.use((response) => {
        noteResponseStatus(response?.status);
        return response;
    });
}

// Returns the configured client for one API. It is the single place that maps
// an API name to its package, so the facades do not import one each.
export function useClient(name = 'dyndns') {
    const client = CLIENTS[name];

    if (!client) {
        throw new Error(`No client named "${name}". Known: ${Object.keys(CLIENTS).join(', ')}.`);
    }
    return client;
}

// Keeps the interceptor holder current. It renders no UI and holds no state of
// its own — the clients themselves are module singletons.
export function ClientProvider({ children }) {
    const auth = useAuth();
    const { expire } = useSession();

    // In an effect, not during render: writing to module state while rendering
    // is a side effect React is allowed to discard or repeat. The values that
    // must be right before the first request are seeded above; this only keeps
    // them current as the person signs in or the session ends.
    useEffect(() => {
        requestSession.token = auth?.user?.access_token ?? null;
        requestSession.useDummyAuth = Boolean(auth?.useDummyAuth);
        requestSession.expire = expire;
    }, [auth?.user?.access_token, auth?.useDummyAuth, expire]);

    return children;
}
