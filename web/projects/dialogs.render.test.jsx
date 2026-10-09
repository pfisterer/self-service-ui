// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { fakeNodesApi, fixtureTree, renderView } from '/test/render-harness.jsx';

// Does each of the node dialogs open, with the data that reaches its branches?
// The same question as views.render.test.jsx, for the dialogs that took over
// what used to be separate ones: moving, handing over and allocations inside
// the project dialog, approving and rejecting in one decision dialog.

vi.mock('/projects/api-nodes.jsx', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, useNodesApi: () => globalThis.__testApi };
});
vi.mock('/projects/token-labels.jsx', () => ({
    useTokenLabels: () => ({}),
    tokenDisplay: (t) => t,
    tokenEmail: (t) => String(t).replace(/^user:/, ''),
    TokenLabelProvider: ({ children }) => children,
}));

const { ProjectFormModal } = await import('/projects/modal-project-form.jsx');
const { BudgetFormModal } = await import('/projects/modal-budget-form.jsx');
const { DecisionModal } = await import('/projects/modal-decide.jsx');
const { NodeInspectModal } = await import('/projects/modal-inspect.jsx');

const RESOURCES = [
    { id: 'cores', name: 'Cores', default: 4, min: 1, max: 64 },
    { id: 'ram', name: 'RAM', unit: 'GB', default: 8, min: 1, max: 256 },
];

let consoleErrors = [];
beforeEach(() => {
    const tree = fixtureTree();
    const api = fakeNodesApi(tree);
    // A budget above the project's own that may allocate to it.
    api.listAllocationSources = async () => [tree.roots[0]];
    globalThis.__testApi = api;
    consoleErrors = [];
    vi.spyOn(console, 'error').mockImplementation((...args) => { consoleErrors.push(args.join(' ')); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const fatal = () => consoleErrors.filter(e => /Error|Warning: Maximum|is not defined|Cannot read/.test(e));

function project(extra = {}) {
    const p = fixtureTree().children.b_ma.items[0];
    return {
        ...p, parent_name: 'Mannheim', parent_path: [{ id: 'b_ma', name: 'Mannheim' }],
        allocations: [{ budget_id: 'b_root', budget_name: 'Organization Root', limit: { cores: 2 }, granted_by: 'x@y', granted_at: '2026-08-01T10:00:00Z', reason: 'GPU work' }],
        external_group_assignments: [{ group_id: 'g1', group_name: 'fakultaet-wi', role: 'member' }],
        ...extra,
    };
}

describe('node dialogs', () => {
    it('the project dialog of a manager holds owner, budget and allocations', async () => {
        const tree = fixtureTree();
        renderView(<ProjectFormModal opened onClose={() => {}} resources={RESOURCES} openstackRoles={['member', 'reader']}
            node={project()} myBudgets={[tree.roots[0], tree.children.b_root.items[0]]}
            asManager moveTargets={[tree.roots[0], tree.children.b_root.items[0]]} />);

        expect(await screen.findAllByText(/Mannheim/)).not.toHaveLength(0);
        fireEvent.click(screen.getByRole('tab', { name: /Resources|Ressourcen/ }));
        expect(await screen.findAllByText('Organization Root')).not.toHaveLength(0);
        fireEvent.click(screen.getByRole('tab', { name: /Members|Mitglieder/ }));
        expect(await screen.findByText('fakultaet-wi')).toBeTruthy();
        expect(fatal()).toEqual([]);
    });

    it('the decision dialog shows a proposed change', async () => {
        const changing = fixtureTree().children.b_ma.items[1];
        renderView(<DecisionModal opened onClose={() => {}} resources={RESOURCES} node={changing} />);
        expect(await screen.findAllByRole('button', { name: /Approve|Genehmigen/ })).not.toHaveLength(0);
        expect(screen.getAllByRole('button', { name: /Reject|Ablehnen/ })).not.toHaveLength(0);
        expect(fatal()).toEqual([]);
    });

    it('the budget dialog in edit mode offers its parent', async () => {
        const tree = fixtureTree();
        const ma = { ...tree.children.b_root.items[0], parent_name: 'Organization Root', parent_path: [] };
        renderView(<BudgetFormModal opened onClose={() => {}} resources={RESOURCES} mode="edit"
            node={ma} parent={tree.roots[0]} moveTargets={[tree.roots[0]]} />);
        expect(await screen.findAllByText('Organization Root')).not.toHaveLength(0);
        expect(fatal()).toEqual([]);
    });

    it('the read-only dialog shows the same tabs', async () => {
        renderView(<NodeInspectModal opened onClose={() => {}} resources={RESOURCES} node={project({ status: 'archived' })} />);
        expect(await screen.findAllByRole('tab')).not.toHaveLength(0);
        fireEvent.click(screen.getByRole('tab', { name: /Members|Mitglieder/ }));
        expect(await screen.findByText('fakultaet-wi')).toBeTruthy();
        expect(fatal()).toEqual([]);
    });
});
