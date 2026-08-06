import { useEffect, useMemo, useState } from 'react';

// Both APIs publish a public /config.json that the SPA reads once at startup.
// There used to be one provider per API, written twice and then drifted apart:
// the cloud one had a cancellation guard, a timeout and an `ok` check, the
// dyndns one had none of them — plus a `setError()` in its render body and a
// conditional `return` in front of its `useEffect` (a Rules-of-Hooks violation,
// and the URL guard it belonged to could never be true because `new URL()`
// throws instead of returning something falsy). An unset base URL therefore
// took the whole app down through the error boundary.
//
// The loading is here, once. The two providers below it are just the two
// contexts, because their consumers differ: dyndns is required, cloud is
// optional (it is not configured in every environment).

const FETCH_TIMEOUT_MS = 5000;

/**
 * useRemoteConfig fetches `<baseUrl>/config.json`.
 *
 * Returns { config, error, loading }. A missing baseUrl is not an error — that
 * is how an API says "not configured here"; the caller decides whether it can
 * live without it.
 */
export function useRemoteConfig(baseUrl) {
    // Resolved during render, not in the effect: `new URL()` throws on a bad
    // base, and a throw in an effect is an unhandled rejection while a throw
    // here would kill the render. useMemo keeps it pure and turns a broken
    // configuration into a value we can display.
    const target = useMemo(() => {
        if (!baseUrl) return { url: null, error: null };
        try {
            return { url: new URL('config.json', baseUrl).toString(), error: null };
        } catch {
            return {
                url: null,
                error: new Error(`Invalid API base URL: ${JSON.stringify(baseUrl)}`),
            };
        }
    }, [baseUrl]);

    const [fetched, setFetched] = useState({ config: undefined, error: undefined, loading: true });

    useEffect(() => {
        if (!target.url) return;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        (async () => {
            try {
                const res = await fetch(target.url, { signal: controller.signal });
                if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
                const config = await res.json();
                setFetched({ config, error: undefined, loading: false });
            } catch (error) {
                // AbortError on unmount is not a failure anyone needs to see.
                if (error?.name !== 'AbortError') {
                    setFetched({ config: undefined, error, loading: false });
                }
            } finally {
                clearTimeout(timer);
            }
        })();
        return () => { clearTimeout(timer); controller.abort(); };
    }, [target]);

    // "Nothing to load" is derived, not stored: writing it into state from the
    // effect would be a synchronous setState in an effect body (a cascading
    // render, and what react-hooks/set-state-in-effect exists to catch).
    if (!target.url) {
        return { config: undefined, error: target.error ?? undefined, loading: false };
    }
    return fetched;
}
