import { describe, expect, it } from 'vitest';
import { defaultZone, nameParts, zoneMatches, zoneTree } from './zone-tree.js';
import { filterTree } from '/helper/tree.jsx';

// The user's real zones, in the order the API lists them (own base zone first): personal ones alone, two shared trees with three owners each, and one zone not created yet.
const ME = 'dennis.pfisterer@dhbw.de';
const THREE = [ME, 'a@dhbw.de', 'b@dhbw.de'];
const BASE = 'dennis-pfisterer-at-dhbw-de.users.dhbw.site';
const sub = (label, parent, owners = [ME]) => ({ name: `${label}.${parent}`, parent, exists: true, owners });
const REAL_ZONES = [
    { name: BASE, exists: true, owners: [ME], allow_subdomains: true },
    sub('data-eng-wdski24a', BASE),
    sub('gridflex', BASE),
    sub('iot', BASE),
    { name: 'test.pfisterer.users.dhbw.site', exists: true, owners: [ME] },
    { name: 'bigdata.pfisterer.users.dhbw.site', exists: true, owners: [ME], allow_subdomains: true },
    sub('ws2627', 'bigdata.pfisterer.users.dhbw.site'),
    { name: 'wi-ma.dhbw.site', exists: true, owners: THREE, allow_subdomains: true },
    sub('crm', 'wi-ma.dhbw.site', THREE),
    { name: 'services.dhbw.cloud', exists: true, owners: THREE, allow_subdomains: true },
    ...['gpu', 'itlabs', 'llm', 'mail', 'workflow-auth'].map(l => sub(l, 'services.dhbw.cloud', THREE)),
    sub('staging', 'gpu.services.dhbw.cloud', THREE),
    sub('staging', 'llm.services.dhbw.cloud', THREE),
    { name: 'wi24a.lehre.dhbw.cloud', exists: false, can_join: false },
];

// A section's trees as nested [label, children], for comparing shapes.
const shape = (rows) => rows.map(r => (r.children.length ? [r.label, shape(r.children)] : r.label));
const sectionShapes = (zones) => Object.fromEntries(zoneTree(zones).sections.map(s => [s.key, shape(s.roots)]));

describe('zoneTree', () => {
    it('sorts the zones into own, shared and available, each a tree by the zone hierarchy', () => {
        expect(sectionShapes(REAL_ZONES)).toEqual({
            own: [
                [BASE, ['data-eng-wdski24a', 'gridflex', 'iot']],
                'test.pfisterer.users.dhbw.site',
                ['bigdata.pfisterer.users.dhbw.site', ['ws2627']],
            ],
            shared: [
                ['wi-ma.dhbw.site', ['crm']],
                ['services.dhbw.cloud', [['gpu', ['staging']], 'itlabs', ['llm', ['staging']], 'mail', 'workflow-auth']],
            ],
            available: ['wi24a.lehre.dhbw.cloud'],
        });
        expect(zoneTree(REAL_ZONES).sections.map(s => [s.id, s.count])).toEqual([['section:own', 7], ['section:shared', 10], ['section:available', 1]]);
    });

    it('keeps a subzone in its root section, whoever else owns it', () => {
        const { sections } = zoneTree([{ name: 'me.x', exists: true, owners: [ME] }, { name: 'team.me.x', parent: 'me.x', exists: true, owners: THREE }]);
        expect(sections.map(s => s.key)).toEqual(['own']);
        expect(shape(sections[0].roots)).toEqual([['me.x', ['team']]]);
    });

    it('nests by the parent or the closest zone the name ends in, never by labels alone', () => {
        // lehre.example is a zone, so x.y.lehre.example sits below it with the label x.y; nothing is made of the labels in between.
        expect(sectionShapes([{ name: 'lehre.example', exists: true, owners: [ME] }, { name: 'x.y.lehre.example', exists: true, owners: [ME] }, { name: 'other.example', exists: true, owners: [ME] }]))
            .toEqual({ own: [['lehre.example', ['x.y']], 'other.example'] });
        // A zone not in use does not take zones in use below it.
        expect(sectionShapes([{ name: 'lehre.example', exists: false }, { name: 'a.lehre.example', exists: true, owners: [ME] }]))
            .toEqual({ own: ['a.lehre.example'], available: ['lehre.example'] });
    });

    it('keeps the full name, prefixed ids and the zone on every row', () => {
        const { sections } = zoneTree(REAL_ZONES);
        const base = sections[0].roots[0];
        expect(base).toMatchObject({ id: `zone:${BASE}`, name: BASE, label: BASE, zone: REAL_ZONES[0], section: 'own' });
        expect(base.children[0]).toMatchObject({ id: `zone:data-eng-wdski24a.${BASE}`, label: 'data-eng-wdski24a', section: 'own' });
    });

    it('orders roots as the API lists them, subzones by label', () => {
        expect(shape(zoneTree(REAL_ZONES.slice().reverse()).sections[0].roots).map(r => (Array.isArray(r) ? r[0] : r)))
            .toEqual(['bigdata.pfisterer.users.dhbw.site', 'test.pfisterer.users.dhbw.site', BASE]);
    });

    it('lists the rows above a zone and its section, the section only where there are headers', () => {
        const { ancestors } = zoneTree(REAL_ZONES);
        expect(ancestors('staging.gpu.services.dhbw.cloud')).toEqual(['zone:gpu.services.dhbw.cloud', 'zone:services.dhbw.cloud', 'section:shared']);
        expect(ancestors('wi24a.lehre.dhbw.cloud')).toEqual(['section:available']);
        expect(ancestors('unknown.example')).toEqual([]);
        expect(zoneTree([{ name: 'me.x', exists: true, owners: [ME] }, { name: 'a.me.x', parent: 'me.x', exists: true, owners: [ME] }]).ancestors('a.me.x')).toEqual(['zone:me.x']);
    });
});

describe('nameParts', () => {
    it('splits a name into its first label and the rest for a two-line row', () => {
        expect(nameParts(BASE)).toEqual(['dennis-pfisterer-at-dhbw-de', '.users.dhbw.site']);
        expect(nameParts('localhost')).toEqual(['localhost', '']);
    });
});

describe('zoneMatches', () => {
    it('matches by the full name and keeps the way down to a match', () => {
        const { roots, children } = zoneTree(REAL_ZONES);
        const visible = filterTree(roots, r => r.id, children, r => zoneMatches(r, 'staging.GPU'));
        expect([...visible].sort()).toEqual(['zone:gpu.services.dhbw.cloud', 'zone:services.dhbw.cloud', 'zone:staging.gpu.services.dhbw.cloud']);
        expect(zoneMatches(roots[0].children[1], 'gridflex.dennis')).toBe(true);
    });
});

describe('defaultZone', () => {
    it('opens on the first base zone in use, the only zone of a person with one', () => {
        expect(defaultZone([{ name: 'x.lehre', exists: false }, { name: 'sub.me', parent: 'me', exists: true }, { name: 'me', exists: true }]).name).toBe('me');
        expect(defaultZone([{ name: 'x.lehre', exists: false }]).name).toBe('x.lehre');
        expect(defaultZone([])).toBeNull();
    });
});
