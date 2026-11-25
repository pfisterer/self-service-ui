// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderView } from '/test/render-harness.jsx';
import i18n from '/i18n/index.js';

// Raising a budget from the project dialog: a manager whose change does not fit the project's budget gets that budget's dialog on top, prefilled, and comes back to the project as they left it.

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

const RESOURCES = [
    { id: 'cores', name: 'Cores', default: 4, min: 1, max: 64 },
    { id: 'ram', name: 'RAM', unit: 'GB', default: 8, min: 1, max: 256 },
];

const budget = (id, parentId, name, limit, used, path) => ({
    id, parent_id: parentId, kind: 'budget', status: 'approved', name, limit,
    admin_scope: [`user:${id}@x`], usage: { approved: { limit: used } },
    parent_name: path.length ? path[path.length - 1].name : (parentId ? 'Root' : ''), parent_path: path,
    created_at: '2026-08-01T10:00:00Z', child_count: 1,
});

// root → dept (managed by the viewer) → course (10 cores, 8 of them taken) → the project with 2.
function tree() {
    return {
        b_root: budget('b_root', null, 'Root', { cores: 100, ram: 400 }, { cores: 30, ram: 40 }, []),
        b_dept: budget('b_dept', 'b_root', 'Dept', { cores: 32, ram: 128 }, { cores: 12, ram: 20 }, []),
        b_course: budget('b_course', 'b_dept', 'Course', { cores: 10, ram: 40 }, { cores: 8, ram: 8 }, [{ id: 'b_dept', name: 'Dept' }]),
    };
}

// Paid by Course alone (allocation_leaves): the project is not in the tree, its one allocation names the budget.
const project = {
    id: 'p_1', parent_id: null, funding_budget_ids: ['b_course'], kind: 'project', status: 'approved', name: 'Vorlesung',
    limit: { cores: 2, ram: 4 }, owner: 'user:stud@x', termination_date: '2027-03-31',
    allocations: [{ id: 'a_1', budget_id: 'b_course', budget_name: 'Course', budget_path: [{ id: 'b_dept', name: 'Dept' }, { id: 'b_course', name: 'Course' }], status: 'approved', limit: { cores: 2, ram: 4 }, termination_date: '2027-03-31', revision: 3 }],
    authorized_users: [{ token: 'user:someone@dhbw.de', role: 'member' }], history: [], created_at: '2026-08-02T10:00:00Z',
};

