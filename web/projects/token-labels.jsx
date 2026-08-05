import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useClient } from '../providers/client.jsx';

// Tokens are what the system stores ("group:dept_bio"), but not what a person
// recognises. The group catalog knows a display name for every group, so the UI
// resolves tokens to labels in the background and keeps the raw token as the
// fallback — and as the tooltip, because the token is what you type into the
// editors and what error messages talk about.
//
// There is no lookup-by-token endpoint, so this reuses the group search: the
// catalog matches on the group ID (the token without its prefix), and among the
// matches the one whose token is identical is the answer. A dedicated batch
// lookup would be cheaper — this issues one request per unknown group token —
// but each token is fetched once per session and the result is shared by every
// view, so the traffic is bounded by "distinct groups the user looks at".

const GROUP_PREFIX = 'group:';
const USER_PREFIX = 'user:';

const TokenLabelContext = createContext(null);

// tokenFallback is what to show while nothing better is known: user tokens carry
// their own answer (the email), group tokens have to be looked up.
export function tokenFallback(token) {
    if (typeof token !== 'string') return '';
    if (token.startsWith(USER_PREFIX)) return token.slice(USER_PREFIX.length);
    return token;
}

// tokenEmail returns the address behind a user token, '' for anything else
// (a group is not a mailbox).
export function tokenEmail(token) {
    return typeof token === 'string' && token.startsWith(USER_PREFIX)
        ? token.slice(USER_PREFIX.length)
        : '';
}

// tokenDisplay is what a badge shows: the display name AND the token it stands
// for, both visible. Hiding the token behind a hover made the badge unreadable
// for anyone who has to work with tokens (they are what the editors take and
// what error messages name), and hiding the name made it unreadable for
// everyone else. Only a group with a display name gets two parts — a user token
// is its own name.
export function tokenDisplay(token, label) {
    const fallback = tokenFallback(token);
    return label && label !== fallback ? `${label} (${token})` : fallback;
}

export function TokenLabelProvider({ children }) {
    const { sdk, client } = useClient('projects');
    // token → label ('' means "asked, no label exists"), so a group without a
    // display name is not looked up again on every render.
    const [labels, setLabels] = useState({});
    const inFlight = useRef(new Set());
    // Mirror of `labels` for the filter below: reading state there would make
    // `request` change on every resolved token, and with it the effect in every
    // component using the hook.
    const known = useRef({});

    const request = useCallback((tokens) => {
        const unknown = (tokens || []).filter(t =>
            typeof t === 'string' &&
            t.startsWith(GROUP_PREFIX) &&
            !(t in known.current) &&
            !inFlight.current.has(t));
        if (unknown.length === 0) return;

        unknown.forEach(async (token) => {
            inFlight.current.add(token);
            try {
                const id = token.slice(GROUP_PREFIX.length);
                const res = await sdk.searchGroups({ client, query: { q: id, limit: 10 } });
                const hit = (res?.data?.groups || []).find(g => g?.token === token);
                setLabels(prev => {
                    const next = { ...prev, [token]: hit?.label || '' };
                    known.current = next;
                    return next;
                });
            } catch {
                // Cache the failure as "no label": a directory that is down must
                // not turn every render into another round of failing requests.
                setLabels(prev => {
                    const next = { ...prev, [token]: '' };
                    known.current = next;
                    return next;
                });
            } finally {
                inFlight.current.delete(token);
            }
        });
    }, [sdk, client]);

    const value = useMemo(() => ({ labels, request }), [labels, request]);
    return <TokenLabelContext.Provider value={value}>{children}</TokenLabelContext.Provider>;
}

const NO_LABELS = {};

/**
 * useTokenLabels resolves a list of tokens and returns { token: label }.
 *
 * Missing entries simply mean "no label (yet)" — render tokenFallback(token)
 * then. Outside a TokenLabelProvider the hook is inert, so components using it
 * still work anywhere.
 */
export function useTokenLabels(tokens) {
    const ctx = useContext(TokenLabelContext);
    const request = ctx?.request;
    // Depend on the token set, not on the array identity: callers pass a fresh
    // array on every render.
    const key = (tokens || []).filter(Boolean).sort().join('|');

    useEffect(() => {
        if (request && key) request(key.split('|'));
    }, [key, request]);

    return ctx?.labels ?? NO_LABELS;
}
