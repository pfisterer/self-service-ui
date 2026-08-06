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
