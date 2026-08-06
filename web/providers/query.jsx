import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Server state lives here, not in useState.
//
// What this replaces: every list view used to carry four state variables
// (data, loading, loadFailed, reloadTrigger), a `cancelled` flag so a late
// response could not write into an unmounted component, a hand-rolled "Retry
// Load" button, and a `reload` callback threaded down through props so a
// sibling could invalidate what another one had fetched. That is the whole job
// of a query cache, and it is a job with enough edge cases (two requests in
// flight, the older one answering last; a refetch while the user is typing)
// that writing it once per view is how they diverge.

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Refetching when the window regains focus is deliberately LEFT ON.
            // This UI shows state other people change — a budget someone else
            // approves, a zone a colleague deletes. Coming back to the tab is
            // exactly the moment the displayed data is most likely stale, and
            // the request is cheap. staleTime below keeps it from firing on
            // every alt-tab.
            refetchOnWindowFocus: true,
            // Within 30s a re-render (or a second component asking for the same
            // key) serves the cached value instead of hitting the API again.
            staleTime: 30_000,
            // One retry, not the default three: these APIs answer fast and a
            // real failure (403, a validation error) will not become a success
            // by asking again. A single retry only covers a dropped connection.
            retry: 1,
            // The session can expire while the tab sits open. The client's 401
            // interceptor navigates to the proxy sign-in, so a retry storm on
            // an expired session would only race that redirect.
            retryOnMount: false,
        },
        mutations: {
            // Writes are never retried automatically: "create zone" that
            // silently ran twice is worse than one that failed visibly.
            retry: false,
        },
    },
});

export function QueryProvider({ children }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
