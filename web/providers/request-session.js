// What every request to the services carries, and what every answer may set off — in one place, so the generated clients (their interceptors in client.jsx) and the upload with progress (helper/upload.js, XMLHttpRequest) cannot drift apart.
//
// A plain module without React: the values live in React (the token, the session's expire callback) but must exist before the first request, so ClientProvider keeps this holder current and everything here reads it at request time.
import { actingAsAtLoad } from '/providers/acting-as.js';

const useDummyAuth = Boolean(import.meta.env?.DEV && typeof window !== 'undefined' && window.appconfig?.dummyAuth === true);

export const requestSession = {
    // Pre-BFF only: the SPA's access token. In BFF mode the SPA holds none and the oauth2-proxy in front injects the Bearer server-side.
    token: null,
    useDummyAuth,
    expire: () => { },
    // Acting on behalf of somebody: fixed for the page's life, a switch reloads (acting-as.js).
    actAs: actingAsAtLoad,
};

// requestHeaders is the set of headers every request gets, as a plain object.
export function requestHeaders() {
    const headers = {};
    if (requestSession.token) headers.Authorization = `Bearer ${requestSession.token}`;
    // Every service gets the person's address and checks for itself that the caller may (act-as.jsx).
    if (requestSession.actAs) headers['X-Act-As'] = requestSession.actAs;
    return headers;
}

// applyRequestHeaders puts requestHeaders onto a Headers object (a fetch Request's). Without a token an Authorization a caller passed is removed: in BFF mode the proxy sets it, and the SPA must not send a stale one.
export function applyRequestHeaders(headers) {
    if (!requestSession.token) headers.delete('Authorization');
    for (const [name, value] of Object.entries(requestHeaders())) headers.set(name, value);
    return headers;
}

// noteResponseStatus looks at an answer's status. A 401 means the oauth2-proxy session expired (it answers AJAX requests with 401 rather than a cross-origin redirect an XHR can't follow). Only a full-page navigation can re-run the OIDC login — but starting one from here, silently, is what made an expired session look like a hung page. Raise it instead and let the person choose the moment (see providers/session.jsx). Skipped in dummy/dev mode (there the API itself returns 401 for real auth errors).
export function noteResponseStatus(status) {
    if (status === 401 && !requestSession.useDummyAuth) requestSession.expire();
}
