// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { fakeNodesApi, fixtureSkippedLevel, fixtureTree, renderView } from '/test/render-harness.jsx';
import i18n from '/i18n/index.js';

// Does each view render at all, with data in it?
//
// One question, asked once per view. Nothing here asserts layout or wording:
// that would freeze the markup and turn every design change into a test change,
// and it is not what went wrong. What went wrong, twice on 2026-08-25, is that
// a view could not render:
//
//   0.8.12-test.1  four files called formatDate() without importing it. ESLint
//                  saw it; nothing else did, and it was not run.
//   0.8.13-test.1  the tree's combine returned a Map, react-query handed back a
//                  new reference every render, Mantine's Tree re-initialised on
//                  each one and set state — "Maximum update depth exceeded".
//                  Lint, 81 unit tests and the build were all green.
//
// The second one is why these tests wait for real data instead of settling for
// an empty first paint: the loop needs a resolved query and a mounted Tree.
//
// Both were checked by putting the defect back and watching this file go red —
// a smoke test nobody has seen fail proves nothing. The first attempt did NOT
// catch the missing import, because the calls sit in the change-diff branch and
// the fixture had no pending change; that is why fixtureTree carries one now.
// The limit is worth stating plainly: this finds "the view cannot render", not
// "some branch of the view cannot render". ESLint is the tool for the second,
// and `make bump` now runs it.

vi.mock('/projects/api-nodes.jsx', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, useNodesApi: () => globalThis.__testApi };
});

// The cloud-status provider asks its own questions of the same API and is
// mounted above these views in the real app; here the views only read from it.
vi.mock('/projects/cloud-status.jsx', () => ({
    useCloudStatus: () => globalThis.__cloudStatus ?? { isRoot: true, pending: 0, hasBudgets: true, ready: true, refresh: () => {} },
    CloudStatusProvider: ({ children }) => children,
}));

// Token labels resolve group tokens to display names against the role provider.
vi.mock('/projects/token-labels.jsx', () => ({
    useTokenLabels: () => ({ labelFor: (t) => t, loading: false }),
    tokenDisplay: (t) => t,
    tokenEmail: (t) => String(t).replace(/^user:/, ''),
    TokenLabelProvider: ({ children }) => children,
}));

const { MyBudgetsView } = await import('/projects/view-my-budgets.jsx');
const { MyProjectsView } = await import('/projects/view-my-projects.jsx');
const { RootAdminView } = await import('/projects/root-admin-view.jsx');

