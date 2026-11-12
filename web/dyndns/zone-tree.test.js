import { describe, expect, it } from 'vitest';
import { defaultZone, zoneAncestors, zoneLabel, zoneTree } from './zone-tree.js';

const ZONES = [
    { name: 'services.dhbw.cloud' },
    { name: 'staging.llm.services.dhbw.cloud', parent: 'llm.services.dhbw.cloud' },
    { name: 'llm.services.dhbw.cloud', parent: 'services.dhbw.cloud' },
    { name: 'gpu.services.dhbw.cloud', parent: 'services.dhbw.cloud' },
    { name: 'other.example', parent: 'example' },
];

describe('zoneTree', () => {
    it('nests subzones of subzones under their parent, by name', () => {
        const { roots, children } = zoneTree(ZONES);
        expect(roots.map(z => z.name)).toEqual(['services.dhbw.cloud', 'other.example']);
        expect(children(roots[0]).map(z => z.name)).toEqual(['gpu.services.dhbw.cloud', 'llm.services.dhbw.cloud']);
        expect(children(children(roots[0])[1]).map(z => z.name)).toEqual(['staging.llm.services.dhbw.cloud']);
    });

    it('puts a cycle at the top instead of losing it', () => {
        const { roots, children } = zoneTree([{ name: 'a.x', parent: 'b.x' }, { name: 'b.x', parent: 'a.x' }]);
        expect(roots.map(z => z.name)).toEqual(['a.x']);
        expect(children(roots[0]).map(z => z.name)).toEqual(['b.x']);
    });
});

describe('zoneLabel, zoneAncestors, defaultZone', () => {
    it('shortens a subzone to its own part', () => {
        expect(zoneLabel(ZONES[1])).toBe('staging');
        expect(zoneLabel(ZONES[0])).toBe('services.dhbw.cloud');
    });

    it('lists the way up, nearest first, and stops at a cycle', () => {
        expect(zoneAncestors(ZONES, 'staging.llm.services.dhbw.cloud')).toEqual(['llm.services.dhbw.cloud', 'services.dhbw.cloud']);
        expect(zoneAncestors([{ name: 'a.x', parent: 'b.x' }, { name: 'b.x', parent: 'a.x' }], 'a.x')).toEqual(['b.x']);
    });

    it('opens on the first base zone in use', () => {
        expect(defaultZone([{ name: 'x.lehre', exists: false }, { name: 'sub.me', parent: 'me', exists: true }, { name: 'me', exists: true }]).name).toBe('me');
        expect(defaultZone([{ name: 'x.lehre', exists: false }]).name).toBe('x.lehre');
        expect(defaultZone([])).toBeNull();
    });
});
