// The rules behind the bell in the header (bell.jsx), as plain functions so they are tested without a browser.
//
// The notification service has no "read" state of its own (GET /v1/notifications names what was sent, not what was looked at), so the portal keeps one timestamp per person in this browser: when the list was last opened. Everything newer counts as unread. A second browser or a cleared storage shows the latest ones as unread again, which is the harmless direction to be wrong in.

// POLL_MS: once a minute is fresh enough for something that also comes by mail, and cheap for a list of twenty.
export const POLL_MS = 60_000;

// RECENT_LIMIT: as many as the settings page lists, so both share one cached answer.
export const RECENT_LIMIT = 20;

// BADGE_MAX: above it the badge says "9+"; the exact number is in the list, and a two-digit badge crowds the header.
export const BADGE_MAX = 9;

const SEEN_KEY = 'self-service.notifications.seen';

// pollInterval is the refetch interval for a tab in the given visibility state: none while it is in the background, so a forgotten tab does not keep asking. Coming back to the tab refetches anyway (refetchOnWindowFocus, providers/query.jsx).
export function pollInterval(visibilityState) {
    return visibilityState === 'hidden' ? false : POLL_MS;
}

// bellEnabled says whether the bell asks at all: only for somebody signed in, and not while acting on behalf of somebody else, because the service refuses X-Act-As (its routes are always one's own) and the bell would show the admin's notifications on another person's view.
export function bellEnabled({ enabled, user, actingAs }) {
    return Boolean(enabled && user && !actingAs);
}

const time = (v) => {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
};

// isUnread says whether a notification came after the list was last opened. Never opened (seenAt null) means everything is new; a notification without a readable time counts as seen rather than sticking in the badge forever.
export function isUnread(item, seenAt) {
    const t = time(item?.created_at);
    if (t === null) return false;
    const seen = seenAt == null ? null : time(seenAt);
    return seen === null || t > seen;
}

export function countUnread(items, seenAt) {
    return (items ?? []).filter(i => isUnread(i, seenAt)).length;
}

// newestAt is the time to remember on opening: the newest notification's own timestamp, from the service's clock, rather than this computer's now. A clock that is a few minutes behind would otherwise mark a notification that arrives right after opening as already seen.
export function newestAt(items) {
    let best = null;
    for (const i of items ?? []) {
        const t = time(i?.created_at);
        if (t !== null && (best === null || t > time(best))) best = i.created_at;
    }
    return best;
}

// badgeLabel is the text of the badge, or null for none.
export function badgeLabel(count) {
    if (!count || count < 1) return null;
    return count > BADGE_MAX ? `${BADGE_MAX}+` : String(count);
}

// portalPath is url as a path inside this app when it points here (so the link navigates without reloading the page), else null. Here rather than with the settings page, which is loaded lazily, while the bell is in every page's header.
export function portalPath(url, here = globalThis.location?.href) {
    try {
        const base = new URL(here);
        const u = new URL(url, base);
        return u.origin === base.origin ? u.pathname + u.search + u.hash : null;
    } catch {
        return null;
    }
}

// One timestamp per person: a shared computer in a lab must not hand one person's "seen" to the next.
const seenKey = (person) => `${SEEN_KEY}.${person || 'anonymous'}`;

// readSeen and writeSeen go through try/catch: storage can be missing or refused (private windows, blocked site data), and then the bell simply counts everything in the list as new.
export function readSeen(person, storage = globalThis.localStorage) {
    try {
        return storage?.getItem(seenKey(person)) ?? null;
    } catch {
        return null;
    }
}

export function writeSeen(person, value, storage = globalThis.localStorage) {
    if (!value) return;
    try {
        storage?.setItem(seenKey(person), value);
    } catch {
        // not kept: the next page load shows the same ones as new again
    }
}
