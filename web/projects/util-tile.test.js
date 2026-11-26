import { describe, expect, it } from 'vitest';
import { tileActions, tileBars, tileFlag, tileKind } from './util-tile.js';

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
