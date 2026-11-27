import { describe, it, expect } from 'vitest';
import { badgeLabel, bellEnabled, countUnread, isUnread, newestAt, pollInterval, POLL_MS, portalPath, readSeen, writeSeen } from './bell.js';

const at = (created_at, id = created_at) => ({ id, created_at });

function memoryStorage() {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), keys: () => [...m.keys()] };
}

describe('countUnread', () => {
    const items = [at('2026-11-27T09:00:00Z'), at('2026-11-26T09:00:00Z'), at('2026-11-25T09:00:00Z')];

    it('counts everything when the list was never opened', () => {
        expect(countUnread(items, null)).toBe(3);
    });

    it('counts only what came after the last opening', () => {
        expect(countUnread(items, '2026-11-26T09:00:00Z')).toBe(1);
        expect(countUnread(items, '2026-11-27T09:00:00Z')).toBe(0);
    });

    it('compares times, not strings', () => {
        expect(countUnread([at('2026-11-27T10:00:00+01:00')], '2026-11-27T08:30:00Z')).toBe(1);
        expect(countUnread([at('2026-11-27T09:00:00.5Z')], '2026-11-27T09:00:00Z')).toBe(1);
    });

    it('takes an unreadable time as seen, and an unreadable mark as never opened', () => {
        expect(isUnread(at('nonsense'), null)).toBe(false);
        expect(countUnread(items, 'nonsense')).toBe(3);
        expect(countUnread(undefined, null)).toBe(0);
    });
});

describe('newestAt', () => {
    it('is the newest timestamp as the service wrote it', () => {
        expect(newestAt([at('2026-11-25T09:00:00Z'), at('2026-11-27T09:00:00Z'), at('2026-11-26T09:00:00Z')])).toBe('2026-11-27T09:00:00Z');
        expect(newestAt([])).toBeNull();
        expect(newestAt([at('nonsense')])).toBeNull();
    });
});

describe('pollInterval', () => {
    it('asks every minute in a visible tab and not at all in the background', () => {
        expect(pollInterval('visible')).toBe(POLL_MS);
        expect(POLL_MS).toBe(60_000);
        expect(pollInterval('hidden')).toBe(false);
    });
});

describe('bellEnabled', () => {
    const user = { profile: { email: 'person@example.edu' } };
    it('needs the service, a person signed in, and nobody acted for', () => {
        expect(bellEnabled({ enabled: true, user, actingAs: null })).toBe(true);
        expect(bellEnabled({ enabled: false, user, actingAs: null })).toBe(false);
        expect(bellEnabled({ enabled: true, user: null, actingAs: null })).toBe(false);
        expect(bellEnabled({ enabled: true, user, actingAs: 'other@example.edu' })).toBe(false);
    });
});

describe('badgeLabel', () => {
    it('shows nothing for none and caps at 9+', () => {
        expect(badgeLabel(0)).toBeNull();
        expect(badgeLabel(3)).toBe('3');
        expect(badgeLabel(9)).toBe('9');
        expect(badgeLabel(10)).toBe('9+');
    });
});

describe('readSeen / writeSeen', () => {
    it('keeps one mark per person', () => {
        const s = memoryStorage();
        writeSeen('a@example.edu', '2026-11-27T09:00:00Z', s);
        expect(readSeen('a@example.edu', s)).toBe('2026-11-27T09:00:00Z');
        expect(readSeen('b@example.edu', s)).toBeNull();
    });

    it('does not write an empty mark', () => {
        const s = memoryStorage();
        writeSeen('a@example.edu', null, s);
        expect(s.keys()).toEqual([]);
    });

    it('survives a storage that refuses', () => {
        const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
        expect(readSeen('a@example.edu', broken)).toBeNull();
        expect(() => writeSeen('a@example.edu', '2026-11-27T09:00:00Z', broken)).not.toThrow();
        expect(readSeen('a@example.edu', undefined)).toBeNull();
    });
});

describe('portalPath', () => {
    const here = 'https://portal.example.edu/home';
    it('turns a link into the portal into a path and leaves others alone', () => {
        expect(portalPath('https://portal.example.edu/projects?project=p_1', here)).toBe('/projects?project=p_1');
        expect(portalPath('/projects?budget=b_1', here)).toBe('/projects?budget=b_1');
        expect(portalPath('https://elsewhere.example.edu/x', here)).toBeNull();
        expect(portalPath('http://[bad', here)).toBeNull();
    });
});
