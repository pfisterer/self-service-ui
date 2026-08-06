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
// The `response.ok` fallback comes from dns-record-list.jsx, which was the only
// caller that handled it: a non-2xx whose body is not the usual JSON (a proxy's
// HTML error page, an empty 502) leaves `error` unset, and without this the UI
// reported success and quietly did nothing.
export function apiErrorMessage(res) {
    const err = res?.error;
    if (err) {
        return err.error ?? err.detail ?? err.message ?? String(err);
    }
    const response = res?.response;
    if (response && !response.ok) {
        return response.statusText || `HTTP ${response.status}`;
    }
    return null;
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
export function apiError(res) {
    const err = new Error(apiErrorMessage(res) ?? 'Request failed');
    err.status = res?.response?.status;
    return err;
}

// CONFLICT is the HTTP status the APIs use for "this no longer applies".
export const CONFLICT = 409;
