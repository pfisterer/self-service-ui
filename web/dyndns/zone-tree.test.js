import { describe, expect, it } from 'vitest';
import { defaultZone, sharedOwners, zoneHeading, zoneMatches, zoneTree } from './zone-tree.js';
import { filterTree } from '/helper/tree.jsx';

// The user's real zones, in the order the API lists them (own personal zone first): personal ones alone, two shared trees with three owners each, and one zone not created yet under dhbw.cloud.
const ME = 'dennis.pfisterer@dhbw.de';
const THREE = [ME, 'a@dhbw.de', 'b@dhbw.de'];
const BASE = 'dennis-pfisterer-at-dhbw-de.users.dhbw.site';
const sub = (label, parent, owners = [ME]) => ({ name: `${label}.${parent}`, parent, exists: true, owners });
const REAL_ZONES = [
    { name: BASE, zone_soa: 'users.dhbw.site', exists: true, owners: [ME], allow_subdomains: true },
    { name: 'test.pfisterer.users.dhbw.site', zone_soa: 'users.dhbw.site', exists: true, owners: [ME] },
    { name: 'bigdata.pfisterer.users.dhbw.site', zone_soa: 'users.dhbw.site', exists: true, owners: [ME], allow_subdomains: true },
    { name: 'wi-ma.dhbw.site', zone_soa: 'dhbw.site', exists: true, owners: THREE, allow_subdomains: true },
    { name: 'services.dhbw.cloud', zone_soa: 'dhbw.cloud', exists: true, owners: THREE, allow_subdomains: true },
    { name: 'some-project.dhbw.cloud', zone_soa: 'dhbw.cloud', exists: false },
    sub('data-eng-wdski24a', BASE),
    sub('gridflex', BASE),
    sub('iot', BASE),
    sub('ws2627', 'bigdata.pfisterer.users.dhbw.site'),
    sub('crm', 'wi-ma.dhbw.site', THREE),
    ...['gpu', 'itlabs', 'llm', 'mail', 'workflow-auth'].map(l => sub(l, 'services.dhbw.cloud', THREE)),
    sub('staging', 'gpu.services.dhbw.cloud', THREE),
    sub('staging', 'llm.services.dhbw.cloud', THREE),
];

// A heading's trees as nested [label, children], for comparing shapes.
const shape = (rows) => rows.map(r => (r.children.length ? [r.label, shape(r.children)] : r.label));
const headingShapes = (zones) => zoneTree(zones).sections.map(s => [s.soa, shape(s.roots)]);

describe('zoneHeading', () => {
    it('is the zone_soa the zone was given out of, else the name without its first label', () => {
        expect(zoneHeading({ name: 'test.pfisterer.users.dhbw.site', zone_soa: 'users.dhbw.site' })).toBe('users.dhbw.site');
        expect(zoneHeading({ name: 'test.pfisterer.users.dhbw.site' })).toBe('pfisterer.users.dhbw.site');
        // A zone_soa that does not lie above the name is ignored.
        expect(zoneHeading({ name: 'wi-ma.dhbw.site', zone_soa: 'dhbw.cloud' })).toBe('dhbw.site');
        expect(zoneHeading({ name: 'dhbw.site', zone_soa: 'dhbw.site' })).toBe('site');
        expect(zoneHeading({ name: 'localhost' })).toBe('localhost');
    });
});

