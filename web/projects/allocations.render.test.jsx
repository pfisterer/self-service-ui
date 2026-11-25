// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { fakeNodesApi, renderView } from '/test/render-harness.jsx';
import i18n from '/i18n/index.js';
import { formatDate } from '/format-date.js';

// Projects made of allocations (allocation_leaves, 25.11.2026, revised the same day): the split of a new project over budgets (all or nothing when waiting for everything), the allocations on a project's card with one whose budget has not agreed to the project's new end and one the project goes on without, the project's end changed for every paying budget, the allocation dialog (amounts and attributes, no end), and a budget's table row of a project other budgets pay for too.

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
const { AllocationModal } = await import('/projects/modal-allocation.jsx');

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

    it('waiting for everything is all or nothing: a part not granted whole at once waits whole', async () => {
        // The basic budget would grant 1 of the 2 cores at once.
        api.planSplit = vi.fn(async () => {
            const plan = proposal();
            plan.parts[0].auto_approved = { cores: 1, ram: 4 };
            return plan;
        });
        openNewProject();
        await fillDetails();
        fireEvent.click(screen.getByRole('tab', { name: /Resources|Ressourcen/ }));

        const grund = await screen.findByTestId('split-part-b_grund', {}, { timeout: 2000 });
        // Starting at once: the budget grants what its rules allow, the rest waits.
        expect(within(grund).getByText(t('projects.split.granted', { amount: '1 Cores · 4 GB RAM' }))).toBeTruthy();
        expect(within(grund).getByText(t('projects.split.waiting', { amount: '1 Cores' }))).toBeTruthy();

        fireEvent.click(screen.getByLabelText(t('projects.split.startAll')));
        expect(within(grund).queryByText(t('projects.split.granted', { amount: '1 Cores · 4 GB RAM' }))).toBeNull();
        expect(within(grund).getByText(t('projects.split.waiting', { amount: '2 Cores · 4 GB RAM' }))).toBeTruthy();
        expect(screen.getByText(t('projects.split.allOrNothing'))).toBeTruthy();
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

// A project paid by three budgets after it was asked to run until 30 June: the course budget agreed at once, the basic budget's managers have not decided yet (its extension waits), and the lab's allocation was left behind — it ends on its own date while the project goes on. The project ends at the earliest end of the others, 31 March.
const PROJECT = {
    id: 'p_dski', kind: 'project', status: 'approved', name: 'DSKI Projekt', parent_id: null, funding_budget_ids: ['b_grund', 'b_kurs', 'b_lab'],
    owner: 'user:owner@example.org', admin_scope: [], viewer_relation: 'owner', reason: 'Seminar Datenanalyse',
    limit: { cores: 7, ram: 14 }, termination_date: '2027-03-31', created_at: '2026-10-01T10:00:00Z',
    allocations: [
        { id: 'a_grund', budget_id: 'b_grund', budget_name: 'Grundversorgung', budget_path: [{ id: 'b_ma', name: 'Mannheim' }, { id: 'b_grund', name: 'Grundversorgung' }], status: 'change_pending', limit: { cores: 2, ram: 4 }, pending: { termination_date: '2027-06-30' }, termination_date: '2027-03-31', revision: 2, attributes: { kostenstelle: { nummer: '4711' } } },
        { id: 'a_kurs', budget_id: 'b_kurs', budget_name: 'Kurs DSKI', budget_path: [{ id: 'b_kurs', name: 'Kurs DSKI' }], status: 'approved', limit: { cores: 4, ram: 8 }, termination_date: '2027-06-30', revision: 5 },
        { id: 'a_lab', budget_id: 'b_lab', budget_name: 'Labor', budget_path: [{ id: 'b_lab', name: 'Labor' }], status: 'approved', limit: { cores: 1, ram: 2 }, termination_date: '2027-01-31', ends_alone: true, revision: 3 },
        { id: 'a_old', budget_id: 'b_old', budget_name: 'Altes Budget', status: 'ended', limit: { cores: 8 }, revision: 1 },
    ],
};

describe('the allocations on a project card', () => {
    it('lists each paying budget, offers to go on without one that ends earlier and marks one left behind', async () => {
        const onAction = vi.fn();
        renderView(<ProjectCard node={PROJECT} resources={RESOURCES} perspective="owner" onAction={onAction} />);

        const kurs = await screen.findByTestId('allocation-a_kurs');
        expect(within(kurs).getByText('Kurs DSKI')).toBeTruthy();
        expect(within(kurs).getByText('4 Cores · 8 GB RAM')).toBeTruthy();
        // The course runs longest: nothing to leave behind there.
        expect(within(kurs).queryByText(t('projects.allocation.endAlone'))).toBeNull();
        const grund = screen.getByTestId('allocation-a_grund');
        expect(within(grund).getByText(t('projects.allocation.status.change_pending'))).toBeTruthy();
        expect(within(grund).getByText(t('projects.allocation.changeWaiting', { what: t('projects.allocation.until', { date: formatDate('2027-06-30') }) }))).toBeTruthy();
        // Its budget has not agreed to the new end yet: the project can go on without it.
        fireEvent.click(within(grund).getByText(t('projects.allocation.endAlone')));
        expect(onAction).toHaveBeenLastCalledWith('allocation-end-alone', expect.objectContaining({ id: 'a_grund', kind: 'allocation', parent_id: 'b_grund' }));
        // Left behind: it ends on its own date, the project goes on.
        const lab = screen.getByTestId('allocation-a_lab');
        expect(within(lab).getByText(t('projects.allocation.endsAlone', { date: formatDate('2027-01-31') }))).toBeTruthy();
        expect(within(lab).queryByText(t('projects.allocation.endAlone'))).toBeNull();
        // An allocation that no longer pays is not part of the card, and nothing on it speaks of expiry.
        expect(screen.queryByText('Altes Budget')).toBeNull();
        expect(screen.queryByText(/abgelaufen|expired/i)).toBeNull();

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

describe('the end of a project paid by several budgets', () => {
    it('is the project’s: the dialog lists every paying budget and asks all of them for a new end', async () => {
        const calls = [];
        api.requestChange = vi.fn(async (id, body) => { calls.push([id, body]); return { ...PROJECT }; });
        api.setAttributes = vi.fn();
        renderView(<ProjectFormModal opened onClose={() => {}} resources={RESOURCES} roles={['member', 'reader']} node={PROJECT}
            eligibleBudgets={[]} myBudgets={[]} asManager />);

        // No single budget: every paying one is named.
        expect(await screen.findByText('Grundversorgung, Kurs DSKI, Labor')).toBeTruthy();
        expect(screen.getByText(t('projects.allocation.endAllBudgets'))).toBeTruthy();
        // Attributes are no longer the project's.
        expect(screen.queryByRole('tab', { name: t('projects.attributes.tab') })).toBeNull();

        // A year from now: later than the project's end, so every budget is asked.
        fireEvent.click(screen.getByRole('button', { name: t('projects.endDate.monthsShortcut', { count: 12 }) }));
        fireEvent.click(screen.getByRole('button', { name: t('projects.projectForm.submitChangeRequest') }));
        await waitFor(() => expect(calls.length).toBeGreaterThan(0));
        const [id, body] = calls[calls.length - 1];
        expect(id).toBe('p_dski');
        expect(Object.keys(body)).toEqual(['termination_date']);
        expect(api.setAttributes).not.toHaveBeenCalled();
    });
});

describe('the allocation dialog', () => {
    it('changes amounts only and, for its budget’s managers, the allocation’s attributes', async () => {
        const calls = [];
        api.requestChange = vi.fn(async (id, body) => { calls.push(['change', id, body]); return {}; });
        api.setAttributes = vi.fn(async (id, attrs) => { calls.push(['attributes', id, attrs]); return {}; });
        api.getNode = async (id) => (id === 'a_grund' ? { id: 'a_grund', kind: 'allocation', attributes: PROJECT.allocations[0].attributes, effective_attributes: { kostenstelle: { from: { id: 'a_grund' }, values: { nummer: '4711' } } } } : null);
        renderView(<AllocationModal opened onClose={() => {}} project={PROJECT} initial="a_grund" resources={RESOURCES}
            myBudgets={[budget('b_grund', 'Grundversorgung')]} userEmail="manager@example.org" />);

        // Its end is the project's: no field for it.
        expect(await screen.findByText(t('projects.allocation.runsUntil', { date: formatDate('2027-03-31') }))).toBeTruthy();
        expect(screen.getByText(t('projects.attributes.tab'))).toBeTruthy();
        expect(screen.getByDisplayValue('4711')).toBeTruthy();
        fireEvent.change(screen.getByDisplayValue('4711'), { target: { value: '4712' } });
        fireEvent.change(screen.getByLabelText('Cores'), { target: { value: '3' } });
        fireEvent.click(screen.getByRole('button', { name: new RegExp(`${t('projects.projectForm.submitChangeRequest')}|${t('projects.forms.saveChanges')}`) }));
        await waitFor(() => expect(calls.length).toBe(2));
        expect(calls[0]).toEqual(['attributes', 'a_grund', { kostenstelle: { nummer: '4712' } }]);
        expect(calls[1][0]).toBe('change');
        expect(calls[1][2].limit).toMatchObject({ cores: 3 });
        expect(calls[1][2].termination_date).toBeUndefined();
    });

    it('adds another budget without an end and shows why the API refuses it', async () => {
        api.addAllocation = vi.fn(async () => { throw new Error('Das Budget "Kurs DSKI" vergibt nur bis 31.12.2026, das Projekt läuft bis 31.03.2027.'); });
        renderView(<AllocationModal opened onClose={() => {}} project={PROJECT} initial="add" resources={RESOURCES}
            eligibleBudgets={[budget('b_neu', 'Neues Budget')]} userEmail="owner@example.org" />);
        expect(await screen.findByText(t('projects.allocation.runsUntilAdd', { date: formatDate('2027-03-31') }))).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Cores'), { target: { value: '2' } });
        await waitFor(() => expect(screen.queryByText(t('projects.allocation.budgetRequired'))).toBeNull());
        // Picking the budget through the select's own input.
        const picker = screen.getByPlaceholderText(t('projects.projectForm.budgetPlaceholder'));
        fireEvent.click(picker);
        fireEvent.change(picker, { target: { value: 'Neues' } });
        await waitFor(() => expect([...document.querySelectorAll('[role=option]')].some(o => o.textContent.includes('Neues Budget'))).toBe(true));
        fireEvent.click([...document.querySelectorAll('[role=option]')].find(o => o.textContent.includes('Neues Budget')));
        fireEvent.click(screen.getByRole('button', { name: new RegExp(`${t('projects.allocation.ask')}|${t('projects.allocation.grant')}`) }));
        await waitFor(() => expect(api.addAllocation).toHaveBeenCalled());
        expect(api.addAllocation.mock.calls[0][0].terminationDate).toBeUndefined();
        expect(await screen.findByText(/vergibt nur bis 31.12.2026/)).toBeTruthy();
    });
});

describe('a budget’s table row of a co-funded project', () => {
    it('shows what this budget pays, that others pay too, and offers the allocation’s actions', async () => {
        const row = {
            id: 'a_kurs', kind: 'allocation', status: 'approved', name: 'DSKI Projekt', parent_id: 'b_kurs', project_id: 'p_dski', owner: PROJECT.owner,
            limit: { cores: 4, ram: 8 }, termination_date: '2027-06-30', revision: 5,
            project: { ...PROJECT, bindings: { openstack: { external_id: 'os-1', in_use: { cores: 5, ram: 9 } } } },
        };
        api.listChildren = async () => ({ items: [row], total: 1 });
        const onAction = vi.fn();
        const onOpen = vi.fn();
        renderView(<BudgetProjectsTable budget={KURS} resources={RESOURCES} onAction={onAction} onOpen={onOpen} />, { config: { resources: RESOURCES } });

        const tr = (await screen.findByText('DSKI Projekt')).closest('tr');
        expect(within(tr).getByText(t('projects.budgetProjects.coFunded', { count: 2 }))).toBeTruthy();
        expect(within(tr).getByText('owner@example.org')).toBeTruthy();
        // In use is the project's (5 cores), granted what this budget pays (4), not the project's 7.
        expect(within(tr).getByText('5')).toBeTruthy();
        expect(within(tr).getByText('4')).toBeTruthy();
        expect(within(tr).queryByText('7')).toBeNull();
        // It runs longest: nothing to leave behind.
        expect(within(tr).queryByLabelText(t('projects.allocation.endAlone'))).toBeNull();

        // Withdrawing this budget's part, not releasing the whole project another budget pays for too.
        expect(within(tr).queryByLabelText(t('projects.actions.release'))).toBeNull();
        fireEvent.click(within(tr).getByLabelText(t('projects.allocation.withdraw')));
        expect(onAction).toHaveBeenLastCalledWith('allocation-end', row, undefined);
        fireEvent.click(within(tr).getByLabelText(t('projects.allocation.change')));
        expect(onAction).toHaveBeenLastCalledWith('allocations', row.project, 'a_kurs');
        // Its attributes are set in the allocation dialog.
        fireEvent.click(within(tr).getByLabelText(t('projects.allocation.attributes')));
        expect(onAction).toHaveBeenLastCalledWith('allocations', row.project, 'a_kurs');

        fireEvent.click(tr);
        expect(onOpen).toHaveBeenCalledWith(row.project);
    });

    it('offers to go on without an allocation that ends earlier, and marks one left behind', async () => {
        const rows = [
            { id: 'a_grund', kind: 'allocation', status: 'change_pending', name: 'DSKI Projekt', parent_id: 'b_grund', project_id: 'p_dski', owner: PROJECT.owner,
                limit: { cores: 2, ram: 4 }, pending: { termination_date: '2027-06-30' }, termination_date: '2027-03-31', revision: 2, project: PROJECT },
            { id: 'a_lab', kind: 'allocation', status: 'approved', name: 'Lab Projekt', parent_id: 'b_lab', project_id: 'p_dski', owner: PROJECT.owner,
                limit: { cores: 1, ram: 2 }, termination_date: '2027-01-31', ends_alone: true, revision: 3, project: { ...PROJECT, name: 'Lab Projekt' } },
        ];
        api.listChildren = async () => ({ items: rows, total: 2 });
        const onAction = vi.fn();
        renderView(<BudgetProjectsTable budget={GRUND} resources={RESOURCES} onAction={onAction} onOpen={() => {}} />, { config: { resources: RESOURCES } });

        const tr = (await screen.findByText('DSKI Projekt')).closest('tr');
        fireEvent.click(within(tr).getByLabelText(t('projects.allocation.endAlone')));
        expect(onAction).toHaveBeenLastCalledWith('allocation-end-alone', expect.objectContaining({ id: 'a_grund' }), undefined);
        const lab = screen.getByText('Lab Projekt').closest('tr');
        expect(within(lab).getByText(t('projects.allocation.endsAloneBadge'))).toBeTruthy();
        expect(within(lab).queryByLabelText(t('projects.allocation.endAlone'))).toBeNull();
    });
});
