import { useEffect } from 'react';
import { useAuth } from '/providers/auth.jsx';
import { actingAsAtLoad } from '/providers/acting-as.js';
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

// The interceptors need values that live in React (the token, the session's
// expire callback) but must exist before the first request. So they are
// registered once and read the current values through this holder, which
// ClientProvider keeps up to date.
const useDummyAuth = import.meta.env.DEV && window.appconfig?.dummyAuth === true;
const session = {
    token: null,
    useDummyAuth,
    expire: () => { },
};

for (const c of Object.values(CLIENTS)) {
    c.interceptors.request.use((request) => {
        // BFF mode: the SPA holds NO token, so no Authorization is set here and
        // the oauth2-proxy in front injects the Bearer server-side. Pre-BFF, the
        // SPA still sets it from the token.
        session.token
            ? request.headers.set('Authorization', `Bearer ${session.token}`)
            : request.headers.delete('Authorization');

        // Acting on behalf of somebody: every service gets the person's
        // address and checks for itself that the caller may (act-as.jsx).
        if (actingAsAtLoad) {
            request.headers.set('X-Act-As', actingAsAtLoad);
        }

        return request;
    });

    // BFF: a 401 means the oauth2-proxy session expired (it answers AJAX
    // requests with 401 rather than a cross-origin redirect an XHR can't
    // follow). Only a full-page navigation can re-run the OIDC login — but
    // starting one from here, silently, is what made an expired session look
    // like a hung page. Raise it instead and let the person choose the moment
    // (see providers/session.jsx). Skipped in dummy/dev mode (there the API
    // itself returns 401 for real auth errors).
    c.interceptors.response.use((response) => {
        if (response?.status === 401 && !session.useDummyAuth) {
            session.expire();
        }
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
        session.token = auth?.user?.access_token ?? null;
        session.useDummyAuth = Boolean(auth?.useDummyAuth);
        session.expire = expire;
    }, [auth?.user?.access_token, auth?.useDummyAuth, expire]);

    return children;
}
