import i18n from '/i18n/index.js';

// The one place that turns an API failure into a sentence for the user.
//
// This used to be a `sdkError` copied into six files plus an `errorOf` in
// api-nodes.jsx — and the copies had diverged into two different precedence
// orders (`detail` before `error` under dyndns/, `error` before `detail` under
// projects/). The same server response therefore produced different text
// depending on which file happened to handle it.
//
// `error` comes first because that is the field both Go APIs actually send:
// `gin.H{"error": ...}`, ~150 call sites, and no handler anywhere emits
// `detail`. The remaining keys are kept as cheap fallbacks for shapes we do not
// control (a proxy, a future API), not because anything produces them today.

// apiErrorMessage reads a hey-api result envelope ({ data, error, response })
// and returns the message, or null when the call succeeded.
//
// Only a JSON body is the service's own answer. A body that is not JSON — a proxy's HTML error page while a backend restarts, an empty 502, a "404 page not found" — is never shown: it is markup or noise, not a sentence for the person. It reads as unavailableMessage instead (neutral, with the status and a request ID where one is known). The `response.ok` fallback keeps a non-2xx without a body from reading as success.
export function apiErrorMessage(res) {
    const err = res?.error;
    const response = res?.response;
    if (typeof err === 'string') {
        return err === '' && response?.ok !== false ? null : unavailableMessage(response, err);
    }
    if (err instanceof Error) {
        return err.message;
    }
    if (err) {
        return err.error ?? err.detail ?? err.message ?? unavailableMessage(response, '');
    }
    if (response && !response.ok) {
        return unavailableMessage(response, '');
    }
    return null;
}

// REQUEST_ID_HEADERS are where proxies and services put the ID of a request.
const REQUEST_ID_HEADERS = ['x-request-id', 'x-correlation-id', 'request-id'];
// A request ID named in an error page ("Request ID: 3e39eda0-…", "request-id 3e39…").
const REQUEST_ID_IN_PAGE = /request[\s_-]*id[^0-9a-f]{0,40}([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{16,64})/i;

// requestIdOf is the ID of a failed request: from a response header, else from the error page.
export function requestIdOf(response, body) {
    for (const h of REQUEST_ID_HEADERS) {
        const v = response?.headers?.get?.(h);
        if (v) return v;
    }
    return (typeof body === 'string' && body.match(REQUEST_ID_IN_PAGE)?.[1]) || null;
}

// unavailableMessage is what a failure without a readable answer says, with the status and the request ID for a report: from a server error or without a status that the service is not reachable right now (a proxy answering while the backend restarts), otherwise only that the request failed (a 413 of a proxy is no outage).
export function unavailableMessage(response, body) {
    const details = [];
    const status = response?.status;
    if (status) details.push(i18n.t('helper.apiError.status', { status }));
    const id = requestIdOf(response, body);
    if (id) details.push(i18n.t('helper.apiError.requestId', { id }));
    const text = i18n.t(!status || status >= 500 ? 'helper.apiError.unavailable' : 'helper.apiError.failed');
    return details.length ? `${text} (${details.join(', ')})` : text;
}

// formatError reads a THROWN value (what the API facades raise) and returns the
// message. Kept separate from apiErrorMessage on purpose: one takes a response,
// the other takes an exception, and collapsing them would hide which is which.
export function formatError(err) {
    return err?.message ?? String(err);
}

// apiError builds the exception the facades throw, carrying the HTTP status
// alongside the message.
//
// The status is what lets a caller tell "your input is wrong" (400) from "the
// world moved on while this form was open" (409) — the same distinction the API
// started drawing when its lifecycle guards stopped answering 400. Without it
// every failure is just a string, and a stale approval reads like a validation
// error the user is supposed to fix.
//
// The services answer a refusal as `{ error, code }`: `code` is the stable, machine-readable reason (the message is for people and follows Accept-Language), so it rides along as err.code, and the whole parsed body as err.body.
export function apiError(res) {
    const err = new Error(apiErrorMessage(res) ?? 'Request failed');
    err.status = res?.response?.status;
    const body = res?.error;
    if (body && typeof body === 'object' && !(body instanceof Error)) {
        err.body = body;
        if (body.code !== undefined) err.code = body.code;
    }
    return err;
}

// CONFLICT is the HTTP status the APIs use for "this no longer applies".
export const CONFLICT = 409;
