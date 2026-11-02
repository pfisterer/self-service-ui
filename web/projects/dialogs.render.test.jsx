// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { fakeNodesApi, fixtureTree, renderView } from '/test/render-harness.jsx';
import i18n from '/i18n/index.js';

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
const { NewProjectButton } = await import('/projects/component-new-project-button.jsx');

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
        bindings: { openstack: { ...p.bindings?.openstack, external_group_assignments: [{ group_id: 'g1', group_name: 'fakultaet-wi', role: 'member' }] } },
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

    it('a new LLM project offers only LLM budgets and resources, and members without OpenStack roles', async () => {
        const tree = fixtureTree();
        const mixed = [
            { id: 'cores', name: 'Cores', default: 4, min: 1, max: 64, provider: 'openstack', area: 'cloud' },
            { id: 'llm-mtokens', name: 'LLM tokens', unit: 'M tokens', kind: 'window', window: '30d', default: 0, min: 0, max: 1000, provider: 'aiaas', area: 'llm' },
        ];
        const cloudOnly = { ...tree.roots[0], id: 'b_cloud', name: 'Cloud budget', available_resources: ['cores'] };
        const both = { ...tree.roots[0], id: 'b_both', name: 'Both budget', available_resources: ['cores', 'llm-mtokens'] };
        renderView(<ProjectFormModal opened onClose={() => {}} resources={mixed} openstackRoles={['member', 'reader']}
            myBudgets={[cloudOnly, both]} initialKind="llm" />);

        expect(await screen.findByText(/New LLM project|Neues LLM-Projekt/)).toBeTruthy();
        fireEvent.click(screen.getByRole('tab', { name: /Resources|Ressourcen/ }));
        expect(await screen.findByText(/LLM tokens \(M tokens/)).toBeTruthy();
        expect(screen.queryByText(/^Cores/)).toBeNull();
        fireEvent.click(screen.getByRole('tab', { name: /Members|Mitglieder/ }));
        expect(await screen.findByText(/shared pool|gemeinsamer Topf/)).toBeTruthy();
        expect(fatal()).toEqual([]);
    });

    it('a project holding both kinds shows both in its members tab', async () => {
        const mixed = [
            { id: 'cores', name: 'Cores', default: 4, min: 1, max: 64, provider: 'openstack', area: 'cloud' },
            { id: 'llm-mtokens', name: 'LLM tokens', unit: 'M tokens', kind: 'window', window: '30d', default: 0, min: 0, max: 1000, provider: 'aiaas', area: 'llm' },
        ];
        renderView(<ProjectFormModal opened onClose={() => {}} resources={mixed} openstackRoles={['member', 'reader']}
            node={project({ limit: { cores: 2, 'llm-mtokens': 50 }, allocations: [] })} />);
        fireEvent.click(screen.getByRole('tab', { name: /Members|Mitglieder/ }));
        expect(await screen.findByText(/in OpenStack with the chosen role|in OpenStack mit der gewählten Rolle/)).toBeTruthy();
        expect(fatal()).toEqual([]);
    });

    it('a project holding both kinds has one resources tab per kind', async () => {
        const mixed = [
            { id: 'cores', name: 'Cores', default: 4, min: 1, max: 64, provider: 'openstack', area: 'cloud' },
            { id: 'llm-mtokens', name: 'LLM tokens', unit: 'M tokens', kind: 'window', window: '30d', default: 0, min: 0, max: 1000, provider: 'aiaas', area: 'llm' },
        ];
        renderView(<ProjectFormModal opened onClose={() => {}} resources={mixed} openstackRoles={['member', 'reader']}
            node={project({ limit: { cores: 2, 'llm-mtokens': 50 }, allocations: [] })} />);
        expect(screen.getByRole('tab', { name: /^Cloud$/ })).toBeTruthy();
        fireEvent.click(screen.getByRole('tab', { name: /^LLM$/ }));
        expect((await screen.findAllByText(/LLM tokens/)).length).toBeGreaterThan(0);
        expect(screen.queryByRole('tab', { name: /^(Resources|Ressourcen)$/ })).toBeNull();
        expect(fatal()).toEqual([]);
    });

    it('new project: one button per kind, a kind without a budget disabled', async () => {
        const picked = [];
        renderView(<NewProjectButton kinds={['cloud', 'llm']} available={['llm']} onPick={k => picked.push(k)} />);
        const cloud = await screen.findByRole('button', { name: /cloud project|Cloud-Projekt/ });
        const llm = screen.getByRole('button', { name: /LLM project|LLM-Projekt/ });
        expect(cloud.disabled).toBe(true);
        fireEvent.click(llm);
        expect(picked).toEqual(['llm']);
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

    it('the budget dialog of the root offers its release maximums with the AI service default as placeholder', async () => {
        const tree = fixtureTree();
        const ws = [...RESOURCES, { id: 'ws-vcpu-hours', name: 'vCPU-Stunden', provider: 'aiaas', area: 'workspaces', kind: 'window', window: '30d' }];
        const root = { ...tree.roots[0], parent_id: null, release_max: { cpu: {}, gpu: { max_hours: 4 } } };
        renderView(<BudgetFormModal opened onClose={() => {}} resources={ws} mode="edit" node={root} />);
        fireEvent.click(await screen.findByRole('tab', { name: /Workspaces|Lab/ }));
        expect(await screen.findByText(/Release times \(maximums\)|Rückgabezeiten \(Höchstwerte\)/)).toBeTruthy();
        expect(screen.getAllByPlaceholderText(/default|Standard/).length).toBeGreaterThan(0);
        expect(screen.getByDisplayValue('4')).toBeTruthy();
        expect(fatal()).toEqual([]);
    });

    it('a sub-budget shows what the budgets above allow and refuses more', async () => {
        const tree = fixtureTree();
        const ws = [...RESOURCES, { id: 'ws-vcpu-hours', name: 'vCPU-Stunden', provider: 'aiaas', area: 'workspaces', kind: 'window', window: '30d' }];
        const ma = { ...tree.children.b_root.items[0], parent_name: 'Organization Root', parent_path: [], inherited_release_max: { cpu: { idle_open_minutes: 120 }, gpu: { max_hours: 4 } } };
        renderView(<BudgetFormModal opened onClose={() => {}} resources={ws} mode="edit" node={ma} parent={{ ...tree.roots[0], limit: { ...tree.roots[0].limit, 'ws-vcpu-hours': -1 } }} />);
        fireEvent.click(await screen.findByRole('tab', { name: /Workspaces|Lab/ }));
        expect(await screen.findAllByPlaceholderText(/as above: 120|wie darüber: 120/)).toHaveLength(1);
        expect(screen.getAllByPlaceholderText(/as above: 4|wie darüber: 4/)).toHaveLength(1);
        // No upper bound only where nothing above has one.
        expect(screen.queryAllByLabelText(/no upper bound|ohne Obergrenze/)).toHaveLength(0);
        expect(fatal()).toEqual([]);
    });

    // A budget with individual auto-approve limits takes no sub-budget requests: the checkbox is off and locked, says why, and the edit sends it off together with the limits.
    it('the budget dialog locks sub-budget requests while individual limits apply', async () => {
        const tree = fixtureTree();
        const ma = {
            ...tree.children.b_root.items[0], parent_name: 'Organization Root', parent_path: [],
            eligible_requesters: ['group:students'], allow_sub_budget_requests: true, auto_approve: {},
        };
        const sent = [];
        globalThis.__testApi.updateNode = async (id, body) => { sent.push(body); return { ...ma, ...body }; };
        renderView(<BudgetFormModal opened onClose={() => {}} resources={RESOURCES} mode="edit" node={ma} parent={tree.roots[0]} />);

        fireEvent.click(await screen.findByRole('tab', { name: i18n.t('projects.budgetForm.tabAccess') }));
        const box = await screen.findByRole('checkbox', { name: i18n.t('projects.budgetForm.allowBudgetRequests') });
        expect(box.checked).toBe(true);
        expect(box.disabled).toBe(false);

        fireEvent.click(screen.getByRole('tab', { name: i18n.t('projects.budgetForm.tabAutoApprove') }));
        // The switch's label carries its description too.
        fireEvent.click(await screen.findByLabelText(new RegExp(`^${i18n.t('projects.budgetForm.individual')}`)));
        fireEvent.click(screen.getByRole('tab', { name: i18n.t('projects.budgetForm.tabAccess') }));
        const locked = await screen.findByRole('checkbox', { name: i18n.t('projects.budgetForm.allowBudgetRequests') });
        expect(locked.checked).toBe(false);
        expect(locked.disabled).toBe(true);
        expect(screen.getByText(i18n.t('projects.budgetForm.allowBudgetRequestsPerPerson'))).toBeTruthy();

        fireEvent.click(screen.getByRole('button', { name: i18n.t('projects.forms.saveChanges') }));
        await waitFor(() => expect(sent).toHaveLength(1));
        expect(sent[0].allow_sub_budget_requests).toBe(false);
        expect(sent[0].auto_approve.per_requester_limit).toBeTruthy();
        expect(fatal()).toEqual([]);
    });

    it('the budget dialog offers the local storage per workspace with what the budgets above allow, and refuses more', async () => {
        const tree = fixtureTree();
        const ws = [...RESOURCES, { id: 'ws-vcpu-hours', name: 'vCPU-Stunden', provider: 'aiaas', area: 'workspaces', kind: 'window', window: '30d' }];
        const ma = { ...tree.children.b_root.items[0], parent_name: 'Organization Root', parent_path: [], inherited_workspace_scratch_gb: 5 };
        renderView(<BudgetFormModal opened onClose={() => {}} resources={ws} mode="edit" node={ma} parent={{ ...tree.roots[0], limit: { ...tree.roots[0].limit, 'ws-vcpu-hours': -1 } }} />);
        fireEvent.click(await screen.findByRole('tab', { name: /Workspaces|Lab/ }));
        expect(await screen.findByText(/Local storage per workspace|Lokaler Speicher je Workspace/)).toBeTruthy();
        expect(screen.getByPlaceholderText(/as above: 5|wie darüber: 5/)).toBeTruthy();
        expect(fatal()).toEqual([]);
    });

    it('the root budget dialog shows the AI service default for the local storage', async () => {
        const tree = fixtureTree();
        const ws = [...RESOURCES, { id: 'ws-vcpu-hours', name: 'vCPU-Stunden', provider: 'aiaas', area: 'workspaces', kind: 'window', window: '30d' }];
        const root = { ...tree.roots[0], parent_id: null, workspace_scratch_gb: 3 };
        renderView(<BudgetFormModal opened onClose={() => {}} resources={ws} mode="edit" node={root} />);
        fireEvent.click(await screen.findByRole('tab', { name: /Workspaces|Lab/ }));
        expect(await screen.findByPlaceholderText(/Default \(10 GB\)|Standard \(10 GB\)/)).toBeTruthy();
        expect(screen.getByDisplayValue('3')).toBeTruthy();
        expect(fatal()).toEqual([]);
    });

    it('the budget dialog offers the batch job priority, and not guaranteed under a budget that makes jobs preemptible', async () => {
        const tree = fixtureTree();
        const ws = [...RESOURCES, { id: 'ws-vcpu-hours', name: 'vCPU-Stunden', provider: 'aiaas', area: 'workspaces', kind: 'window', window: '30d' }];
        const ma = { ...tree.children.b_root.items[0], parent_name: 'Organization Root', parent_path: [], inherited_batch_priority: 'preemptible' };
        renderView(<BudgetFormModal opened onClose={() => {}} resources={ws} mode="edit" node={ma} parent={{ ...tree.roots[0], limit: { ...tree.roots[0].limit, 'ws-vcpu-hours': -1 } }} />);
        fireEvent.click(await screen.findByRole('tab', { name: /Workspaces|Lab/ }));
        fireEvent.click(await screen.findByRole('tab', { name: /^(Batch jobs|Batch-Jobs)$/ }));
        expect(screen.getByPlaceholderText(/(as above|wie darüber): (preemptible|verdrängbar)/)).toBeTruthy();
        expect(fatal()).toEqual([]);
    });

    it('the budget dialog offers batch jobs within what the budget above has, and sends the budget\'s own', async () => {
        const tree = fixtureTree();
        const ws = [...RESOURCES, { id: 'ws-vcpu-hours', name: 'vCPU-Stunden', provider: 'aiaas', area: 'workspaces', kind: 'window', window: '30d' }];
        const ma = { ...tree.children.b_root.items[0], parent_name: 'Organization Root', parent_path: [], inherited_batch_jobs: { jobs_per_person: 3, max_hours: 8 } };
        const sent = [];
        globalThis.__testApi.updateNode = async (id, body) => { sent.push(body); return { ...ma, ...body }; };
        renderView(<BudgetFormModal opened onClose={() => {}} resources={ws} mode="edit" node={ma} parent={{ ...tree.roots[0], limit: { ...tree.roots[0].limit, 'ws-vcpu-hours': -1 } }} />);
        fireEvent.click(await screen.findByRole('tab', { name: /Workspaces|Lab/ }));
        fireEvent.click(await screen.findByRole('tab', { name: /^(Batch jobs|Batch-Jobs)$/ }));
        expect(screen.getByText(i18n.t('projects.batchJobs.aboveHint', { value: i18n.t('projects.batchJobs.onValue', { count: 3, hours: 8 }) }))).toBeTruthy();
        const toggle = screen.getByRole('switch', { name: i18n.t('projects.batchJobs.label') });
        expect(toggle.checked).toBe(false);

        // Switched on: the defaults within what is allowed above (2 per person, 4 hours).
        fireEvent.click(toggle);
        expect(await screen.findByDisplayValue('2')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: i18n.t('projects.forms.saveChanges') }));
        await waitFor(() => expect(sent).toHaveLength(1));
        expect(sent[0].batch_jobs).toEqual({ jobs_per_person: 2, max_hours: 4 });
        expect(fatal()).toEqual([]);
    });

    it('the budget dialog switches the budget\'s batch jobs off', async () => {
        const tree = fixtureTree();
        const ws = [...RESOURCES, { id: 'ws-vcpu-hours', name: 'vCPU-Stunden', provider: 'aiaas', area: 'workspaces', kind: 'window', window: '30d' }];
        const ma = { ...tree.children.b_root.items[0], parent_name: 'Organization Root', parent_path: [], batch_jobs: { jobs_per_person: 1, max_hours: 2 }, inherited_batch_jobs: { jobs_per_person: 3, max_hours: 8 } };
        const sent = [];
        globalThis.__testApi.updateNode = async (id, body) => { sent.push(body); return { ...ma, ...body }; };
        renderView(<BudgetFormModal opened onClose={() => {}} resources={ws} mode="edit" node={ma} parent={{ ...tree.roots[0], limit: { ...tree.roots[0].limit, 'ws-vcpu-hours': -1 } }} />);
        fireEvent.click(await screen.findByRole('tab', { name: /Workspaces|Lab/ }));
        fireEvent.click(await screen.findByRole('tab', { name: /^(Batch jobs|Batch-Jobs)$/ }));
        const toggle = screen.getByRole('switch', { name: i18n.t('projects.batchJobs.label') });
        expect(toggle.checked).toBe(true);
        fireEvent.click(toggle);
        fireEvent.click(screen.getByRole('button', { name: i18n.t('projects.forms.saveChanges') }));
        await waitFor(() => expect(sent).toHaveLength(1));
        expect(sent[0].clear_batch_jobs).toBe(true);
        expect(fatal()).toEqual([]);
    });

    it('the budget dialog does not offer batch jobs where the budget above has none, but the root sets them', async () => {
        const tree = fixtureTree();
        const ws = [...RESOURCES, { id: 'ws-vcpu-hours', name: 'vCPU-Stunden', provider: 'aiaas', area: 'workspaces', kind: 'window', window: '30d' }];
        const ma = { ...tree.children.b_root.items[0], parent_name: 'Organization Root', parent_path: [] };
        renderView(<BudgetFormModal opened onClose={() => {}} resources={ws} mode="edit" node={ma} parent={{ ...tree.roots[0], limit: { ...tree.roots[0].limit, 'ws-vcpu-hours': -1 } }} />);
        fireEvent.click(await screen.findByRole('tab', { name: /Workspaces|Lab/ }));
        fireEvent.click(await screen.findByRole('tab', { name: /^(Batch jobs|Batch-Jobs)$/ }));
        expect(screen.queryByRole('switch', { name: i18n.t('projects.batchJobs.label') })).toBeNull();
        cleanup();

        const root = { ...tree.roots[0], parent_id: null };
        renderView(<BudgetFormModal opened onClose={() => {}} resources={ws} mode="edit" node={root} />);
        fireEvent.click(await screen.findByRole('tab', { name: /Workspaces|Lab/ }));
        fireEvent.click(await screen.findByRole('tab', { name: /^(Batch jobs|Batch-Jobs)$/ }));
        expect(screen.getByRole('switch', { name: i18n.t('projects.batchJobs.label') })).toBeTruthy();
        expect(screen.getByText(i18n.t('projects.batchJobs.rootHint'))).toBeTruthy();
        expect(fatal()).toEqual([]);
    });

    it('the root budget dialog shows preemptible as the default for batch jobs', async () => {
        const tree = fixtureTree();
        const ws = [...RESOURCES, { id: 'ws-vcpu-hours', name: 'vCPU-Stunden', provider: 'aiaas', area: 'workspaces', kind: 'window', window: '30d' }];
        const root = { ...tree.roots[0], parent_id: null };
        renderView(<BudgetFormModal opened onClose={() => {}} resources={ws} mode="edit" node={root} />);
        fireEvent.click(await screen.findByRole('tab', { name: /Workspaces|Lab/ }));
        expect(await screen.findByPlaceholderText(/(preemptible \(default\)|verdrängbar \(Standard\))/)).toBeTruthy();
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
