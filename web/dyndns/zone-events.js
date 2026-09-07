// Pure helpers for zone events (problems the platform observed with a zone,
// e.g. a client failing TSIG against it in a loop). Kept free of React so the
// grouping and presentation rules are unit-testable.

// groupZoneEventsByZone maps a flat event list to { [zone]: events[] },
// keeping the server's order (newest activity first) within each zone.
export function groupZoneEventsByZone(events) {
    const byZone = {};
    for (const ev of events ?? []) {
        if (!ev?.zone) continue;
        (byZone[ev.zone] ??= []).push(ev);
    }
    return byZone;
}

// zoneEventColor maps an event severity to the Mantine color the banner and
// the list indicator use. Anything unknown is treated as a warning — an event
// the platform bothered to store is never "info-grey by default".
export function zoneEventColor(severity) {
    return severity === 'critical' ? 'red' : 'yellow';
}

// worstZoneEventColor is the color for a zone's indicator when it has several
// events: red wins over yellow.
export function worstZoneEventColor(events) {
    return (events ?? []).some(ev => zoneEventColor(ev.severity) === 'red') ? 'red' : 'yellow';
}

// zoneEventTimeline renders "seen N times since <first>, last <last>" without
// pretending sub-minute precision. Returns '' when the timestamps are absent
// (a defensive rendering path, not an expected state).
export function zoneEventTimeline(ev, locale = undefined) {
    if (!ev?.first_seen || !ev?.last_seen) return '';
    const fmt = (iso) => new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
    const times = ev.count > 1 ? `${ev.count}× since ${fmt(ev.first_seen)}` : `since ${fmt(ev.first_seen)}`;
    return `${times}, last ${fmt(ev.last_seen)}`;
}