// React reports a render loop by throwing, and jsdom prints the component stack
// through console.error. Both have to fail the test, or the very defect these
// tests exist for passes as noise in the output.
let consoleErrors = [];
beforeEach(() => {
    globalThis.__testApi = fakeNodesApi(fixtureTree());
    globalThis.__cloudStatus = undefined;
    consoleErrors = [];
    vi.spyOn(console, 'error').mockImplementation((...args) => { consoleErrors.push(args.join(' ')); });
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

function expectNoRenderFailure() {
    const fatal = consoleErrors.filter(e =>
        /Maximum update depth|is not defined|is not a function|Cannot read/.test(e));
    expect(fatal).toEqual([]);
}

describe('the cloud project views render', () => {
    it('My Budgets shows its tree, expanded down to a project', async () => {
        renderView(<MyBudgetsView />);

        // findAllByText, not findByText: a selected node is named twice on
        // purpose, once in the tree row and once in the detail panel.
        expect(await screen.findAllByText('Organization Root')).not.toHaveLength(0);
        // The first level opens itself, so the root's child arrives without a
        // click — and reaching it means the lazy children query ran.
        expect(await screen.findAllByText('Mannheim')).not.toHaveLength(0);
        expectNoRenderFailure();
    });

    // Projects are listed in a table under the selected budget, not in the
    // tree: a budget of student projects buried the budget structure.
    it('My Budgets lists a budget\'s projects in a table, not in the tree', async () => {
        renderView(<MyBudgetsView />);
        const tree = () => within(screen.getByRole('tree'));

        await screen.findAllByText('Mannheim');
        fireEvent.click(tree().getByText('Mannheim'));

        const table = await screen.findByRole('table');
        expect(await within(table).findByText('Mein Projekt')).toBeTruthy();
        expect(within(table).getByText('Projekt mit Änderung')).toBeTruthy();
        expect(tree().queryAllByText('Mein Projekt')).toHaveLength(0);
        expectNoRenderFailure();
    });

    // The loop did not fail the first paint — it failed the renders after the
    // queries resolved. A test that stops at "something appeared" would have
    // gone green on the broken build.
    it('My Budgets settles instead of re-rendering forever', async () => {
        renderView(<MyBudgetsView />);
        await screen.findAllByText('Mannheim');

        // Let the query cache and the tree controller run to a standstill.
        await new Promise(resolve => setTimeout(resolve, 250));
        await waitFor(() => expectNoRenderFailure());
    });

    // One node, one row. The duplicate was never two nodes: the view assembles
    // its tree from two independent sources — the entries it picks for the top
    // level, and the children of whatever is expanded — and a node that lands in
    // both is simply drawn twice. Counting rows inside the tree is the direct
    // question; the detail panel names the selected node too, so counting on the
    // whole document would count that as well.
    it('draws a budget once even when its parent is not one of mine', async () => {
        globalThis.__testApi = fakeNodesApi(fixtureSkippedLevel());
        renderView(<MyBudgetsView />);

        const tree = () => within(screen.getByRole('tree'));

        // The first level opens itself. WI-Budget is managed by this caller and
        // used to be listed here as a root of its own — this is the assertion
        // the bug failed.
        await screen.findAllByText('Mannheim');
        expect(tree().queryAllByText('WI-Budget')).toHaveLength(0);

        // Its real place, one level further down. Clicking the row expands it.
        fireEvent.click(tree().getByText('Mannheim'));

        await waitFor(() => expect(tree().getAllByText('WI-Budget')).toHaveLength(1));
        expect(tree().getAllByText('Organization Root')).toHaveLength(1);
        expectNoRenderFailure();
    });

    // With "expand everything" on, collapsing a branch dropped its children's
    // query, the tree data changed, and the expand-all pass opened the branch
    // again at once: nothing could be collapsed by hand any more.
    it('lets a branch be collapsed while everything is expanded', async () => {
        renderView(<MyBudgetsView />);
        const tree = () => within(screen.getByRole('tree'));

        await waitFor(() => expect(tree().getAllByText('Mannheim')).toHaveLength(1));
        fireEvent.click(screen.getByRole('button', { name: i18n.t('projects.budgets.expandAll') }));
        await screen.findByRole('button', { name: i18n.t('projects.budgets.collapseAll') });
        fireEvent.click(tree().getByText('Organization Root'));

        await waitFor(() => expect(tree().queryAllByText('Mannheim')).toHaveLength(0));
        await new Promise(resolve => setTimeout(resolve, 250));
        expect(tree().queryAllByText('Mannheim')).toHaveLength(0);
        expectNoRenderFailure();
    });

    // A requester who manages nothing still sees where their requests would
    // draw from: the eligible budget appears in the tree, read-only — no
    // manager actions, but requesting from it is offered.
    it('shows a requestable budget read-only when the user manages nothing', async () => {
        const api = fakeNodesApi(fixtureTree());
        api.listMyBudgets = async () => ({ items: [], total: 0 });
        api.listEligibleForMe = async () => ({
            items: [{
                id: 'b_src', kind: 'budget', status: 'approved', name: 'OneIT',
                child_count: 3, limit: { cores: 32, ram: 128 },
                admin_scope: ['user:boss@dhbw.de'],
                eligible_requesters: ['user:dennis.pfisterer@dhbw.de'],
                usage: { approved: { limit: { cores: 8, ram: 16 }, node_ids: [] } },
                created_at: '2026-08-01T10:00:00Z',
            }],
            total: 1,
        });
        globalThis.__testApi = api;
        renderView(<MyBudgetsView />);

        expect(await screen.findAllByText('OneIT')).not.toHaveLength(0);
        expect(screen.queryByRole('button', { name: /Edit/ })).toBeNull();
        expect(screen.getAllByRole('button', { name: i18n.t('projects.actions.requestBudget') }).length).toBeGreaterThan(0);
        expectNoRenderFailure();
    });

    // Somebody who may request sub-budgets but runs none of their own: the page starts with the way to a request and the requests made so far, pending ones included, whoever manages them now.
    it('starts with the sub-budget request and the own requests for a requester', async () => {
        globalThis.__cloudStatus = { isRoot: false, pending: 0, hasBudgets: true, canRequestBudgets: true, ready: true, refresh: () => {} };
        const api = fakeNodesApi(fixtureTree());
        const source = {
            id: 'b_src', kind: 'budget', status: 'approved', name: 'OneIT', parent_id: 'root',
            limit: { cores: 32, ram: 128 }, admin_scope: ['user:boss@dhbw.de'],
            eligible_requesters: ['user:dennis.pfisterer@dhbw.de'], allow_sub_budget_requests: true,
            auto_approve: {}, created_at: '2026-08-01T10:00:00Z',
        };
        api.listEligibleForMe = async () => ({ items: [source], total: 1 });
        api.listMyBudgets = async () => ({
            items: [{
                id: 'b_mine', kind: 'budget', status: 'pending', name: 'Mein Teilbudget', parent_id: 'b_src', parent_name: 'OneIT',
                limit: { cores: 4 }, admin_scope: ['user:dennis.pfisterer@dhbw.de'], created_by: 'Dennis.Pfisterer@dhbw.de',
                created_at: '2026-08-02T10:00:00Z',
            }],
            total: 1,
        });
        globalThis.__testApi = api;
        renderView(<MyBudgetsView />);

        expect(await screen.findByText(i18n.t('projects.budgets.myRequests'))).toBeDefined();
        expect(screen.getAllByText('Mein Teilbudget').length).toBeGreaterThan(0);
        expect(screen.getByText(i18n.t('projects.budgets.requestedFrom', { name: 'OneIT' }))).toBeDefined();
        expect(screen.getAllByRole('button', { name: i18n.t('projects.actions.requestBudget') })).toHaveLength(1);
        expect(screen.queryByText(i18n.t('projects.budgets.noneCanRequest'))).toBeNull();
        expectNoRenderFailure();
    });

    it('My Projects renders its cards', async () => {
        renderView(<MyProjectsView />);
        expect(await screen.findByText('Mein Projekt')).toBeDefined();
        expectNoRenderFailure();
    });

    it('My Projects shows a project the viewer is only a member of, read-only', async () => {
        const api = globalThis.__testApi;
        const listMine = api.listMine;
        api.listMine = async () => {
            const page = await listMine();
            const shared = { ...page.items[0], id: 'p_shared', name: 'Geteiltes Projekt', owner: 'user:someone@dhbw.de', admin_scope: [], viewer_relation: 'member', authorized_users: [{ token: 'user:dennis.pfisterer@dhbw.de', openstack_role: 'member' }] };
            return { items: [shared], total: 1 };
        };
        renderView(<MyProjectsView />);
        expect(await screen.findByText('Geteiltes Projekt')).toBeDefined();
        expect(screen.getByText(i18n.t('projects.projectCard.memberOf', { owner: 'someone@dhbw.de' }))).toBeDefined();
        expect(screen.queryByText(i18n.t('projects.actions.edit'))).toBeNull();
        expect(screen.queryByText(i18n.t('projects.actions.release'))).toBeNull();
        expect(screen.getByText(i18n.t('projects.actions.details'))).toBeDefined();
        expect(screen.queryByText(i18n.t('projects.myProjects.none'))).toBeNull();
        expectNoRenderFailure();
    });

    it('Root Admin renders', async () => {
        renderView(<RootAdminView />);
        await waitFor(() => expectNoRenderFailure());
    });
});
