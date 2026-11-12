// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { renderView } from '/test/render-harness.jsx';
import i18n from '/i18n/index.js';

// The zones page as tree and detail: the tree is built from the zone names label by label, with group rows for names above zones that are no zone themselves (opened and closed by a click, never selected) and each row only with its new labels; a click on a zone shows the zone on the right and puts it in the URL, a zone that allows subzones offers one in its row and in its header, and from six zones on a filter stands above the tree.

vi.mock('/dyndns/api-zones.jsx', () => ({ useZonesApi: () => globalThis.__zonesApi }));

const ME = 'dennis.pfisterer@dhbw.de';
// The user's real zones: a base zone with subzones, subzones under groups that are no zone (dhbw.site, users, pfisterer, dhbw.cloud), one zone not active and one shared.
const BASE = 'dennis-pfisterer-at-dhbw-de.users.dhbw.site';
const ZONES = [
    { name: BASE, exists: true, owners: [ME], allow_subdomains: true },
    { name: `data-eng-wdski24a.${BASE}`, parent: BASE, exists: true, owners: [ME, 'tom@dhbw.de'], allow_subdomains: true },
    { name: `gridflex.${BASE}`, parent: BASE, exists: true, owners: [ME] },
    { name: `iot.${BASE}`, parent: BASE, exists: true, owners: [ME] },
    { name: 'test.pfisterer.users.dhbw.site', exists: true, owners: [ME] },
    { name: 'bigdata.pfisterer.users.dhbw.site', exists: true, owners: [ME], allow_subdomains: true },
    { name: 'ws2627.bigdata.pfisterer.users.dhbw.site', parent: 'bigdata.pfisterer.users.dhbw.site', exists: true, owners: [ME] },
    { name: 'wi-ma.dhbw.site', exists: false, can_join: false },
    { name: 'crm.wi-ma.dhbw.site', parent: 'wi-ma.dhbw.site', exists: true, owners: [ME] },
    { name: 'services.dhbw.cloud', exists: true, owners: [ME], allow_subdomains: true },
    ...['gpu', 'itlabs', 'llm', 'mail', 'workflow-auth'].map(l => ({ name: `${l}.services.dhbw.cloud`, parent: 'services.dhbw.cloud', exists: true, owners: [ME] })),
    { name: 'staging.gpu.services.dhbw.cloud', parent: 'gpu.services.dhbw.cloud', exists: true, owners: [ME] },
    { name: 'staging.llm.services.dhbw.cloud', parent: 'llm.services.dhbw.cloud', exists: true, owners: [ME] },
];
const detail = (name) => ({ owners: ZONES.find(z => z.name === name)?.owners ?? [ME], creator: ME, zoneData: { zone: name, zone_keys: [] } });

