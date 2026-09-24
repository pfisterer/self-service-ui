import { describe, expect, it } from 'vitest';
import i18n from '/i18n/index.js';
import {
    groupZoneEventsByZone, worstZoneEventColor, zoneEventColor, zoneEventMailto, zoneEventTimeline,
} from '/dyndns/zone-events.js';

// The helpers take `t` rather than reaching for the i18n instance themselves,
// so the test pins the language instead of depending on the detected one. The
// expectations below are the English resource values.
const t = i18n.getFixedT('en');

describe('groupZoneEventsByZone', () => {
    it('groups by zone and keeps order within a zone', () => {
        const grouped = groupZoneEventsByZone([
            { zone: 'a.example.org', class: 'X' },
            { zone: 'b.example.org', class: 'Y' },
            { zone: 'a.example.org', class: 'Z' },
        ]);
        expect(Object.keys(grouped).sort()).toEqual(['a.example.org', 'b.example.org']);
        expect(grouped['a.example.org'].map(e => e.class)).toEqual(['X', 'Z']);
    });

    it('tolerates empty input and events without a zone', () => {
        expect(groupZoneEventsByZone(undefined)).toEqual({});
        expect(groupZoneEventsByZone([{ class: 'X' }])).toEqual({});
    });
});

describe('zoneEventColor', () => {
    it('maps critical to red and everything else to yellow', () => {
        expect(zoneEventColor('critical')).toBe('red');
        expect(zoneEventColor('warning')).toBe('yellow');
        expect(zoneEventColor('made-up')).toBe('yellow');
        expect(zoneEventColor(undefined)).toBe('yellow');
    });
});

describe('worstZoneEventColor', () => {
    it('lets red win over yellow', () => {
        expect(worstZoneEventColor([{ severity: 'warning' }, { severity: 'critical' }])).toBe('red');
        expect(worstZoneEventColor([{ severity: 'warning' }])).toBe('yellow');
        expect(worstZoneEventColor([])).toBe('yellow');
    });
});

describe('zoneEventTimeline', () => {
    const ev = {
        first_seen: '2026-09-05T15:00:00Z',
        last_seen: '2026-09-06T09:00:00Z',
        count: 3,
    };

    it('mentions the repeat count only when there is one', () => {
        expect(zoneEventTimeline(ev, t, 'en-GB')).toMatch(/^Seen 3× between .+ and .+$/);
        expect(zoneEventTimeline({ ...ev, count: 1 }, t, 'en-GB')).toMatch(/^Seen on .+$/);
    });

    it('renders nothing rather than "Invalid Date" for missing timestamps', () => {
        expect(zoneEventTimeline({}, t)).toBe('');
        expect(zoneEventTimeline(undefined, t)).toBe('');
    });
});

describe('zoneEventMailto', () => {
    const ev = {
        zone: 'a.example.org',
        class: 'DnsClientMisconfig',
        message: 'A client keeps failing TSIG',
        detail: 'More context',
        owners: ['alice@example.edu', 'bob@example.edu'],
        first_seen: '2026-09-05T15:00:00Z',
        last_seen: '2026-09-06T09:00:00Z',
        count: 3,
    };

    it('addresses every owner and carries subject and message', () => {
        const link = zoneEventMailto(ev, t, 'en-GB');
        expect(link).toMatch(/^mailto:alice@example\.edu,bob@example\.edu\?/);
        expect(link).toContain(encodeURIComponent('Problem with DNS zone a.example.org'));
        expect(link).toContain(encodeURIComponent('A client keeps failing TSIG'));
        expect(link).toContain(encodeURIComponent('More context'));
    });

    it('returns null without owners rather than an empty compose window', () => {
        expect(zoneEventMailto({ ...ev, owners: [] }, t)).toBeNull();
        expect(zoneEventMailto(undefined, t)).toBeNull();
    });
});