let nodes;
let api;
beforeEach(() => {
    nodes = tree();
    api = {
        // The root is out of the viewer's sight.
        getNode: vi.fn(async (id) => {
            if (id === 'b_root') throw Object.assign(new Error('forbidden'), { status: 403 });
            return structuredClone(nodes[id]);
        }),
        updateNode: vi.fn(async (id, body) => {
            nodes[id] = { ...nodes[id], ...body };
            return nodes[id];
        }),
        requestChange: vi.fn(async () => ({})),
        searchIdentities: async () => [],
        searchPrincipals: async () => [],
        searchPrincipalDetails: async () => [],
    };
    globalThis.__testApi = api;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const t = (k, o) => i18n.t(k, o);
const raiseLabel = () => t('projects.projectForm.raise.button', { name: 'Course', amount: '2 Cores' });

function open(myBudgets, extra = {}) {
    return renderView(<ProjectFormModal opened onClose={() => {}} resources={RESOURCES} roles={['member', 'reader']}
        node={project} myBudgets={myBudgets} {...extra} />);
}

async function askForSixCores() {
    fireEvent.click(screen.getByRole('tab', { name: /Resources|Ressourcen/ }));
    fireEvent.change(screen.getByLabelText(/Cores/), { target: { value: '6' } });
}

describe('raising a budget from the project dialog', () => {
    it('offers the raise to a manager above the budget, opens the budget prefilled on its resources tab and comes back to the project as left', async () => {
        const onBudgetChanged = vi.fn();
        open([nodes.b_dept], { onBudgetChanged });
        await askForSixCores();
        // On the resources tab and beside the note.
        await waitFor(() => expect(screen.getAllByRole('button', { name: raiseLabel() })).toHaveLength(2));
        expect(screen.getByText(t('projects.projectForm.outcomeRefusedChange'), { exact: false })).toBeTruthy();
        expect(screen.getByText(t('projects.projectForm.raise.aboveUnknown'))).toBeTruthy();
        // Entered on another tab, to be kept.
        fireEvent.click(screen.getByRole('tab', { name: /Details/ }));
        fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'Vorlesung WS' } });

        fireEvent.click(screen.getAllByRole('button', { name: raiseLabel() })[0]);
        const dialog = await screen.findByRole('dialog', { name: t('projects.inspect.titleBudget', { name: 'Course' }) });
        expect(within(dialog).getByText(t('projects.budgetForm.raisedFor', { amount: '2 Cores', project: 'Vorlesung WS' }))).toBeTruthy();
        // 10 + 2, on the resources tab.
        expect(within(dialog).getByRole('tab', { name: /Resources|Ressourcen/ }).getAttribute('aria-selected')).toBe('true');
        expect(within(dialog).getByLabelText(/Cores/).value).toBe('12');

        fireEvent.click(within(dialog).getAllByRole('button').find(b => b.type === 'submit'));
        await waitFor(() => expect(api.updateNode).toHaveBeenCalledWith('b_course', { limit: { cores: 12, ram: 40 } }));
        // Only the budget is saved, not the project behind it.
        expect(api.requestChange).not.toHaveBeenCalled();
        await waitFor(() => expect(onBudgetChanged).toHaveBeenCalled());
        await waitFor(() => expect(screen.queryByRole('dialog', { name: t('projects.inspect.titleBudget', { name: 'Course' }) })).toBeNull());

        // Back in the project: the entries are kept, the budget has room now.
        await waitFor(() => expect(screen.queryAllByRole('button', { name: raiseLabel() })).toHaveLength(0));
        expect(screen.getByText(t('projects.projectForm.outcomeDirectChange'))).toBeTruthy();
        expect(screen.getByLabelText(/Name/).value).toBe('Vorlesung WS');
        fireEvent.click(screen.getByRole('tab', { name: /Resources|Ressourcen/ }));
        expect(screen.getByLabelText(/Cores/).value).toBe('6');
    });

    it('tells someone who manages only the budget itself who can raise it', async () => {
        open([nodes.b_course]);
        await askForSixCores();
        expect(await screen.findByText(t('projects.projectForm.raise.notManager', { parent: 'Dept' }))).toBeTruthy();
        expect(screen.queryByRole('button', { name: raiseLabel() })).toBeNull();
        // Their change would still apply at once — they manage the budget — were there room.
        expect(screen.getByText(t('projects.projectForm.outcomeRefusedChange'), { exact: false })).toBeTruthy();
    });

    it('closes only the budget dialog on Escape', async () => {
        const onClose = vi.fn();
        open([nodes.b_dept], { onClose });
        await askForSixCores();
        fireEvent.click((await screen.findAllByRole('button', { name: raiseLabel() }))[0]);
        const title = t('projects.inspect.titleBudget', { name: 'Course' });
        const dialog = await screen.findByRole('dialog', { name: title });
        // Both dialogs listen on the window; the key comes from the field in the budget's.
        fireEvent.keyDown(within(dialog).getByLabelText(/Cores/), { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog', { name: title })).toBeNull());
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByRole('dialog', { name: t('projects.inspect.titleProject', { name: 'Vorlesung' }) })).toBeTruthy();
    });

    it('a change by a manager above that fits says it applies at once', async () => {
        open([nodes.b_dept]);
        fireEvent.click(screen.getByRole('tab', { name: /Resources|Ressourcen/ }));
        fireEvent.change(screen.getByLabelText(/Cores/), { target: { value: '3' } });
        expect(await screen.findByText(t('projects.projectForm.outcomeDirectChange'))).toBeTruthy();
        expect(screen.queryByText(t('projects.projectForm.outcomeWaitingChange'))).toBeNull();
    });
});
