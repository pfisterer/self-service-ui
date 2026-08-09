import { useEffect } from 'react';
import { useAuth, DEV_DEFAULT_EMAIL } from '/providers/auth.jsx';
import { useSession } from '/providers/session.jsx';

import { client as projectsClient } from '@dhbw-cloud/os-mgt-client';
import { client as dyndnsClient } from '@dhbw-cloud/dynamic-zones-client';

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

const CLIENTS = { projects: projectsClient, dyndns: dyndnsClient };

// The interceptors need values that live in React (the token, the dev user,
// the session's expire callback) but must exist before the first request. So
// they are registered once and read the current values through this holder,
// which ClientProvider keeps up to date.
//
// Seeded from the same sources auth.jsx reads, because the first request can
// happen before any effect has run (child effects precede parent ones). In BFF
// mode the token is null anyway; what actually matters here is the dev identity,
// without which the very first call in a dev session would go out unauthenticated.
const useDummyAuth = import.meta.env.DEV && window.appconfig?.dummyAuth === true;
const session = {
    token: null,
    useDummyAuth,
    devUser: useDummyAuth
        ? (new URLSearchParams(window.location.search).get('dev_user') || DEV_DEFAULT_EMAIL)
        : null,
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

        // Dev/dummy auth only: assert an identity via header. Gated on
        // useDummyAuth (false in every production build, see auth.jsx).
        if (session.useDummyAuth && session.devUser) {
            request.headers.set('X-Dummy-Auth-User', session.devUser);
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
    // them current as the person signs in, switches dev user, or the session ends.
    useEffect(() => {
        session.token = auth?.user?.access_token ?? null;
        session.useDummyAuth = Boolean(auth?.useDummyAuth);
        session.devUser = auth?.dev_user ?? null;
        session.expire = expire;
    }, [auth?.user?.access_token, auth?.useDummyAuth, auth?.dev_user, expire]);

    return children;
}
