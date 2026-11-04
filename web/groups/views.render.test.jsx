// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderView } from '/test/render-harness.jsx';

// Does each groups view render at all, with data in it? Same question and reasoning as llm/views.render.test.jsx.

const ME = { actor: 'dekan@dhbw.de', admin: true, manages_any: true, may_act_as: true, relations: ['member', 'dozent'], source_name: 'ZWR' };

vi.mock('/groups/use-groups-me.jsx', () => ({
    useGroupsMe: () => ({ query: { isPending: false, isError: false }, me: ME, visible: true, isAdmin: true, relations: ME.relations, sourceName: 'ZWR' }),
}));
vi.mock('/groups/api-groups.jsx', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, useGroupsApi: () => globalThis.__groupsApi };
});

const GROUP = { id: 'wwi23seb', token: 'group:wwi23seb', display_name: 'Kurs WWI23SEB', description: 'Wirtschaftsinformatik', source_name: 'ZWR', relations: ['dozent'] };
const DETAIL = {
    group: GROUP,
    may_delete: true,
    memberships: [
        { member: 'user:anna@dhbw.de', relation: 'dozent', created_at: '2026-10-01T10:00:00Z' },
        { member: 'group:wwi23seb-kurs', relation: 'member', expires_at: '2027-03-31T21:59:59Z', created_at: '2026-10-01T10:00:00Z' },
        { member: 'user:alt@dhbw.de', relation: 'member', expires_at: '2026-09-30T21:59:59Z', expired: true, created_at: '2026-04-01T10:00:00Z' },
        { member: 'pattern:*@student.dhbw-mannheim.de', relation: 'member', created_at: '2026-10-01T10:00:00Z' },
    ],
    managers: [{ token: 'user:dekan@dhbw.de', created_by: 'root@dhbw.de', created_at: '2026-10-01T10:00:00Z' }],
};
const HISTORY = [
    { id: 'h3', group_id: 'wwi23seb', at: '2026-10-03T10:00:00Z', actor: 'dekan@dhbw.de', action: 'relation_changed', member: 'user:ben@dhbw.de', relation: 'dozent', detail: 'member' },
    { id: 'h2', group_id: 'wwi23seb', at: '2026-10-02T10:00:00Z', actor: 'root@dhbw.de', on_behalf_of: 'dekan@dhbw.de', action: 'member_added', member: 'user:anna@dhbw.de', relation: 'dozent', expires_at: '2027-03-31T21:59:59Z' },
    { id: 'h1', group_id: 'wwi23seb', at: '2026-10-01T10:00:00Z', actor: 'system', action: 'group_adopted', detail: 'taken over from source "dhbw-mannheim"' },
];

const DUALIS_TOP = [
    { id: 'dualis-standort-mannheim', token: 'group:dualis-standort-mannheim', display_name: 'dualis-standort-mannheim', description: 'DHBW Mannheim · alle Kurse · Studierende aus Dualis (Rolle studierende)', source_name: 'dualis', editable: false, child_groups: 1 },
];
const DUALIS_INSIDE = [
    { id: 'dualis-mannheim-fakultaet-technik', token: 'group:dualis-mannheim-fakultaet-technik', display_name: 'dualis-mannheim-fakultaet-technik', description: 'Fakultät Technik · DHBW Mannheim · Studierende aus Dualis (Rolle studierende)', source_name: 'dualis', editable: false, child_groups: 0 },
];
const DUALIS_DETAIL = {
    group: { ...DUALIS_INSIDE[0] },
    editable: false,
    may_delete: false,
    memberships: [{ member: 'group:dualis-orga-ma-t-mb', relation: 'studierende', created_at: '2026-11-04T10:00:00Z' }],
    managers: [],
};
const SOURCES = [
    { name: 'ZWR', type: 'local', local: true, groups: 1 },
    { name: 'dualis', type: 'csv', local: false, groups: 2, last_synced_at: '2026-11-04T13:30:00Z', last_sync_status: 'ok' },
];

const { GroupsList } = await import('/groups/list.jsx');
const { GroupDetail } = await import('/groups/detail.jsx');
const { GroupsBrowser } = await import('/groups/browser.jsx');

