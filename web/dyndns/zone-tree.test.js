import { describe, expect, it } from 'vitest';
import { defaultZone, zoneMatches, zoneTree } from './zone-tree.js';
import { filterTree } from '/helper/tree.jsx';

// The user's own zones, in the order the API lists them (own base zone first).
const BASE = 'dennis-pfisterer-at-dhbw-de.users.dhbw.site';
const NAMES = [
    BASE,
    `data-eng-wdski24a.${BASE}`,
    `gridflex.${BASE}`,
    `iot.${BASE}`,
    'test.pfisterer.users.dhbw.site',
    'bigdata.pfisterer.users.dhbw.site',
    'ws2627.bigdata.pfisterer.users.dhbw.site',
    'wi-ma.dhbw.site',
    'crm.wi-ma.dhbw.site',
    'services.dhbw.cloud',
    'gpu.services.dhbw.cloud',
    'staging.gpu.services.dhbw.cloud',
    'itlabs.services.dhbw.cloud',
    'llm.services.dhbw.cloud',
    'staging.llm.services.dhbw.cloud',
    'mail.services.dhbw.cloud',
    'workflow-auth.services.dhbw.cloud',
];
const ZONES = NAMES.map(name => ({ name }));

// The tree as nested [label, children] (a group's label in brackets), for comparing shapes.
const shape = (rows) => rows.map(r => {
    const label = r.zone ? r.label : `[${r.label}]`;
    return r.children.length ? [label, shape(r.children)] : label;
});

describe('zoneTree', () => {
    it('builds the tree from the labels, groups for names above zones, chains merged', () => {
        expect(shape(zoneTree(ZONES).roots)).toEqual([
            ['[dhbw.site]', [
                ['[users]', [
                    ['dennis-pfisterer-at-dhbw-de', ['data-eng-wdski24a', 'gridflex', 'iot']],
                    ['[pfisterer]', [['bigdata', ['ws2627']], 'test']],
                ]],
                ['wi-ma', ['crm']],
            ]],
            ['[dhbw.cloud]', [
                ['services', [['gpu', ['staging']], 'itlabs', ['llm', ['staging']], 'mail', 'workflow-auth']],
            ]],
        ]);
    });

    it('keeps the full name, prefixed ids and the zone on every row', () => {
        const { roots } = zoneTree(ZONES);
        const users = roots[0].children[0];
        expect(users).toMatchObject({ id: 'group:users.dhbw.site', name: 'users.dhbw.site', label: 'users', zone: null });
        expect(users.children[0]).toMatchObject({ id: `zone:${BASE}`, name: BASE, label: 'dennis-pfisterer-at-dhbw-de', zone: ZONES[0] });
    });

    it('shows a lone zone in full instead of one row per label', () => {
        expect(shape(zoneTree([{ name: 'x.y.example.org' }]).roots)).toEqual(['x.y.example.org']);
        expect(shape(zoneTree([{ name: 'a.x.y.example.org' }, { name: 'b.x.y.example.org' }]).roots)).toEqual([['[example.org]', [['[x.y]', ['a', 'b']]]]]);
        // A group with a single branch below it is merged into it, the zones keep their own labels.
        expect(shape(zoneTree([{ name: 'wi24a.lehre.dhbw.cloud' }, { name: 'bildanalyse.projects.dhbw.cloud' }]).roots)).toEqual([['[dhbw.cloud]', ['bildanalyse.projects', 'wi24a.lehre']]]);
    });

    it('keeps a zone that is itself a domain or has subzones selectable and openable', () => {
        const { roots } = zoneTree([{ name: 'example.org' }, { name: 'www.example.org' }]);
        expect(shape(roots)).toEqual([['example.org', ['www']]]);
        expect(roots[0].id).toBe('zone:example.org');
    });

    it('orders the top as the API lists the zones, below by label', () => {
        expect(zoneTree(ZONES.slice().reverse()).roots.map(r => r.name)).toEqual(['dhbw.cloud', 'dhbw.site']);
    });

    it('lists the rows above a zone, groups included, nearest first', () => {
        const { ancestors } = zoneTree(ZONES);
        expect(ancestors('ws2627.bigdata.pfisterer.users.dhbw.site')).toEqual(['zone:bigdata.pfisterer.users.dhbw.site', 'group:pfisterer.users.dhbw.site', 'group:users.dhbw.site', 'group:dhbw.site']);
        expect(ancestors('services.dhbw.cloud')).toEqual(['group:dhbw.cloud']);
        expect(ancestors('unknown.example')).toEqual([]);
    });
});

describe('zoneMatches', () => {
    it('matches zones by their full name and shows the groups on the way down', () => {
        const { roots, children } = zoneTree(ZONES);
        const visible = filterTree(roots, r => r.id, children, r => zoneMatches(r, 'ws26'));
        expect([...visible].sort()).toEqual(['group:dhbw.site', 'group:pfisterer.users.dhbw.site', 'group:users.dhbw.site', 'zone:bigdata.pfisterer.users.dhbw.site', 'zone:ws2627.bigdata.pfisterer.users.dhbw.site']);
        // The full name, not only the label: "pfisterer.users" finds every zone below the group.
        expect(zoneMatches(roots[0].children[0].children[1].children[1], 'Pfisterer.users')).toBe(true);
        expect(zoneMatches(roots[0], 'dhbw.site')).toBe(false);
    });
});

describe('defaultZone', () => {
    it('opens on the first base zone in use', () => {
        expect(defaultZone([{ name: 'x.lehre', exists: false }, { name: 'sub.me', parent: 'me', exists: true }, { name: 'me', exists: true }]).name).toBe('me');
        expect(defaultZone([{ name: 'x.lehre', exists: false }]).name).toBe('x.lehre');
        expect(defaultZone([])).toBeNull();
    });
});
