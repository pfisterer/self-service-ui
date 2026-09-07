import { describe, expect, it } from 'vitest';
import {
    groupZoneEventsByZone, worstZoneEventColor, zoneEventColor, zoneEventTimeline,
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