let calls;
beforeEach(() => {
    calls = [];
    const store = new Map();
    vi.stubGlobal('localStorage', { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear() });
    globalThis.__zonesApi = {
        getMe: async () => ({ email: ME, super_admin: false }),
        listZones: async () => ZONES,
        getZone: async (name) => { calls.push(name); return detail(name); },
        listZoneEvents: async () => [],
        listDnsRecords: async () => [],
        createZone: async () => ({}),
    };
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

const { DynDnsZones } = await import('/dyndns/zones.jsx');

function renderAt(path) {
    const memory = memoryLocation({ path, record: true });
    renderView(<Router hook={memory.hook}><DynDnsZones /></Router>);
    return memory;
}

const rows = () => screen.getAllByRole('treeitem').map(r => [r.querySelector('p').textContent, r.getAttribute('aria-level')]);
const row = (label, level) => screen.getAllByRole('treeitem').find(r => r.querySelector('p')?.textContent === label && (!level || r.getAttribute('aria-level') === String(level)));
const heading = () => screen.findByRole('heading', { level: 3 });

describe('the zones page', () => {
    it('builds the tree from the labels with group rows and short labels, and opens on the own base zone', async () => {
        const memory = renderAt('/');
        await screen.findByRole('tree');
        expect(rows()).toEqual([
            ['dhbw.site', '1'], ['users', '2'], ['dennis-pfisterer-at-dhbw-de', '3'], ['data-eng-wdski24a', '4'], ['gridflex', '4'], ['iot', '4'],
            ['pfisterer', '3'], ['bigdata', '4'], ['ws2627', '5'], ['test', '4'],
            ['wi-ma', '2'], ['crm', '3'],
            ['dhbw.cloud', '1'], ['services', '2'], ['gpu', '3'], ['staging', '4'], ['itlabs', '3'], ['llm', '3'], ['staging', '4'], ['mail', '3'], ['workflow-auth', '3'],
        ]);
        await waitFor(() => expect(memory.history.at(-1)).toBe(`/zone/${BASE}`));
        expect(row('dennis-pfisterer-at-dhbw-de').getAttribute('aria-selected')).toBe('true');
        expect((await heading()).textContent).toBe(BASE);
        // Group rows are not selectable, have no actions and are dimmed.
        expect(row('users').hasAttribute('aria-selected')).toBe(false);
        expect(row('users').getAttribute('aria-expanded')).toBe('true');
        expect(within(row('users')).queryAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual([i18n.t('projects.tree.collapse')]);
        // Shared: a small sign with the number of owners; not yet active: dimmed with a small sign, no text badge.
        expect(within(row('data-eng-wdski24a')).getByLabelText(i18n.t('dyndns.zoneList.sharedWith', { owners: `${ME}, tom@dhbw.de` })).textContent).toBe('2');
        expect(within(row('wi-ma')).getByRole('img', { name: i18n.t('dyndns.zoneList.inactive') })).toBeTruthy();
        expect(within(row('wi-ma')).queryByText(i18n.t('dyndns.zoneList.inactive'))).toBeNull();
    });

    it('a click on a group row opens and closes it instead of selecting', async () => {
        const memory = renderAt(`/zone/${BASE}`);
        await heading();
        fireEvent.click(row('pfisterer').querySelector('p'));
        expect(row('pfisterer').getAttribute('aria-expanded')).toBe('false');
        expect(row('test')).toBeUndefined();
        expect(memory.history.at(-1)).toBe(`/zone/${BASE}`);
        fireEvent.click(row('pfisterer').querySelector('p'));
        expect(row('test')).toBeTruthy();
    });

    it('shows the zone clicked in the tree and keeps it in the URL', async () => {
        const memory = renderAt(`/zone/${BASE}`);
        await heading();
        fireEvent.click(row('staging', 4));
        await waitFor(() => expect(memory.history.at(-1)).toBe('/zone/staging.gpu.services.dhbw.cloud'));
        await waitFor(async () => expect((await heading()).textContent).toBe('staging.gpu.services.dhbw.cloud'));
        expect(calls).toContain('staging.gpu.services.dhbw.cloud');
        expect(row('staging').getAttribute('aria-selected')).toBe('true');
    });

    it('a zone not yet active shows its name and the way to activate it', async () => {
        renderAt('/zone/wi-ma.dhbw.site');
        expect((await heading()).textContent).toBe('wi-ma.dhbw.site');
        expect(screen.getByRole('button', { name: i18n.t('dyndns.zoneDetail.activate') })).toBeTruthy();
    });

    it('offers a subzone in the row and in the header, and opens the dialog for that zone', async () => {
        renderAt(`/zone/${BASE}`);
        await heading();
        // Only zones that allow subzones have the row action.
        expect(screen.queryByRole('button', { name: i18n.t('dyndns.zoneList.addSubzone', { zone: `iot.${BASE}` }) })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: i18n.t('dyndns.zoneList.addSubzone', { zone: `data-eng-wdski24a.${BASE}` }) }));
        const dialog = await screen.findByRole('dialog');
        expect(dialog.textContent).toContain(`data-eng-wdski24a.${BASE}`);
        fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('dyndns.actions.cancel') }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

        fireEvent.click(await screen.findByRole('button', { name: i18n.t('dyndns.subzone.title') }));
        expect((await screen.findByRole('dialog')).textContent).toContain(BASE);
    });

    it('filters on the full name, keeping the way down to a match with its group rows', async () => {
        renderAt(`/zone/${BASE}`);
        await screen.findByRole('tree');
        fireEvent.change(screen.getByLabelText(i18n.t('dyndns.zoneList.filter')), { target: { value: 'ws2627.bigdata' } });
        expect(rows()).toEqual([['dhbw.site', '1'], ['users', '2'], ['pfisterer', '3'], ['bigdata', '4'], ['ws2627', '5']]);
        fireEvent.change(screen.getByLabelText(i18n.t('dyndns.zoneList.filter')), { target: { value: 'nothing-like-it' } });
        expect(screen.getByText(i18n.t('dyndns.zoneList.noMatch'))).toBeTruthy();
    });

    it('opens the branches above a zone selected by link, group rows included', async () => {
        localStorage.setItem('self-service.dyndns-zones.collapsed', JSON.stringify(['group:dhbw.site', 'group:pfisterer.users.dhbw.site', 'zone:bigdata.pfisterer.users.dhbw.site', 'zone:services.dhbw.cloud']));
        renderAt('/zone/ws2627.bigdata.pfisterer.users.dhbw.site');
        await waitFor(() => expect(row('ws2627')).toBeTruthy());
        for (const label of ['dhbw.site', 'pfisterer', 'bigdata']) expect(row(label).getAttribute('aria-expanded')).toBe('true');
        // Other branches closed by hand stay closed.
        expect(row('services').getAttribute('aria-expanded')).toBe('false');
    });
});
