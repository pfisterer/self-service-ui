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
    { id: 'h2', group_id: 'wwi23seb', at: '2026-10-02T10:00:00Z', actor: 'root@dhbw.de', on_behalf_of: 'dekan@dhbw.de', action: 'member_added', member: 'user:anna@dhbw.de', relation: 'dozent', expires_at: '2027-03-31T21:59:59Z' },
    { id: 'h1', group_id: 'wwi23seb', at: '2026-10-01T10:00:00Z', actor: 'system', action: 'group_adopted', detail: 'taken over from source "dhbw-mannheim"' },
];

const { GroupsList } = await import('/groups/list.jsx');
const { GroupDetail } = await import('/groups/detail.jsx');

let consoleErrors = [];
beforeEach(() => {
    globalThis.__groupsApi = {
        listGroups: async () => [GROUP],
        getGroup: async () => DETAIL,
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
        expectNoRenderFailure();
    });
});