describe('zoneTree', () => {
    it('puts the zones under the domain they were given out of, each a tree by the zone hierarchy, own and shared together', () => {
        expect(headingShapes(REAL_ZONES)).toEqual([
            ['users.dhbw.site', [
                ['bigdata.pfisterer', ['ws2627']],
                ['dennis-pfisterer-at-dhbw-de', ['data-eng-wdski24a', 'gridflex', 'iot']],
                'test.pfisterer',
            ]],
            ['dhbw.site', [['wi-ma', ['crm']]]],
            // Not created yet: under its heading, after the zones in use.
            ['dhbw.cloud', [
                ['services', [['gpu', ['staging']], 'itlabs', ['llm', ['staging']], 'mail', 'workflow-auth']],
                'some-project',
            ]],
        ]);
        expect(zoneTree(REAL_ZONES).sections.map(s => [s.id, s.count])).toEqual([['heading:users.dhbw.site', 7], ['heading:dhbw.site', 2], ['heading:dhbw.cloud', 9]]);
    });

    it('labels a root below its heading and a subzone below its parent, keeping the full name, prefixed ids and the zone', () => {
        const { sections } = zoneTree(REAL_ZONES);
        const base = sections[0].roots[1];
        expect(base).toMatchObject({ id: `zone:${BASE}`, name: BASE, label: 'dennis-pfisterer-at-dhbw-de', zone: REAL_ZONES[0], heading: 'users.dhbw.site' });
        expect(base.children[0]).toMatchObject({ id: `zone:data-eng-wdski24a.${BASE}`, name: `data-eng-wdski24a.${BASE}`, label: 'data-eng-wdski24a', heading: 'users.dhbw.site' });
        // Without zone_soa (an older API): the name without its first label.
        expect(headingShapes([{ name: 'lea.users.dhbw.site', exists: true }, { name: 'iot.lea.users.dhbw.site', parent: 'lea.users.dhbw.site', exists: true }]))
            .toEqual([['users.dhbw.site', [['lea', ['iot']]]]]);
    });

    it('nests by the parent or the closest zone in use the name ends in, never by labels alone', () => {
        expect(headingShapes([{ name: 'lehre.example', zone_soa: 'example', exists: true }, { name: 'x.y.lehre.example', zone_soa: 'lehre.example', exists: true }, { name: 'other.example', zone_soa: 'example', exists: true }]))
            .toEqual([['example', [['lehre', ['x.y']], 'other']]]);
        // A zone not created yet takes no zone below it.
        expect(headingShapes([{ name: 'lehre.example', zone_soa: 'example', exists: false }, { name: 'a.lehre.example', zone_soa: 'lehre.example', exists: true }]))
            .toEqual([['example', ['lehre']], ['lehre.example', ['a']]]);
    });

    it('orders headings by their first zone in the list, zones in use by label, the ones not created last', () => {
        const zones = [
            { name: 'z.b.example', zone_soa: 'b.example', exists: false },
            { name: 'm.a.example', zone_soa: 'a.example', exists: true },
            { name: 'y.b.example', zone_soa: 'b.example', exists: true },
            { name: 'a.b.example', zone_soa: 'b.example', exists: false },
        ];
        expect(headingShapes(zones)).toEqual([['b.example', ['y', 'a', 'z']], ['a.example', ['m']]]);
    });

    it('lists the rows above a zone and its heading', () => {
        const { ancestors } = zoneTree(REAL_ZONES);
        expect(ancestors('staging.gpu.services.dhbw.cloud')).toEqual(['zone:gpu.services.dhbw.cloud', 'zone:services.dhbw.cloud', 'heading:dhbw.cloud']);
        expect(ancestors('some-project.dhbw.cloud')).toEqual(['heading:dhbw.cloud']);
        expect(ancestors('unknown.example')).toEqual([]);
    });
});

describe('sharedOwners', () => {
    it('marks a root zone with co-owners, a subzone only where its owners differ from the zone above', () => {
        const tree = zoneTree([
            ...REAL_ZONES,
            sub('team', BASE, THREE),
            sub('solo', 'services.dhbw.cloud'),
        ]);
        const shared = (name) => {
            const r = tree.row(`zone:${name}`);
            return sharedOwners(r, tree.parent(r));
        };
        expect(shared('wi-ma.dhbw.site')).toEqual(THREE);
        expect(shared('crm.wi-ma.dhbw.site')).toBeNull();
        expect(shared('staging.gpu.services.dhbw.cloud')).toBeNull();
        expect(shared(BASE)).toBeNull();
        expect(shared(`iot.${BASE}`)).toBeNull();
        expect(shared(`team.${BASE}`)).toEqual(THREE);
        // Fewer owners than the zone above is no sharing to show.
        expect(shared('solo.services.dhbw.cloud')).toBeNull();
        expect(shared('some-project.dhbw.cloud')).toBeNull();
    });
});

describe('zoneMatches', () => {
    it('matches by the full name and keeps the way down to a match', () => {
        const { roots, children } = zoneTree(REAL_ZONES);
        const visible = filterTree(roots, r => r.id, children, r => zoneMatches(r, 'staging.GPU'));
        expect([...visible].sort()).toEqual(['zone:gpu.services.dhbw.cloud', 'zone:services.dhbw.cloud', 'zone:staging.gpu.services.dhbw.cloud']);
        // The heading's part of the name matches too.
        expect([...filterTree(roots, r => r.id, children, r => zoneMatches(r, 'gridflex.dennis'))]).toEqual([`zone:gridflex.${BASE}`, `zone:${BASE}`]);
    });
});

describe('defaultZone', () => {
    it('opens on the first base zone in use, the only zone of a person with one', () => {
        expect(defaultZone([{ name: 'x.lehre', exists: false }, { name: 'sub.me', parent: 'me', exists: true }, { name: 'me', exists: true }]).name).toBe('me');
        expect(defaultZone([{ name: 'x.lehre', exists: false }]).name).toBe('x.lehre');
        expect(defaultZone([])).toBeNull();
    });
});
