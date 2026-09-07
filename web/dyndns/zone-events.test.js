import { describe, expect, it } from 'vitest';
import {
    groupZoneEventsByZone, worstZoneEventColor, zoneEventColor, zoneEventMailto, zoneEventTimeline,
} from '/dyndns/zone-events.js';

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
        expect(zoneEventTimeline(ev, 'en-GB')).toMatch(/^3× since .+, last .+$/);
        expect(zoneEventTimeline({ ...ev, count: 1 }, 'en-GB')).toMatch(/^since .+, last .+$/);
    });

    it('renders nothing rather than "Invalid Date" for missing timestamps', () => {
        expect(zoneEventTimeline({})).toBe('');
        expect(zoneEventTimeline(undefined)).toBe('');
    });
});

describe('zoneEventMailto', () => {
    const ev = {
        zone: 'a.example.org',
        class: 'DnsClientMisconfig',
        message: 'Ein Client scheitert an TSIG',
        detail: 'Mehr Kontext',
        owners: ['alice@example.edu', 'bob@example.edu'],
        first_seen: '2026-09-05T15:00:00Z',
        last_seen: '2026-09-06T09:00:00Z',
        count: 3,
    };

    it('addresses every owner and carries subject and message', () => {
        const link = zoneEventMailto(ev, 'en-GB');
        expect(link).toMatch(/^mailto:alice@example\.edu,bob@example\.edu\?/);
        expect(link).toContain(encodeURIComponent('Problem mit DNS-Zone a.example.org'));
        expect(link).toContain(encodeURIComponent('Ein Client scheitert an TSIG'));
        expect(link).toContain(encodeURIComponent('Mehr Kontext'));
    });

    it('returns null without owners rather than an empty compose window', () => {
        expect(zoneEventMailto({ ...ev, owners: [] })).toBeNull();
        expect(zoneEventMailto(undefined)).toBeNull();
    });
});