let consoleErrors = [];
let calls = [];
beforeEach(() => {
    calls = [];
    const store = new Map();
    vi.stubGlobal('localStorage', { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear() });
    globalThis.__groupsApi = {
        listGroups: async ({ source, parent, q } = {}) => {
            calls.push({ source, parent, q });
            if (parent === 'dualis-standort-mannheim') return { items: DUALIS_INSIDE, total: 1 };
            if (source === 'dualis') return { items: DUALIS_TOP, total: 1 };
            if (q) return { items: DUALIS_INSIDE, total: 1 };
            return { items: [{ ...GROUP, editable: true, child_groups: 0 }], total: 1 };
        },
        listSources: async () => SOURCES,
        getGroup: async (id) => (id.startsWith('dualis-') ? DUALIS_DETAIL : { ...DETAIL, editable: true }),
        effectiveMembers: async () => ['user:anna@dhbw.de', 'user:ben@dhbw.de'],
        history: async () => HISTORY,
        searchPrincipals: async () => [],
    };
    consoleErrors = [];
    vi.spyOn(console, 'error').mockImplementation((...args) => { consoleErrors.push(args.join(' ')); });
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function expectNoRenderFailure() {
    const fatal = consoleErrors.filter(e => /Maximum update depth|is not defined|is not a function|Cannot read/.test(e));
    expect(fatal).toEqual([]);
}

describe('the groups views render', () => {
    it('the list shows the groups and offers a new one to admins', async () => {
        renderView(<GroupsList />);
        expect(await screen.findByText('wwi23seb')).toBeTruthy();
        expect(screen.getByText('Kurs WWI23SEB')).toBeTruthy();
        expect(screen.getAllByRole('button', { name: /Gruppe anlegen|Create group/ }).length).toBe(1);
        expectNoRenderFailure();
    });

    it('a group shows its entries, the expired one marked', async () => {
        renderView(<GroupDetail params={{ id: 'wwi23seb' }} />);
        expect(await screen.findByText('anna@dhbw.de')).toBeTruthy();
        expect(screen.getByText(/abgelaufen am|expired on/)).toBeTruthy();
        expect(screen.getByText(/alle Adressen \*@student|all addresses \*@student/)).toBeTruthy();
        // The role is a choice in the row, one per entry.
        expect(screen.getAllByLabelText(/^(Rolle|Role)$/).length).toBeGreaterThanOrEqual(4);
        expectNoRenderFailure();
    });

    it('a group shows everyone it counts, its managers and its history', async () => {
        renderView(<GroupDetail params={{ id: 'wwi23seb' }} />);
        await screen.findByText('anna@dhbw.de');
        fireEvent.click(screen.getByRole('tab', { name: /Mitglieder insgesamt|All members/ }));
        expect(await screen.findByText('ben@dhbw.de')).toBeTruthy();
        fireEvent.click(screen.getByRole('tab', { name: /Verwaltung|Managers/ }));
        expect(await screen.findByText('dekan@dhbw.de')).toBeTruthy();
        fireEvent.click(screen.getByRole('tab', { name: /Verlauf|History/ }));
        expect(await screen.findByText(/(im Auftrag von|on behalf of) dekan@dhbw.de/)).toBeTruthy();
        expect(screen.getByText(/dhbw-mannheim/)).toBeTruthy();
        expect(screen.getByText(/ben@dhbw.de: (Rolle von Mitglied auf|role changed from Member to)/)).toBeTruthy();
        expectNoRenderFailure();
    });

    // Admins browse every source: the tree loads a branch when it opens, a group of a sync source is shown read-only, and a search lists matches flat.
    it('the browser shows every source as a tree and a Dualis group read-only', async () => {
        renderView(<GroupsBrowser params={{}} />);
        expect((await screen.findAllByText('dualis')).length).toBe(2);
        expect(screen.getByText(/Letzter Import|Last import/)).toBeTruthy();
        expect(calls.some(c => c.source === 'dualis')).toBe(false);

        fireEvent.click(screen.getAllByText('dualis')[0]);
        expect(await screen.findByText('dualis-standort-mannheim')).toBeTruthy();
        // The last arrow still closed is the Mannheim row's, below the opened source.
        fireEvent.click(screen.getAllByRole('button', { name: /Aufklappen|Expand/ }).at(-1));
        expect(await screen.findByText('dualis-mannheim-fakultaet-technik')).toBeTruthy();
        expect(screen.getByText('Fakultät Technik')).toBeTruthy();
        expectNoRenderFailure();
    });

    it('a group of a sync source has no forms and says where it is maintained', async () => {
        renderView(<GroupsBrowser params={{ id: 'dualis-mannheim-fakultaet-technik' }} />);
        expect(await screen.findByText(/(Quelle|source) dualis/)).toBeTruthy();
        expect(screen.queryByRole('button', { name: /^(Bearbeiten|Edit)$/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /^(Hinzufügen|Add)$/ })).toBeNull();
        expect(screen.queryByRole('button', { name: /^(Entfernen|Remove)$/ })).toBeNull();
        expect(screen.getByText('dualis-orga-ma-t-mb')).toBeTruthy();
        expectNoRenderFailure();
    });

    it('a search lists matches from every source', async () => {
        renderView(<GroupsBrowser params={{}} />);
        await screen.findAllByText('dualis');
        fireEvent.change(screen.getByLabelText(/Alle Quellen durchsuchen|Search all sources/), { target: { value: 'technik' } });
        expect(await screen.findByText('dualis-mannheim-fakultaet-technik')).toBeTruthy();
        expect(calls.some(c => c.q === 'technik')).toBe(true);
        expectNoRenderFailure();
    });
});
