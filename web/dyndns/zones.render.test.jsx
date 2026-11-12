// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { renderView } from '/test/render-harness.jsx';
import i18n from '/i18n/index.js';

// The zones page as tree and detail: the zones in sections (mine, shared, available and not created yet, the last closed at first), in each a tree by the zone hierarchy with two-line root rows (first label bold, the rest below) and subzones by their own label; with zones in only one section there are no headers. A click on a zone shows it on the right and puts it in the URL, a zone that allows subzones offers one in its row and in its header, and from six zones on a filter stands above the tree.

vi.mock('/dyndns/api-zones.jsx', () => ({ useZonesApi: () => globalThis.__zonesApi }));

const ME = 'dennis.pfisterer@dhbw.de';
const THREE = [ME, 'a@dhbw.de', 'b@dhbw.de'];
// The user's real zones: personal ones alone, two shared trees with three owners each, and one zone not created yet.
const BASE = 'dennis-pfisterer-at-dhbw-de.users.dhbw.site';
const sub = (label, parent, extra = {}) => ({ name: `${label}.${parent}`, parent, exists: true, owners: [ME], ...extra });
const ZONES = [
    { name: BASE, exists: true, owners: [ME], allow_subdomains: true },
    sub('data-eng-wdski24a', BASE, { allow_subdomains: true }),
    sub('gridflex', BASE),
    sub('iot', BASE),
    { name: 'test.pfisterer.users.dhbw.site', exists: true, owners: [ME] },
    { name: 'bigdata.pfisterer.users.dhbw.site', exists: true, owners: [ME], allow_subdomains: true },
    sub('ws2627', 'bigdata.pfisterer.users.dhbw.site'),
    { name: 'wi-ma.dhbw.site', exists: true, owners: THREE, allow_subdomains: true },
    sub('crm', 'wi-ma.dhbw.site', { owners: THREE }),
    { name: 'services.dhbw.cloud', exists: true, owners: THREE, allow_subdomains: true },
    ...['gpu', 'itlabs', 'llm', 'mail', 'workflow-auth'].map(l => sub(l, 'services.dhbw.cloud', { owners: THREE })),
    sub('staging', 'gpu.services.dhbw.cloud', { owners: THREE }),
    sub('staging', 'llm.services.dhbw.cloud', { owners: THREE }),
    { name: 'wi24a.lehre.dhbw.cloud', exists: false, can_join: false },
];
const detail = (name) => ({ owners: (globalThis.__zones ?? ZONES).find(z => z.name === name)?.owners ?? [ME], creator: ME, zoneData: { zone: name, zone_keys: [] } });

let calls;
beforeEach(() => {
    calls = [];
    const store = new Map();
    vi.stubGlobal('localStorage', { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear() });
    globalThis.__zonesApi = {
        getMe: async () => ({ email: ME, super_admin: false }),
        listZones: async () => globalThis.__zones ?? ZONES,
        getZone: async (name) => { calls.push(name); return detail(name); },
        listZoneEvents: async () => [],
        listDnsRecords: async () => [],
        createZone: async () => ({}),
    };
});
afterEach(() => {
    cleanup();
    delete globalThis.__zones;
    vi.unstubAllGlobals();
});

const { DynDnsZones } = await import('/dyndns/zones.jsx');

function renderAt(path) {
    const memory = memoryLocation({ path, record: true });
    renderView(<Router hook={memory.hook}><DynDnsZones /></Router>);
    return memory;
}

// A row as [label, second line or count, level]: the row's first <p> and its next.
const rows = () => screen.getAllByRole('treeitem').map(r => {
    const [label, second] = r.querySelectorAll('p');
    return [label.textContent, second?.textContent ?? '', r.getAttribute('aria-level')];
});
const row = (label, level) => screen.getAllByRole('treeitem').find(r => r.querySelector('p')?.textContent === label && (!level || r.getAttribute('aria-level') === String(level)));
const heading = () => screen.findByRole('heading', { level: 3 });
const section = (key) => i18n.t(`dyndns.zoneList.sections.${key}`);

