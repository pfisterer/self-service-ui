// Pure helpers for zone events (problems the platform observed with a zone,
// e.g. a client failing TSIG against it in a loop). Kept free of React so the
// grouping and presentation rules are unit-testable.
//
// The two that produce text take `t` (i18next's translate function) as an
// argument rather than importing the i18n instance: these are pure functions,
// and a module-level import would tie them to one initialised instance and
// make them untestable without it.

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
export function zoneEventTimeline(ev, t, locale = undefined) {
    if (!ev?.first_seen || !ev?.last_seen) return '';
    const fmt = (iso) => new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
    // One whole sentence per case instead of clauses stitched together.
    return ev.count > 1
        ? t('dyndns.events.seenRepeated', { times: ev.count, first: fmt(ev.first_seen), last: fmt(ev.last_seen) })
        : t('dyndns.events.seenOnce', { first: fmt(ev.first_seen) });
}

// zoneEventMailto builds a mailto: link to the zone's owners, with the
// event's message pre-filled — the admin's one-click way from "I see a
// problem" to "the owner knows". Returns null without owners: a link that
// opens an empty compose window is worse than no link.
export function zoneEventMailto(ev, t, locale = undefined) {
    if (!ev?.owners?.length || !ev?.zone) return null;
    const subject = t('dyndns.events.mailSubject', { zone: ev.zone });
    const lines = [
        t('dyndns.events.mailGreeting'),
        '',
        t('dyndns.events.mailIntro', { zone: ev.zone }),
        '',
        // The message and the class come from the platform, not from here.
        ev.message || ev.class || t('dyndns.events.mailUnknownProblem'),
    ];
    if (ev.detail && ev.detail !== ev.message) lines.push('', ev.detail);
    const timeline = zoneEventTimeline(ev, t, locale);
    if (timeline) lines.push('', `(${timeline})`);
    lines.push('', t('dyndns.events.mailAction'), t('dyndns.events.mailWhere'));
    return `mailto:${ev.owners.join(',')}`
        + `?subject=${encodeURIComponent(subject)}`
        + `&body=${encodeURIComponent(lines.join('\n'))}`;
}
