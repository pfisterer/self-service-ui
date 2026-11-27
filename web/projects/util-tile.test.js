import { describe, expect, it } from 'vitest';
import { listBars, panelActions, rowButtons, tileActions, tileBars, tileFlag, tileHasDetails, tileKind } from './util-tile.js';

const OWNER = { details: true, change: true, release: true };

describe('tileKind', () => {
    it('speaks for the filter where the project is of it, else for its first kind', () => {
        expect(tileKind(['cloud', 'llm'], 'llm')).toBe('llm');
        expect(tileKind(['cloud', 'llm'], 'all')).toBe('cloud');
        expect(tileKind([], 'all')).toBeNull();
    });
});

describe('tileActions', () => {
    it('opens a cloud project in OpenStack, edits it second, the rest in the menu', () => {
        const a = tileActions({ kind: 'cloud', can: OWNER, openstackUrl: 'https://os', usage: true, releasable: true });
        expect(a.primary).toBe('openstack');
        expect(a.secondary).toBe('edit');
        expect(a.menu.map(m => m.id)).toEqual(['usage', 'members', 'history', 'link', 'release']);
        expect(a.menu.filter(m => m.danger).map(m => m.id)).toEqual(['release']);
    });

    it('starts a workspace, with its batch jobs in the menu', () => {
        const a = tileActions({ kind: 'workspaces', can: OWNER, start: '/servers/start?project=x', jobs: true, releasable: true });
        expect([a.primary, a.secondary]).toEqual(['start', 'edit']);
        expect(a.menu.map(m => m.id)).toEqual(['jobs', 'members', 'history', 'link', 'release']);
    });

    it('shows the keys of an LLM project', () => {
        expect(tileActions({ kind: 'llm', can: OWNER, keys: true }).primary).toBe('keys');
    });

    it('offers the models and limits of an LLM project to those who may change it, in the menu and so in the side panel\'s "Mehr"', () => {
        const a = tileActions({ kind: 'llm', can: OWNER, keys: true, llm: true, releasable: true });
        expect([a.primary, a.secondary]).toEqual(['keys', 'edit']);
        expect(a.menu.map(m => m.id)).toEqual(['limits', 'members', 'history', 'link', 'release']);
        expect(panelActions(a).menu.map(m => m.id)).toEqual(['limits', 'release']);
        // Also where the tile speaks for another kind of the project.
        expect(tileActions({ kind: 'cloud', can: OWNER, llm: true }).menu.map(m => m.id)).toContain('limits');
        expect(tileActions({ kind: 'llm', can: { details: true }, llm: true, memberView: true }).menu.map(m => m.id)).not.toContain('limits');
        expect(tileActions({ kind: 'cloud', can: OWNER }).menu.map(m => m.id)).not.toContain('limits');
    });

    it('puts a decision first and keeps what the project is for in the menu', () => {
        const a = tileActions({ kind: 'cloud', can: OWNER, openstackUrl: 'https://os', decide: true });
        expect([a.primary, a.secondary]).toEqual(['decide', 'edit']);
        expect(a.menu[0].id).toBe('openstack');
    });

    it('gives a member details, no history and nothing dangerous', () => {
        const a = tileActions({ kind: 'cloud', can: { details: true }, openstackUrl: 'https://os', memberView: true });
        expect([a.primary, a.secondary]).toEqual(['openstack', 'details']);
        expect(a.menu.map(m => m.id)).toEqual(['members', 'link']);
    });

    it('falls back to editing where the kind has nothing to open, and never shows an action twice', () => {
        const a = tileActions({ kind: 'cloud', can: OWNER, usage: true });
        expect([a.primary, a.secondary]).toEqual(['edit', 'usage']);
        expect(a.menu.map(m => m.id)).not.toContain('usage');
    });

    it('offers giving back only to those who may, and deleting for good where allowed', () => {
        expect(tileActions({ kind: 'cloud', can: OWNER, releasable: false }).menu.map(m => m.id)).not.toContain('release');
        expect(tileActions({ kind: 'cloud', can: { details: true, deleteForGood: true } }).menu.at(-1)).toEqual({ id: 'delete-for-good', danger: true });
    });
});

describe('tileFlag', () => {
    it('has no chip for a project running as granted', () => {
        expect(tileFlag({ status: 'approved' })).toBeNull();
    });

    it('names the most pressing difference', () => {
        expect(tileFlag({ status: 'pending', decide: true }).key).toBe('decide');
        expect(tileFlag({ status: 'pending' }).key).toBe('pending');
        expect(tileFlag({ status: 'approved', overage: true, full: 'Kerne' }).key).toBe('overage');
        expect(tileFlag({ status: 'approved', full: 'Kerne', expiryTone: 'red' })).toEqual({ key: 'full', color: 'orange', name: 'Kerne' });
        expect(tileFlag({ status: 'approved', expiryTone: 'orange' }).key).toBe('ending');
        expect(tileFlag({ status: 'approved', expiryTone: 'gray' })).toBeNull();
    });
});