describe('the zones page', () => {
    it('a person with one zone sees just that zone, without headers, and it is selected', async () => {
        globalThis.__zones = [{ name: 'lea-muster.users.dhbw.site', exists: true, owners: [ME], allow_subdomains: true }];
        const memory = renderAt('/');
        await screen.findByRole('tree');
        expect(rows()).toEqual([['lea-muster', '.users.dhbw.site', '1']]);
        await waitFor(() => expect(memory.history.at(-1)).toBe('/zone/lea-muster.users.dhbw.site'));
        expect(row('lea-muster').getAttribute('aria-selected')).toBe('true');
        expect((await heading()).textContent).toBe('lea-muster.users.dhbw.site');
        // No filter for a single zone.
        expect(screen.queryByLabelText(i18n.t('dyndns.zoneList.filter'))).toBeNull();
    });

    it('a person with own zones and subzones only sees them without headers', async () => {
        globalThis.__zones = ZONES.slice(0, 4);
        renderAt('/');
        await screen.findByRole('tree');
        expect(rows()).toEqual([['dennis-pfisterer-at-dhbw-de', '.users.dhbw.site', '1'], ['data-eng-wdski24a', '', '2'], ['gridflex', '', '2'], ['iot', '', '2']]);
    });

    it('sorts the real list into sections, each a tree by the zone hierarchy, and opens on the own base zone', async () => {
        const memory = renderAt('/');
        await screen.findByRole('tree');
        expect(rows()).toEqual([
            [section('own'), '7', '1'],
            ['dennis-pfisterer-at-dhbw-de', '.users.dhbw.site', '2'], ['data-eng-wdski24a', '', '3'], ['gridflex', '', '3'], ['iot', '', '3'],
            ['test', '.pfisterer.users.dhbw.site', '2'],
            ['bigdata', '.pfisterer.users.dhbw.site', '2'], ['ws2627', '', '3'],
            [section('shared'), '10', '1'],
            ['wi-ma', '.dhbw.site', '2'], ['crm', '', '3'],
            ['services', '.dhbw.cloud', '2'], ['gpu', '', '3'], ['staging', '', '4'], ['itlabs', '', '3'], ['llm', '', '3'], ['staging', '', '4'], ['mail', '', '3'], ['workflow-auth', '', '3'],
            // Not created yet: closed at first.
            [section('available'), '1', '1'],
        ]);
        await waitFor(() => expect(memory.history.at(-1)).toBe(`/zone/${BASE}`));
        expect(row('dennis-pfisterer-at-dhbw-de').getAttribute('aria-selected')).toBe('true');
        expect((await heading()).textContent).toBe(BASE);
        // Headers carry their count, are never selected and open and close on a click.
        expect(row(section('shared')).textContent).toContain('10');
        expect(row(section('own')).hasAttribute('aria-selected')).toBe(false);
        fireEvent.click(row(section('available')).querySelector('p'));
        expect(rows().at(-1)).toEqual(['wi24a', '.lehre.dhbw.cloud', '2']);
        expect(within(row('wi24a')).getByRole('img', { name: i18n.t('dyndns.zoneList.inactive') })).toBeTruthy();
        expect(memory.history.at(-1)).toBe(`/zone/${BASE}`);
        // Shared: a small sign with the number of owners and who they are.
        expect(within(row('wi-ma')).getByLabelText(i18n.t('dyndns.zoneList.sharedWith', { owners: THREE.join(', ') })).textContent).toBe('3');
        expect(within(row('iot')).queryByRole('img')).toBeNull();
        // Guide lines join the subzones, not the roots.
        expect(row('wi-ma').querySelector('.tree-line')).toBeNull();
        expect(row('crm').querySelector('.tree-line[data-last]')).toBeTruthy();
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

    it('a zone not created yet opens its section by link and keeps the way to activate it', async () => {
        renderAt('/zone/wi24a.lehre.dhbw.cloud');
        expect((await heading()).textContent).toBe('wi24a.lehre.dhbw.cloud');
        await waitFor(() => expect(row('wi24a').getAttribute('aria-selected')).toBe('true'));
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

    it('filters on the full name, showing matches with the zones above them in their open sections', async () => {
        renderAt(`/zone/${BASE}`);
        await screen.findByRole('tree');
        const box = screen.getByLabelText(i18n.t('dyndns.zoneList.filter'));
        fireEvent.change(box, { target: { value: 'staging.gpu' } });
        expect(rows()).toEqual([[section('shared'), '10', '1'], ['services', '.dhbw.cloud', '2'], ['gpu', '', '3'], ['staging', '', '4']]);
        // A match in the closed section opens it.
        fireEvent.change(box, { target: { value: 'lehre' } });
        expect(rows()).toEqual([[section('available'), '1', '1'], ['wi24a', '.lehre.dhbw.cloud', '2']]);
        fireEvent.change(box, { target: { value: 'nothing-like-it' } });
        expect(screen.getByText(i18n.t('dyndns.zoneList.noMatch'))).toBeTruthy();
    });

    it('opens the zones and the section above a zone selected by link', async () => {
        localStorage.setItem('self-service.dyndns-zones.collapsed', JSON.stringify(['section:own', 'zone:bigdata.pfisterer.users.dhbw.site', 'zone:services.dhbw.cloud']));
        renderAt('/zone/ws2627.bigdata.pfisterer.users.dhbw.site');
        await waitFor(() => expect(row('ws2627')).toBeTruthy());
        for (const label of [section('own'), 'bigdata']) expect(row(label).getAttribute('aria-expanded')).toBe('true');
        // Other branches closed by hand stay closed.
        expect(row('services').getAttribute('aria-expanded')).toBe('false');
        expect(row(section('available')).getAttribute('aria-expanded')).toBe('false');
    });

    it('moves through headers and zones with the keyboard', async () => {
        renderAt(`/zone/${BASE}`);
        await heading();
        const base = row('dennis-pfisterer-at-dhbw-de');
        base.focus();
        fireEvent.keyDown(base, { key: 'ArrowLeft' });
        expect(document.activeElement).toBe(base);
        fireEvent.keyDown(base, { key: 'ArrowUp' });
        expect(document.activeElement).toBe(row(section('own')));
        fireEvent.keyDown(document.activeElement, { key: 'End' });
        fireEvent.keyDown(document.activeElement, { key: 'ArrowRight' });
        expect(row('wi24a')).toBeTruthy();
    });
});
