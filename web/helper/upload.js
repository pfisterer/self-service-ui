// upload sends a file (or any large body) to one of the services and reports how far it got. The generated clients use fetch, which cannot report upload progress, so this one uses XMLHttpRequest — with the same headers (token pre-BFF, X-Act-As) and the same 401 handling as the clients' interceptors, both from providers/request-session.js, and failing in the same shape the facades throw (helper/api-error.js: an Error with message, status, and the parsed body's code).
//
// options:
//   client     a generated client (useClient('llm')); its baseUrl is used. Or:
//   baseUrl    the service's base URL ('' or none: same origin as the page)
//   url        path below the base, e.g. '/v1/gpu/files'
//   method     'PUT' (default) or 'POST'
//   body       File, Blob, FormData (or anything XHR sends)
//   query      { name: value } appended as the query string; undefined and null are left out, an array repeats the name
//   headers    extra headers; a Blob goes as application/octet-stream unless Content-Type is given, FormData gets its multipart type from the browser
//   onProgress ({ loaded, total, percent, bytesPerSec, etaSec }) while the body goes up
//   onDone     (data) with the parsed answer
//   onError    (error) on failure, also on cancel (then error.name === 'AbortError')
//   signal     an AbortSignal that cancels the upload
// Returns a promise of the parsed answer (JSON, {} for an empty one, text otherwise); it rejects with the same error onError gets.
//
// Credentials as with the generated clients: they call fetch with its default credentials 'same-origin', so cookies (the oauth2-proxy's session) go along to the page's own origin only — XHR's default (withCredentials false) is the same.
import { apiError } from '/helper/api-error.js';
import { noteResponseStatus, requestHeaders } from '/providers/request-session.js';

// isAbort tells a cancelled upload from a failed one: a cancel is the person's choice, not an error to report.
export function isAbort(error) {
    return error?.name === 'AbortError';
}

function abortError() {
    // DOMException where there is one (browsers, jsdom), so it reads like fetch's own abort.
    if (typeof DOMException === 'function') return new DOMException('The upload was cancelled.', 'AbortError');
    const err = new Error('The upload was cancelled.');
    err.name = 'AbortError';
    return err;
}

// uploadUrl joins base, path and query the way the generated clients do (base without a trailing slash, values with encodeURIComponent, arrays exploded).
export function uploadUrl({ client, baseUrl, url, query }) {
    let base = baseUrl ?? client?.getConfig?.().baseUrl ?? '';
    if (base.endsWith('/')) base = base.slice(0, -1);
    const parts = [];
    for (const [name, value] of Object.entries(query ?? {})) {
        for (const v of Array.isArray(value) ? value : [value]) {
            if (v === undefined || v === null) continue;
            parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(v)}`);
        }
    }
    return `${base}${url}${parts.length ? `?${parts.join('&')}` : ''}`;
}

// progressOf turns one progress event into what people read. The speed is the average since the start: steadier than the last interval, and honest about a long upload. etaSec is null until there is a speed to divide by.
export function progressOf(loaded, total, elapsedMs) {
    const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
    const bytesPerSec = elapsedMs > 0 ? (loaded / elapsedMs) * 1000 : 0;
    const etaSec = bytesPerSec > 0 && total > 0 ? Math.max(0, (total - loaded) / bytesPerSec) : null;
    return { loaded, total, percent, bytesPerSec, etaSec };
}

function headerValue(headers, name) {
    const key = Object.keys(headers ?? {}).find(k => k.toLowerCase() === name.toLowerCase());
    return key === undefined ? undefined : headers[key];
}

// The answer parsed as the generated clients' parseAs 'auto' would: JSON when it says so (or has no type), {} when empty, the text otherwise.
function parseBody(xhr) {
    const text = xhr.responseText ?? '';
    const type = xhr.getResponseHeader('Content-Type') ?? '';
    if (!text) return {};
    if (!type || /json/i.test(type)) {
        try { return JSON.parse(text); } catch { return text; }
    }
    return text;
}

// A refusal as the generated clients return it ({ error: parsed body or its text, response }), turned into the error the facades throw. An empty body leaves error unset, so the message falls back to the status text instead of "[object Object]".
function failure(xhr) {
    const text = xhr.responseText ?? '';
    let body;
    try { body = JSON.parse(text); } catch { body = text || undefined; }
    return apiError({ error: body, response: { ok: false, status: xhr.status, statusText: xhr.statusText } });
}

export function upload({ client, baseUrl, url, method = 'PUT', body, query, headers, onProgress, onDone, onError, signal } = {}) {
    return new Promise((resolve, reject) => {
        const fail = (error) => { onError?.(error); reject(error); };
        if (signal?.aborted) { fail(abortError()); return; }

        const xhr = new XMLHttpRequest();
        xhr.open(method, uploadUrl({ client, baseUrl, url, query }));
        xhr.withCredentials = false;

        const all = { ...headers, ...requestHeaders() };
        const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
        if (isForm) {
            // The browser writes the multipart boundary; a Content-Type set here would lack it.
            for (const k of Object.keys(all)) if (k.toLowerCase() === 'content-type') delete all[k];
        } else if (typeof Blob !== 'undefined' && body instanceof Blob && headerValue(all, 'Content-Type') === undefined) {
            all['Content-Type'] = 'application/octet-stream';
        }
        for (const [name, value] of Object.entries(all)) {
            if (value !== undefined && value !== null) xhr.setRequestHeader(name, String(value));
        }

        const size = typeof body?.size === 'number' ? body.size : 0;
        const started = Date.now();
        if (onProgress) {
            xhr.upload.onprogress = (e) => {
                const total = e.lengthComputable ? e.total : size;
                onProgress(progressOf(e.loaded, total, Date.now() - started));
            };
        }

        const onAbort = () => xhr.abort();
        signal?.addEventListener('abort', onAbort, { once: true });
        const settle = () => signal?.removeEventListener('abort', onAbort);

        xhr.onload = () => {
            settle();
            noteResponseStatus(xhr.status);
            if (xhr.status >= 200 && xhr.status < 300) {
                const data = xhr.status === 204 ? {} : parseBody(xhr);
                if (onProgress && size) onProgress(progressOf(size, size, Date.now() - started));
                onDone?.(data);
                resolve(data);
                return;
            }
            fail(failure(xhr));
        };
        // No answer at all: fetch fails the same case with a TypeError "Failed to fetch", which the facades pass on as the message.
        xhr.onerror = () => { settle(); fail(apiError({ error: new TypeError('Failed to fetch') })); };
        xhr.onabort = () => { settle(); fail(abortError()); };

        xhr.send(body);
    });
}
