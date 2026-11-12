// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { renderView } from '/test/render-harness.jsx';
import i18n from '/i18n/index.js';

// The zones page as tree and detail: the zones under a heading per domain they were given out of (zone_soa: users.dhbw.site, dhbw.site, dhbw.cloud), below it a tree by the zone hierarchy, a root by its name below the heading and a subzone by its name below the zone above, one line each; own and shared together, shared a small sign on the root, zones not created yet dimmed after the others. A click on a zone shows it on the right and puts it in the URL, a zone that allows subzones offers one in its row and in its header, and from six zones on a filter stands above the tree.

vi.mock('/dyndns/api-zones.jsx', () => ({ useZonesApi: () => globalThis.__zonesApi }));

const ME = 'dennis.pfisterer@dhbw.de';
const THREE = [ME, 'a@dhbw.de', 'b@dhbw.de'];
// The user's real zones as the API lists them: personal ones alone, two shared trees with three owners each, and one zone not created yet under dhbw.cloud.
const BASE = 'dennis-pfisterer-at-dhbw-de.users.dhbw.site';
const sub = (label, parent, extra = {}) => ({ name: `${label}.${parent}`, parent, exists: true, owners: [ME], ...extra });
const ZONES = [
    { name: BASE, zone_soa: 'users.dhbw.site', exists: true, owners: [ME], allow_subdomains: true },
    { name: 'test.pfisterer.users.dhbw.site', zone_soa: 'users.dhbw.site', exists: true, owners: [ME] },
    { name: 'bigdata.pfisterer.users.dhbw.site', zone_soa: 'users.dhbw.site', exists: true, owners: [ME], allow_subdomains: true },
    { name: 'wi-ma.dhbw.site', zone_soa: 'dhbw.site', exists: true, owners: THREE, allow_subdomains: true },
    { name: 'services.dhbw.cloud', zone_soa: 'dhbw.cloud', exists: true, owners: THREE, allow_subdomains: true },
    { name: 'some-project.dhbw.cloud', zone_soa: 'dhbw.cloud', exists: false, can_join: false, allow_subdomains: true },
    sub('data-eng-wdski24a', BASE, { allow_subdomains: true }),
    sub('gridflex', BASE),
    sub('iot', BASE),
    sub('ws2627', 'bigdata.pfisterer.users.dhbw.site'),
    sub('crm', 'wi-ma.dhbw.site', { owners: THREE }),
    ...['gpu', 'itlabs', 'llm', 'mail', 'workflow-auth'].map(l => sub(l, 'services.dhbw.cloud', { owners: THREE })),
    sub('staging', 'gpu.services.dhbw.cloud', { owners: THREE }),
    sub('staging', 'llm.services.dhbw.cloud', { owners: THREE }),
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

// A row as [label, second text, level]: the row's first <p> and its next (none: no counts, no signs but the shared one).
const rows = () => screen.getAllByRole('treeitem').map(r => {
    const [label, second] = r.querySelectorAll('p');
    return [label.textContent, second?.textContent ?? '', r.getAttribute('aria-level')];
});
const row = (label, level) => screen.getAllByRole('treeitem').find(r => r.querySelector('p')?.textContent === label && (!level || r.getAttribute('aria-level') === String(level)));
const heading = () => screen.findByRole('heading', { level: 3 });

const REAL_ROWS = [
    ['users.dhbw.site', '', '1'],
    ['dennis-pfisterer-at-dhbw-de', '', '2'], ['data-eng-wdski24a', '', '3'], ['gridflex', '', '3'], ['iot', '', '3'],
    ['bigdata.pfisterer', '', '2'], ['ws2627', '', '3'],
    ['test.pfisterer', '', '2'],
    ['dhbw.site', '', '1'],
    ['wi-ma', '', '2'], ['crm', '', '3'],
    ['dhbw.cloud', '', '1'],
    ['services', '', '2'], ['gpu', '', '3'], ['staging', '', '4'], ['itlabs', '', '3'], ['llm', '', '3'], ['staging', '', '4'], ['mail', '', '3'], ['workflow-auth', '', '3'],
    ['some-project', '', '2'],
];

describe('the zones page', () => {
    it('a person with one zone sees its heading and the zone, selected', async () => {
        globalThis.__zones = [{ name: 'lea-muster.users.dhbw.site', zone_soa: 'users.dhbw.site', exists: true, owners: [ME], allow_subdomains: true }];
        const memory = renderAt('/');
        await screen.findByRole('tree');
        // The heading stays: it says what the rest of the name is.
        expect(rows()).toEqual([['users.dhbw.site', '', '1'], ['lea-muster', '', '2']]);
        await waitFor(() => expect(memory.history.at(-1)).toBe('/zone/lea-muster.users.dhbw.site'));
        expect(row('lea-muster').getAttribute('aria-selected')).toBe('true');
        expect((await heading()).textContent).toBe('lea-muster.users.dhbw.site');
        // No filter for a single zone.
        expect(screen.queryByLabelText(i18n.t('dyndns.zoneList.filter'))).toBeNull();
    });

    it('puts the real list under the domains the zones were given out of, own and shared together, and opens on the own personal zone', async () => {
        const memory = renderAt('/');
        await screen.findByRole('tree');
        expect(rows()).toEqual(REAL_ROWS);
        await waitFor(() => expect(memory.history.at(-1)).toBe(`/zone/${BASE}`));
        expect(row('dennis-pfisterer-at-dhbw-de').getAttribute('aria-selected')).toBe('true');
        expect((await heading()).textContent).toBe(BASE);
        // Headings are never selected and open and close on a click.
        expect(row('dhbw.site').hasAttribute('aria-selected')).toBe(false);
        fireEvent.click(row('dhbw.site').querySelector('p'));
        expect(rows().map(r => r[0]).slice(8, 10)).toEqual(['dhbw.site', 'dhbw.cloud']);
        expect(memory.history.at(-1)).toBe(`/zone/${BASE}`);
        // Not created yet: only dimmed, said in words to a screen reader, no sign.
        expect(within(row('some-project')).getByText(i18n.t('dyndns.zoneList.inactive'))).toBeTruthy();
        expect(within(row('some-project')).queryByRole('img')).toBeNull();
        // Shared: a small sign without a number on the root zone, the owners as its label, not again on its subzones.
        expect(within(row('services')).getByRole('img', { name: i18n.t('dyndns.zoneList.sharedWith', { owners: THREE.join(', ') }) }).textContent).toBe('');
        expect(within(row('gpu')).queryByRole('img')).toBeNull();
        expect(within(row('iot')).queryByRole('img')).toBeNull();
        expect(within(row('dennis-pfisterer-at-dhbw-de')).queryByRole('img')).toBeNull();
        // Guide lines join the subzones, not the roots or the headings.
        expect(row('services').querySelector('.tree-line')).toBeNull();
        expect(row('dhbw.cloud').querySelector('.tree-line')).toBeNull();
        expect(row('workflow-auth').querySelector('.tree-line[data-last]')).toBeTruthy();
    });

    it('closes and opens a heading by its row, its arrow and the keyboard, remembered, also the heading of the selected zone', async () => {
        renderAt(`/zone/${BASE}`);
        await heading();
        const users = () => row('users.dhbw.site');
        fireEvent.click(users().querySelector('p'));
        expect(users().getAttribute('aria-expanded')).toBe('false');
        expect(row('dennis-pfisterer-at-dhbw-de')).toBeUndefined();
        expect(JSON.parse(localStorage.getItem('self-service.dyndns-zones.collapsed'))).toContain('heading:users.dhbw.site');
        fireEvent.click(within(users()).getByRole('button', { name: i18n.t('projects.tree.expand') }));
        expect(users().getAttribute('aria-expanded')).toBe('true');
        users().focus();
        fireEvent.keyDown(users(), { key: 'Enter' });
        expect(users().getAttribute('aria-expanded')).toBe('false');
        fireEvent.keyDown(users(), { key: ' ' });
        expect(users().getAttribute('aria-expanded')).toBe('true');
        // Other headings close the same way.
        fireEvent.click(row('dhbw.site').querySelector('p'));
        expect(row('wi-ma')).toBeUndefined();
    });

    it('opens and closes everything with the button beside the filter', async () => {
        localStorage.setItem('self-service.dyndns-zones.collapsed', JSON.stringify(['zone:services.dhbw.cloud']));
        renderAt(`/zone/${BASE}`);
        await heading();
        fireEvent.click(screen.getByRole('button', { name: i18n.t('projects.tree.expandAll') }));
        expect(rows()).toEqual(REAL_ROWS);
        fireEvent.click(screen.getByRole('button', { name: i18n.t('projects.tree.collapseAll') }));
        expect(rows()).toEqual([['users.dhbw.site', '', '1'], ['dhbw.site', '', '1'], ['dhbw.cloud', '', '1']]);
        fireEvent.click(screen.getByRole('button', { name: i18n.t('projects.tree.expandAll') }));
        expect(rows()).toEqual(REAL_ROWS);
        // Not while the filter shows its matches.
        fireEvent.change(screen.getByLabelText(i18n.t('dyndns.zoneList.filter')), { target: { value: 'gpu' } });
        expect(screen.queryByRole('button', { name: i18n.t('projects.tree.collapseAll') })).toBeNull();
    });

    it('marks a subzone shared only where its owners differ from the zone above', async () => {
        globalThis.__zones = [...ZONES, sub('team', BASE, { owners: THREE })];
        renderAt(`/zone/${BASE}`);
        await screen.findByRole('tree');
        expect(within(row('team')).getByRole('img', { name: i18n.t('dyndns.zoneList.sharedWith', { owners: THREE.join(', ') }) })).toBeTruthy();
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

    it('a zone not created yet is selected by link and keeps the way to activate it', async () => {
        renderAt('/zone/some-project.dhbw.cloud');
        expect((await heading()).textContent).toBe('some-project.dhbw.cloud');
        await waitFor(() => expect(row('some-project').getAttribute('aria-selected')).toBe('true'));
        expect(screen.getByRole('button', { name: i18n.t('dyndns.zoneDetail.activate') })).toBeTruthy();
    });

    it('offers a subzone in the header of the zone, not in the tree', async () => {
        renderAt(`/zone/data-eng-wdski24a.${BASE}`);
        await heading();
        // The tree carries no actions: its only buttons open and close branches.
        const toggles = [i18n.t('projects.tree.collapse'), i18n.t('projects.tree.expand')];
        expect(within(screen.getByRole('tree')).getAllByRole('button').every(b => toggles.includes(b.getAttribute('aria-label')))).toBe(true);
        fireEvent.click(await screen.findByRole('button', { name: i18n.t('dyndns.subzone.title') }));
        expect((await screen.findByRole('dialog')).textContent).toContain(`data-eng-wdski24a.${BASE}`);
    });

    it('filters on the full name, showing matches with the zones above them under their open headings', async () => {
        localStorage.setItem('self-service.dyndns-zones.collapsed', JSON.stringify(['heading:dhbw.cloud']));
        renderAt(`/zone/${BASE}`);
        await screen.findByRole('tree');
        const box = screen.getByLabelText(i18n.t('dyndns.zoneList.filter'));
        fireEvent.change(box, { target: { value: 'staging.gpu' } });
        expect(rows()).toEqual([['dhbw.cloud', '', '1'], ['services', '', '2'], ['gpu', '', '3'], ['staging', '', '4']]);
        // The heading's part of the name matches too.
        fireEvent.change(box, { target: { value: 'wi-ma.dhbw' } });
        expect(rows()).toEqual([['dhbw.site', '', '1'], ['wi-ma', '', '2'], ['crm', '', '3']]);
        fireEvent.change(box, { target: { value: 'nothing-like-it' } });
        expect(screen.getByText(i18n.t('dyndns.zoneList.noMatch'))).toBeTruthy();
    });

    it('opens the zones and the heading above a zone selected by link', async () => {
        localStorage.setItem('self-service.dyndns-zones.collapsed', JSON.stringify(['heading:users.dhbw.site', 'zone:bigdata.pfisterer.users.dhbw.site', 'zone:services.dhbw.cloud', 'heading:dhbw.site']));
        renderAt('/zone/ws2627.bigdata.pfisterer.users.dhbw.site');
        await waitFor(() => expect(row('ws2627')).toBeTruthy());
        for (const label of ['users.dhbw.site', 'bigdata.pfisterer']) expect(row(label).getAttribute('aria-expanded')).toBe('true');
        // Other branches closed by hand stay closed.
        expect(row('services').getAttribute('aria-expanded')).toBe('false');
        expect(row('dhbw.site').getAttribute('aria-expanded')).toBe('false');
    });

    it('moves through headings and zones with the keyboard', async () => {
        renderAt(`/zone/${BASE}`);
        await heading();
        const base = row('dennis-pfisterer-at-dhbw-de');
        base.focus();
        fireEvent.keyDown(base, { key: 'ArrowLeft' });
        expect(document.activeElement.getAttribute('aria-expanded')).toBe('false');
        fireEvent.keyDown(document.activeElement, { key: 'ArrowRight' });
        fireEvent.keyDown(document.activeElement, { key: 'ArrowLeft' });
        fireEvent.keyDown(document.activeElement, { key: 'ArrowLeft' });
        expect(document.activeElement).toBe(row('users.dhbw.site'));
        fireEvent.keyDown(document.activeElement, { key: 'End' });
        expect(document.activeElement).toBe(row('some-project'));
    });
});
