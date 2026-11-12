// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { renderView } from '/test/render-harness.jsx';
import i18n from '/i18n/index.js';

// The zones page as tree and detail: the tree nests subzones under their zone, a click shows the zone on the right and puts it in the URL, a zone that allows subzones offers one in its row and in its header, and from six zones on a filter stands above the tree.

vi.mock('/dyndns/api-zones.jsx', () => ({ useZonesApi: () => globalThis.__zonesApi }));

const ME = 'dennis.pfisterer@dhbw.de';
const BASE = 'dennis-pfisterer.users.dhbw.site';
const ZONES = [
    { name: 'wi24a.lehre.dhbw.cloud', exists: false, can_join: false },
    { name: BASE, exists: true, owners: [ME], allow_subdomains: true },
    { name: `api.${BASE}`, parent: BASE, exists: true, owners: [ME, 'tom@dhbw.de'], allow_subdomains: true },
    { name: `staging.api.${BASE}`, parent: `api.${BASE}`, exists: true, owners: [ME] },
    { name: `web.${BASE}`, parent: BASE, exists: true, owners: [ME] },
    { name: 'bildanalyse.projects.dhbw.cloud', exists: true, owners: [ME] },
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

const row = (label) => screen.getAllByRole('treeitem').find(r => r.querySelector('p')?.textContent === label);
const heading = () => screen.findByRole('heading', { level: 3 });

describe('the zones page', () => {
    it('nests subzones under their zone with short labels and opens on the own base zone', async () => {
        const memory = renderAt('/');
        await screen.findByRole('tree');
        expect(screen.getAllByRole('treeitem').map(r => [r.querySelector('p').textContent, r.getAttribute('aria-level')])).toEqual([
            ['wi24a.lehre.dhbw.cloud', '1'], [BASE, '1'], ['api', '2'], ['staging', '3'], ['web', '2'], ['bildanalyse.projects.dhbw.cloud', '1'],
        ]);
        await waitFor(() => expect(memory.history.at(-1)).toBe(`/zone/${BASE}`));
        expect(row(BASE).getAttribute('aria-selected')).toBe('true');
        expect((await heading()).textContent).toBe(BASE);
        // Shared: a small badge with the number of owners instead of the addresses; not yet active: a badge too.
        expect(within(row('api')).getByLabelText(i18n.t('dyndns.zoneList.sharedWith', { owners: `${ME}, tom@dhbw.de` })).textContent).toBe('2');
        expect(within(row('wi24a.lehre.dhbw.cloud')).getByText(i18n.t('dyndns.zoneList.inactive'))).toBeTruthy();
    });

    it('shows the zone clicked in the tree and keeps it in the URL', async () => {
        const memory = renderAt(`/zone/${BASE}`);
        await heading();
        fireEvent.click(screen.getByText('staging'));
        await waitFor(() => expect(memory.history.at(-1)).toBe(`/zone/staging.api.${BASE}`));
        await waitFor(async () => expect((await heading()).textContent).toBe(`staging.api.${BASE}`));
        expect(calls).toContain(`staging.api.${BASE}`);
        expect(row('staging').getAttribute('aria-selected')).toBe('true');
    });

    it('a zone not yet active shows its name and the way to activate it', async () => {
        renderAt('/zone/wi24a.lehre.dhbw.cloud');
        expect((await heading()).textContent).toBe('wi24a.lehre.dhbw.cloud');
        expect(screen.getByRole('button', { name: i18n.t('dyndns.zoneDetail.activate') })).toBeTruthy();
    });

    it('offers a subzone in the row and in the header, and opens the dialog for that zone', async () => {
        renderAt(`/zone/${BASE}`);
        await heading();
        // Only zones that allow subzones have the row action.
        expect(screen.queryByRole('button', { name: i18n.t('dyndns.zoneList.addSubzone', { zone: `web.${BASE}` }) })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: i18n.t('dyndns.zoneList.addSubzone', { zone: `api.${BASE}` }) }));
        const dialog = await screen.findByRole('dialog');
        expect(dialog.textContent).toContain(`api.${BASE}`);
        fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('dyndns.actions.cancel') }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

        fireEvent.click(await screen.findByRole('button', { name: i18n.t('dyndns.subzone.title') }));
        expect((await screen.findByRole('dialog')).textContent).toContain(BASE);
    });

    it('filters the tree from six zones on, keeping the way down to a match', async () => {
        renderAt(`/zone/${BASE}`);
        await screen.findByRole('tree');
        fireEvent.change(screen.getByLabelText(i18n.t('dyndns.zoneList.filter')), { target: { value: 'stag' } });
        expect(screen.getAllByRole('treeitem').map(r => r.querySelector('p').textContent)).toEqual([BASE, 'api', 'staging']);
        fireEvent.change(screen.getByLabelText(i18n.t('dyndns.zoneList.filter')), { target: { value: 'nothing-like-it' } });
        expect(screen.getByText(i18n.t('dyndns.zoneList.noMatch'))).toBeTruthy();
    });

    it('opens the branch above a zone selected by link', async () => {
        localStorage.setItem('self-service.dyndns-zones.collapsed', JSON.stringify([BASE]));
        renderAt(`/zone/web.${BASE}`);
        await waitFor(() => expect(row('web')).toBeTruthy());
        expect(row(BASE).getAttribute('aria-expanded')).toBe('true');
    });
});
