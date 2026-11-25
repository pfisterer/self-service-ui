// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { fakeNodesApi, renderView } from '/test/render-harness.jsx';
import i18n from '/i18n/index.js';
import { formatDate } from '/format-date.js';

// Projects made of allocations (allocation_leaves, 25.11.2026): the split of a new project over budgets, the allocations on a project's card with one that expired, and a budget's table row of a project other budgets pay for too.

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
const { ProjectCard } = await import('/projects/card-project.jsx');
const { BudgetProjectsTable } = await import('/projects/component-budget-projects.jsx');

const t = (k, o) => i18n.t(k, o);
const RESOURCES = [
    { id: 'cores', name: 'Cores', default: 4, min: 1, max: 64 },
    { id: 'ram', name: 'RAM', unit: 'GB', default: 8, min: 1, max: 256 },
];

const budget = (id, name, extra = {}) => ({
    id, kind: 'budget', status: 'approved', name, parent_id: 'root', parent_path: [],
    limit: { cores: 32, ram: 128 }, usage: {}, eligible_requesters: ['group:students'], ...extra,
});
const GRUND = budget('b_grund', 'Grundversorgung', { auto_approve: { per_requester_limit: { cores: 2, ram: 4 } } });
const KURS = budget('b_kurs', 'Kurs DSKI');