describe('tileBars', () => {
    const R = [{ id: 'cores' }, { id: 'ram' }, { id: 'disk' }, { id: 'vms' }, { id: 'net', kind: 'bool' }];
    it('shows at most three granted quantities, fullest first, orange from 80 %', () => {
        const bars = tileBars(R, { cores: 10, ram: 100, disk: 50, vms: 4, net: 1 }, { cores: 9, ram: 10, disk: 25, vms: 1 });
        expect(bars.map(b => b.resource.id)).toEqual(['cores', 'disk', 'vms']);
        expect(bars.map(b => b.high)).toEqual([true, false, false]);
    });

    it('keeps the catalogue order without a measurement', () => {
        expect(tileBars(R, { cores: 10, ram: 100 }, null).map(b => b.resource.id)).toEqual(['cores', 'ram']);
    });
});

describe('listBars', () => {
    const R = [{ id: 'cores' }, { id: 'ram' }, { id: 'disk' }, { id: 'vms' }, { id: 'net', kind: 'bool' }, { id: 'tokens', provider: 'llm', area: 'llm' }];
    it('keeps the catalogue order however full, so rows line up', () => {
        const a = listBars(R, { cores: 10, ram: 100, disk: 50, vms: 4 }, { cores: 1, ram: 95, disk: 49 }, 'cloud');
        const b = listBars(R, { cores: 10, ram: 100, disk: 50, vms: 4 }, { cores: 9, ram: 5, disk: 1 }, 'cloud');
        expect(a.map(x => x.resource.id)).toEqual(['cores', 'ram', 'disk']);
        expect(b.map(x => x.resource.id)).toEqual(['cores', 'ram', 'disk']);
        expect(a.map(x => x.high)).toEqual([false, true, true]);
    });

    it('shows only the resources of the row\'s kind, all granted ones without a kind', () => {
        const limit = { cores: 10, tokens: 1000 };
        expect(listBars(R, limit, null, 'llm').map(x => x.resource.id)).toEqual(['tokens']);
        expect(listBars(R, limit, null, 'cloud').map(x => x.resource.id)).toEqual(['cores']);
        expect(listBars(R, limit, null, null).map(x => x.resource.id)).toEqual(['cores', 'tokens']);
    });

    it('leaves the tile order alone', () => {
        expect(tileBars(R, { cores: 10, ram: 100 }, { cores: 1, ram: 90 }).map(b => b.resource.id)).toEqual(['ram', 'cores']);
    });
});

describe('rowButtons', () => {
    it('stacks primary, second and "Details" in this order', () => {
        expect(rowButtons({ primary: 'openstack', secondary: 'edit' })).toEqual([{ id: 'openstack', variant: 'filled' }, { id: 'edit', variant: 'outline' }, { id: 'details', variant: 'default' }]);
    });

    it('keeps the order when one is missing and has no second "Details"', () => {
        expect(rowButtons({ primary: 'openstack', secondary: 'details' }).map(b => b.id)).toEqual(['openstack', 'details']);
        expect(rowButtons({ primary: null, secondary: 'edit' }).map(b => b.id)).toEqual(['edit', 'details']);
        expect(rowButtons({ primary: 'details', secondary: null }).map(b => b.id)).toEqual(['details']);
    });
});

describe('panelActions', () => {
    it('leaves out what a tab of the panel covers and keeps the rest', () => {
        const a = tileActions({ kind: 'cloud', can: OWNER, openstackUrl: 'https://os', releasable: true, usage: true });
        expect(panelActions(a)).toEqual({ primary: 'openstack', secondary: 'edit', menu: [{ id: 'release', danger: true }] });
    });

    it('moves the second action up when the first one is a tab', () => {
        expect(panelActions({ primary: 'details', secondary: 'edit', menu: [] })).toEqual({ primary: 'edit', secondary: null, menu: [] });
    });

    it('keeps for a member only what no tab covers', () => {
        const a = tileActions({ kind: 'cloud', can: { details: true }, openstackUrl: null, usage: true, memberView: true });
        expect(panelActions(a)).toEqual({ primary: null, secondary: null, menu: [] });
    });

    it('ends up empty when only tabs were left', () => {
        expect(panelActions({ primary: 'details', secondary: 'usage', menu: [{ id: 'members', danger: false }] })).toEqual({ primary: null, secondary: null, menu: [] });
    });
});

describe('tileHasDetails', () => {
    it('adds "Details" next to the two actions, unless one of them already is it', () => {
        expect(tileHasDetails({ primary: 'openstack', secondary: 'edit' })).toBe(true);
        expect(tileHasDetails({ primary: 'start', secondary: 'details' })).toBe(false);
        expect(tileHasDetails({ primary: 'details', secondary: 'usage' })).toBe(false);
    });
});
