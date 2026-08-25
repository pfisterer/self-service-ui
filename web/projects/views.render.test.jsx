// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { fakeNodesApi, fixtureSkippedLevel, fixtureTree, renderView } from '/test/render-harness.jsx';

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
    useCloudStatus: () => ({ isRoot: true, pending: 0, hasBudgets: true, ready: true, refresh: () => {} }),
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

    it('My Projects renders its cards', async () => {
        renderView(<MyProjectsView />);
        expect(await screen.findByText('Mein Projekt')).toBeDefined();
        expectNoRenderFailure();
    });

    it('Root Admin renders', async () => {
        renderView(<RootAdminView />);
        await waitFor(() => expectNoRenderFailure());
    });
});