let api;
beforeEach(() => {
    api = fakeNodesApi();
    globalThis.__testApi = api;
    const store = new Map();
    vi.stubGlobal('localStorage', { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear() });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

// The proposal of POST /v1/nodes/split for 4 cores and 8 GB: the basic budget grants its share at once, the course budget is asked for the rest.
function proposal(unplaced) {
    return {
        parts: [
            { budget_id: 'b_grund', budget_name: 'Grundversorgung', budget_path: [{ id: 'b_grund', name: 'Grundversorgung' }], limit: { cores: 2, ram: 4 }, auto_approved: { cores: 2, ram: 4 }, termination_date: '2027-03-31' },
            { budget_id: 'b_kurs', budget_name: 'Kurs DSKI', budget_path: [{ id: 'b_kurs', name: 'Kurs DSKI' }], limit: { cores: 2, ram: 4 }, auto_approved: {}, termination_date: '2027-03-31' },
        ],
        ...(unplaced ? { unplaced } : {}),
    };
}

function openNewProject() {
    return renderView(<ProjectFormModal opened onClose={() => {}} resources={RESOURCES} roles={['member', 'reader']}
        eligibleBudgets={[GRUND, KURS]} myBudgets={[]} />);
}

async function fillDetails() {
    fireEvent.change(screen.getByLabelText(new RegExp(t('projects.projectForm.name'))), { target: { value: 'Bildanalyse' } });
    fireEvent.change(screen.getByLabelText(new RegExp(t('projects.projectForm.purpose'))), { target: { value: 'Seminararbeit Bildanalyse' } });
}

describe('a new project split over budgets', () => {
    it('proposes the parts, lets the person choose when it starts and sends them as allocations', async () => {
        api.planSplit = vi.fn(async () => proposal());
        const created = [];
        api.createNode = vi.fn(async (body) => { created.push(body); return { id: 'p_new', kind: 'project', ...body }; });
        openNewProject();

        // Several budgets in reach: split automatically is the default.
        expect(await screen.findByText(t('projects.split.fundingSplitHint'))).toBeTruthy();
        await fillDetails();
        fireEvent.click(screen.getByRole('tab', { name: /Resources|Ressourcen/ }));

        const grund = await screen.findByTestId('split-part-b_grund', {}, { timeout: 2000 });
        expect(within(grund).getByText(t('projects.split.granted', { amount: '2 Cores · 4 GB RAM' }))).toBeTruthy();
        const kurs = screen.getByTestId('split-part-b_kurs');
        expect(within(kurs).getByText(/Kurs DSKI/)).toBeTruthy();
        expect(within(kurs).getByText(t('projects.split.waiting', { amount: '2 Cores · 4 GB RAM' }))).toBeTruthy();
        // Only the budgets that offer the project's kind are asked, by id.
        expect(api.planSplit).toHaveBeenCalledWith(expect.objectContaining({ budgetIds: ['b_grund', 'b_kurs'] }));

        fireEvent.click(screen.getByLabelText(t('projects.split.startAll')));
        fireEvent.click(screen.getByRole('button', { name: t('projects.forms.submitRequest') }));
        await waitFor(() => expect(created.length).toBe(1));
        expect(created[0]).toMatchObject({
            kind: 'project', name: 'Bildanalyse', start_when: 'all',
            allocations: [
                { budget_id: 'b_grund', limit: { cores: 2, ram: 4 }, termination_date: '2027-03-31' },
                { budget_id: 'b_kurs', limit: { cores: 2, ram: 4 }, termination_date: '2027-03-31' },
            ],
        });
        expect(created[0].parent_id).toBeUndefined();
    });

    it('blocks the request while some of it no budget takes, and a removed part leaves the split', async () => {
        api.planSplit = vi.fn(async () => proposal({ cores: 2 }));
        openNewProject();
        await fillDetails();
        fireEvent.click(screen.getByRole('tab', { name: /Resources|Ressourcen/ }));

        expect(await screen.findByText(t('projects.split.unplaced', { amount: '2 Cores' }), {}, { timeout: 2000 })).toBeTruthy();
        const submit = screen.getByRole('button', { name: /Request|Beantragen|Create|Anlegen|Anfragen/ });
        expect(submit.disabled).toBe(true);

        // Changed by hand, the parts are what is sent: removing one leaves the other.
        fireEvent.click(within(screen.getByTestId('split-part-b_kurs')).getByLabelText(t('projects.split.removePart')));
        expect(screen.queryByTestId('split-part-b_kurs')).toBeNull();
        expect(screen.getByText(t('projects.split.reset'))).toBeTruthy();
    });

    it('opened from one budget keeps the single-budget request', async () => {
        const created = [];
        api.createNode = vi.fn(async (body) => { created.push(body); return { id: 'p_new', kind: 'project', ...body }; });
        api.planSplit = vi.fn();
        renderView(<ProjectFormModal opened onClose={() => {}} resources={RESOURCES} roles={['member', 'reader']}
            eligibleBudgets={[GRUND, KURS]} myBudgets={[]} initialBudgetId="b_kurs" />);
        await screen.findByText(t('projects.split.fundingSingleHint'));
        await fillDetails();
        fireEvent.click(screen.getByRole('button', { name: t('projects.forms.submitRequest') }));
        await waitFor(() => expect(created.length).toBe(1));
        expect(created[0]).toMatchObject({ kind: 'project', parent_id: 'b_kurs' });
        expect(created[0].allocations).toBeUndefined();
        expect(api.planSplit).not.toHaveBeenCalled();
    });
});

// A project paid by two budgets, one of whose allocations ran out and is cut on its due day; the other has a change waiting.
const PROJECT = {
    id: 'p_dski', kind: 'project', status: 'approved', name: 'DSKI Projekt', parent_id: null, home_budget_id: 'b_grund',
    owner: 'user:owner@example.org', admin_scope: [], viewer_relation: 'owner',
    limit: { cores: 6, ram: 12 }, termination_date: '2027-03-31', created_at: '2026-10-01T10:00:00Z',
    allocations: [
        { id: 'a_grund', budget_id: 'b_grund', budget_name: 'Grundversorgung', budget_path: [{ id: 'b_ma', name: 'Mannheim' }, { id: 'b_grund', name: 'Grundversorgung' }], status: 'change_pending', limit: { cores: 2, ram: 4 }, pending: { limit: { cores: 4, ram: 4 } }, termination_date: '2027-03-31', home: true, revision: 2 },
        { id: 'a_kurs', budget_id: 'b_kurs', budget_name: 'Kurs DSKI', budget_path: [{ id: 'b_kurs', name: 'Kurs DSKI' }], status: 'approved', limit: { cores: 4, ram: 8 }, termination_date: '2026-11-01', revision: 5,
          expired: { at: '2026-11-01', cause: 'ended', due: '2026-11-15' } },
        { id: 'a_old', budget_id: 'b_old', budget_name: 'Altes Budget', status: 'ended', limit: { cores: 8 }, revision: 1 },
    ],
};

describe('the allocations on a project card', () => {
    it('lists each paying budget with its amounts and marks the expired one', async () => {
        const onAction = vi.fn();
        renderView(<ProjectCard node={PROJECT} resources={RESOURCES} perspective="owner" onAction={onAction} />);

        const kurs = await screen.findByTestId('allocation-a_kurs');
        expect(within(kurs).getByText('Kurs DSKI')).toBeTruthy();
        expect(within(kurs).getByText('4 Cores · 8 GB RAM')).toBeTruthy();
        expect(within(kurs).getByText(t('projects.allocation.expiredDue', { at: formatDate('2026-11-01'), due: formatDate('2026-11-15') }))).toBeTruthy();
        const grund = screen.getByTestId('allocation-a_grund');
        expect(within(grund).getByText(t('projects.allocation.status.change_pending'))).toBeTruthy();
        // An allocation that no longer pays is not part of the card.
        expect(screen.queryByText('Altes Budget')).toBeNull();

        // The holder changes or gives back each of them, and asks another budget for more.
        fireEvent.click(within(kurs).getByLabelText(t('projects.allocation.giveBack')));
        expect(onAction).toHaveBeenLastCalledWith('allocation-end', expect.objectContaining({ id: 'a_kurs', kind: 'allocation', parent_id: 'b_kurs' }));
        fireEvent.click(screen.getByText(t('projects.allocation.addOther')));
        expect(onAction).toHaveBeenLastCalledWith('allocations', PROJECT, 'add');
    });

    it('lets a budget’s manager act on their own allocation only', async () => {
        const onAction = vi.fn();
        renderView(<ProjectCard node={PROJECT} resources={RESOURCES} perspective="manager" managedIds={new Set(['b_ma'])} focusId="a_grund" onAction={onAction} />);
        const grund = await screen.findByTestId('allocation-a_grund');
        const kurs = screen.getByTestId('allocation-a_kurs');
        expect(within(grund).getByLabelText(t('projects.actions.decide'))).toBeTruthy();
        expect(within(kurs).queryByLabelText(t('projects.allocation.withdraw'))).toBeNull();
        // The card's decision is on the waiting allocation of their budget, with its revision.
        const button = screen.getAllByRole('button', { name: new RegExp(t('projects.actions.decide')) }).find(b => b.textContent.includes(t('projects.actions.decide')));
        fireEvent.click(button);
        expect(onAction).toHaveBeenLastCalledWith('decide', expect.objectContaining({ id: 'a_grund', revision: 2, status: 'change_pending' }));
    });
});

describe('a budget’s table row of a co-funded project', () => {
    it('shows what this budget pays, that others pay too, and offers the allocation’s actions', async () => {
        const row = {
            id: 'a_kurs', kind: 'allocation', status: 'approved', name: 'DSKI Projekt', parent_id: 'b_kurs', project_id: 'p_dski', owner: PROJECT.owner,
            limit: { cores: 4, ram: 8 }, termination_date: '2026-11-01', revision: 5, expired: PROJECT.allocations[1].expired,
            project: { ...PROJECT, bindings: { openstack: { external_id: 'os-1', in_use: { cores: 5, ram: 7 } } } },
        };
        api.listChildren = async () => ({ items: [row], total: 1 });
        const onAction = vi.fn();
        const onOpen = vi.fn();
        renderView(<BudgetProjectsTable budget={KURS} resources={RESOURCES} onAction={onAction} onOpen={onOpen} />, { config: { resources: RESOURCES } });

        const tr = (await screen.findByText('DSKI Projekt')).closest('tr');
        expect(within(tr).getByText(t('projects.budgetProjects.coFunded', { count: 1 }))).toBeTruthy();
        expect(within(tr).getByText(t('projects.allocation.expiredBadge'))).toBeTruthy();
        expect(within(tr).getByText('owner@example.org')).toBeTruthy();
        // In use is the project's (5 cores), granted what this budget pays (4), not the project's 6.
        expect(within(tr).getByText('5')).toBeTruthy();
        expect(within(tr).getByText('4')).toBeTruthy();
        expect(within(tr).queryByText('6')).toBeNull();

        // Withdrawing this budget's part, not releasing the whole project another budget pays for too.
        expect(within(tr).queryByLabelText(t('projects.actions.release'))).toBeNull();
        fireEvent.click(within(tr).getByLabelText(t('projects.allocation.withdraw')));
        expect(onAction).toHaveBeenLastCalledWith('allocation-end', row, undefined);
        fireEvent.click(within(tr).getByLabelText(t('projects.allocation.change')));
        expect(onAction).toHaveBeenLastCalledWith('allocations', row.project, 'a_kurs');

        fireEvent.click(tr);
        expect(onOpen).toHaveBeenCalledWith(row.project);
    });
});
