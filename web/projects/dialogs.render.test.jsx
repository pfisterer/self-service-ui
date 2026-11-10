// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { CAPS, fakeNodesApi, fixtureTree, renderView } from '/test/render-harness.jsx';
import i18n from '/i18n/index.js';
import { groupTitle } from '/projects/util-caps.js';

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

// The catalogue with resources of the AI service, so the budget dialog has a Workspaces tab that holds the caps; ws() gives a budget some of them.
const WS = [...RESOURCES, { id: 'ws-vcpu-hours', name: 'vCPU-Stunden', provider: 'aiaas', area: 'workspaces', kind: 'window', window: '30d' }];
const ws = (b) => ({ ...b, parent_name: 'Organization Root', parent_path: [], limit: { ...b.limit, 'ws-vcpu-hours': -1 } });

// openCaps opens the Workspaces tab of the budget dialog and there the sub-tab of a group of caps.
async function openCaps(group) {
    fireEvent.click(await screen.findByRole('tab', { name: /Workspaces|Lab/ }));
    fireEvent.click(await screen.findByRole('tab', { name: groupTitle(i18n.t, group) }));
}

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
        renderView(<ProjectFormModal opened onClose={() => {}} resources={RESOURCES} roles={['member', 'reader']}
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
        renderView(<ProjectFormModal opened onClose={() => {}} resources={mixed} roles={['member', 'reader']}
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
        renderView(<ProjectFormModal opened onClose={() => {}} resources={mixed} roles={['member', 'reader']}
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
        renderView(<ProjectFormModal opened onClose={() => {}} resources={mixed} roles={['member', 'reader']}
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

    it('the budget dialog of the root offers its caps by group, with the provider default as placeholder', async () => {
        const tree = fixtureTree();
        const root = { ...tree.roots[0], parent_id: null, caps: { 'release-gpu-max-hours': 4 } };
        renderView(<BudgetFormModal opened onClose={() => {}} resources={WS} mode="edit" node={root} />);
        await openCaps('Release times GPU');
        expect(await screen.findByText(groupTitle(i18n.t, 'Release times GPU'), { selector: 'p' })).toBeTruthy();
        expect(screen.getAllByPlaceholderText(i18n.t('projects.caps.standard')).length).toBeGreaterThan(0);
        expect(screen.getByDisplayValue('4')).toBeTruthy();
        // No upper bound is offered where the cap allows it and nothing above bounds it.
        expect(screen.getByLabelText(i18n.t('projects.caps.unbounded'))).toBeTruthy();
        expect(fatal()).toEqual([]);
    });

    it('a sub-budget shows what the budgets above allow', async () => {
        const tree = fixtureTree();
        const ma = { ...ws(tree.children.b_root.items[0]), inherited_caps: { 'release-cpu-idle-open': 120, 'release-gpu-max-hours': 4 } };
        renderView(<BudgetFormModal opened onClose={() => {}} resources={WS} mode="edit" node={ma} parent={ws(tree.roots[0])} />);
        await openCaps('Release times CPU');
        expect(await screen.findAllByPlaceholderText(i18n.t('projects.caps.fromAbove', { value: `120 ${i18n.t('projects.caps.release-cpu-idle-open.unit')}` }))).toHaveLength(1);
        fireEvent.click(screen.getByRole('tab', { name: groupTitle(i18n.t, 'Release times GPU') }));
        expect(await screen.findAllByPlaceholderText(i18n.t('projects.caps.fromAbove', { value: `4 ${i18n.t('projects.caps.release-gpu-max-hours.unit')}` }))).toHaveLength(1);
        // No upper bound only where nothing above has one.
        expect(screen.queryAllByLabelText(i18n.t('projects.caps.unbounded'))).toHaveLength(0);
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
        const ma = { ...ws(tree.children.b_root.items[0]), inherited_caps: { 'workspace-scratch-gb': 5 } };
        const sent = [];
        globalThis.__testApi.updateNode = async (id, body) => { sent.push(body); return { ...ma, ...body }; };
        renderView(<BudgetFormModal opened onClose={() => {}} resources={WS} mode="edit" node={ma} parent={ws(tree.roots[0])} />);
        await openCaps('Workspaces');
        const field = await screen.findByPlaceholderText(i18n.t('projects.caps.fromAbove', { value: '5 GB' }));
        fireEvent.change(field, { target: { value: '6' } });
        fireEvent.click(screen.getByRole('button', { name: i18n.t('projects.forms.saveChanges') }));
        expect(await screen.findByText(i18n.t('projects.caps.errAbove', { value: '5 GB' }))).toBeTruthy();
        expect(sent).toHaveLength(0);
        expect(fatal()).toEqual([]);
    });

    it('the root budget dialog shows the default for the local storage and sends only the changed caps', async () => {
        const tree = fixtureTree();
        const root = { ...ws(tree.roots[0]), parent_id: null, caps: { 'workspace-scratch-gb': 3, 'release-gpu-max-hours': 4, 'batch-priority': 1 } };
        const sent = [];
        globalThis.__testApi.updateNode = async (id, body) => { sent.push(body); return { ...root, ...body }; };
        renderView(<BudgetFormModal opened onClose={() => {}} resources={WS} mode="edit" node={root} />);
        await openCaps('Workspaces');
        expect(await screen.findByPlaceholderText(i18n.t('projects.caps.workspace-scratch-gb.standard'))).toBeTruthy();
        fireEvent.change(screen.getByDisplayValue('3'), { target: { value: '2' } });
        fireEvent.click(screen.getByRole('tab', { name: groupTitle(i18n.t, 'Release times GPU') }));
        fireEvent.change(await screen.findByDisplayValue('4'), { target: { value: '' } });
        fireEvent.click(screen.getByRole('button', { name: i18n.t('projects.forms.saveChanges') }));
        await waitFor(() => expect(sent).toHaveLength(1));
        expect(sent[0].caps).toEqual({ 'workspace-scratch-gb': 2, 'release-gpu-max-hours': null });
        expect(fatal()).toEqual([]);
    });

    it('the budget dialog offers the batch job priority, and not guaranteed under a budget that makes jobs preemptible', async () => {
        const tree = fixtureTree();
        const ma = { ...ws(tree.children.b_root.items[0]), inherited_caps: { 'batch-priority': 0 } };
        renderView(<BudgetFormModal opened onClose={() => {}} resources={WS} mode="edit" node={ma} parent={ws(tree.roots[0])} />);
        await openCaps('Batch jobs');
        expect(await screen.findByPlaceholderText(i18n.t('projects.caps.fromAbove', { value: i18n.t('projects.caps.batch-priority.choices.preemptible') }))).toBeTruthy();
        expect(fatal()).toEqual([]);
    });

    it('the budget dialog offers batch jobs within what the budget above has, and sends the budget\'s own', async () => {
        const tree = fixtureTree();
        const ma = { ...ws(tree.children.b_root.items[0]), inherited_caps: { 'batch-jobs-per-person': 3, 'batch-max-hours': 8 } };
        const sent = [];
        globalThis.__testApi.updateNode = async (id, body) => { sent.push(body); return { ...ma, ...body }; };
        renderView(<BudgetFormModal opened onClose={() => {}} resources={WS} mode="edit" node={ma} parent={ws(tree.roots[0])} />);
        await openCaps('Batch jobs');
        const toggle = await screen.findByRole('switch', { name: new RegExp(`^${i18n.t('projects.caps.together.batch-jobs.label')}`) });
        expect(toggle.checked).toBe(false);

        // Switched on: the AI service's defaults within what is allowed above (2 per person, 4 hours).
        fireEvent.click(toggle);
        expect(await screen.findByDisplayValue('2')).toBeTruthy();
        expect(screen.getByDisplayValue('4')).toBeTruthy();
        expect(screen.getByText(new RegExp(i18n.t('projects.caps.aboveHint', { value: '' })))).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: i18n.t('projects.forms.saveChanges') }));
        await waitFor(() => expect(sent).toHaveLength(1));
        expect(sent[0].caps).toEqual({ 'batch-jobs-per-person': 2, 'batch-max-hours': 4 });
        expect(fatal()).toEqual([]);
    });

    it('the budget dialog switches the budget\'s batch jobs off', async () => {
        const tree = fixtureTree();
        const ma = { ...ws(tree.children.b_root.items[0]), caps: { 'batch-jobs-per-person': 1, 'batch-max-hours': 2 }, inherited_caps: { 'batch-jobs-per-person': 3, 'batch-max-hours': 8 } };
        const sent = [];
        globalThis.__testApi.updateNode = async (id, body) => { sent.push(body); return { ...ma, ...body }; };
        renderView(<BudgetFormModal opened onClose={() => {}} resources={WS} mode="edit" node={ma} parent={ws(tree.roots[0])} />);
        await openCaps('Batch jobs');
        const toggle = await screen.findByRole('switch', { name: new RegExp(`^${i18n.t('projects.caps.together.batch-jobs.label')}`) });
        expect(toggle.checked).toBe(true);
        fireEvent.click(toggle);
        fireEvent.click(screen.getByRole('button', { name: i18n.t('projects.forms.saveChanges') }));
        await waitFor(() => expect(sent).toHaveLength(1));
        expect(sent[0].caps).toEqual({ 'batch-jobs-per-person': null, 'batch-max-hours': null });
        expect(fatal()).toEqual([]);
    });

    it('the budget dialog does not offer batch jobs where the budget above has none, but the root sets them', async () => {
        const tree = fixtureTree();
        const ma = ws(tree.children.b_root.items[0]);
        renderView(<BudgetFormModal opened onClose={() => {}} resources={WS} mode="edit" node={ma} parent={ws(tree.roots[0])} />);
        await openCaps('Batch jobs');
        expect(screen.queryByRole('switch', { name: new RegExp(`^${i18n.t('projects.caps.together.batch-jobs.label')}`) })).toBeNull();
        cleanup();

        const root = { ...tree.roots[0], parent_id: null };
        renderView(<BudgetFormModal opened onClose={() => {}} resources={WS} mode="edit" node={root} />);
        await openCaps('Batch jobs');
        expect(screen.getByRole('switch', { name: new RegExp(`^${i18n.t('projects.caps.together.batch-jobs.label')}`) })).toBeTruthy();
        expect(screen.getByText(i18n.t('projects.caps.rootHint'))).toBeTruthy();
        expect(fatal()).toEqual([]);
    });

    it('a budget that inherits its limit shows the batch jobs above and sends none of its own', async () => {
        const tree = fixtureTree();
        const ma = { ...ws(tree.children.b_root.items[0]), inherits_limit: true, inherited_caps: { 'batch-jobs-per-person': 3, 'batch-max-hours': 8 } };
        renderView(<BudgetFormModal opened onClose={() => {}} resources={WS} mode="edit" node={ma} parent={ws(tree.roots[0])} />);
        await openCaps('Batch jobs');
        expect(await screen.findByText(new RegExp(i18n.t('projects.caps.inheritsGrant', { value: '' })))).toBeTruthy();
        expect(screen.queryByRole('switch', { name: new RegExp(`^${i18n.t('projects.caps.together.batch-jobs.label')}`) })).toBeNull();
        expect(fatal()).toEqual([]);
    });

    it('the root budget dialog shows preemptible as the default for batch jobs', async () => {
        const tree = fixtureTree();
        const root = { ...tree.roots[0], parent_id: null };
        renderView(<BudgetFormModal opened onClose={() => {}} resources={WS} mode="edit" node={root} />);
        await openCaps('Batch jobs');
        expect(await screen.findByPlaceholderText(i18n.t('projects.caps.batch-priority.standard'))).toBeTruthy();
        expect(fatal()).toEqual([]);
    });

    it('a new budget sends the caps set in its dialog', async () => {
        const tree = fixtureTree();
        const created = [];
        globalThis.__testApi.createNode = async (body) => { created.push(body); return { ...body, id: 'b_new' }; };
        renderView(<BudgetFormModal opened onClose={() => {}} resources={WS} mode="create" parent={ws(tree.roots[0])} currentUserEmail="dennis.pfisterer@dhbw.de" />);
        fireEvent.change(await screen.findByLabelText(new RegExp(i18n.t('projects.budgetForm.name'))), { target: { value: 'Neues Budget' } });
        fireEvent.change(screen.getByLabelText(new RegExp(i18n.t('projects.budgetForm.purpose'))), { target: { value: 'Ein Zweck, lang genug für die Prüfung' } });
        await openCaps('Workspaces');
        fireEvent.change(await screen.findByPlaceholderText(i18n.t('projects.caps.workspace-scratch-gb.standard')), { target: { value: '7' } });
        fireEvent.click(screen.getByRole('button', { name: i18n.t('projects.budgetForm.submitCreate') }));
        await waitFor(() => expect(created).toHaveLength(1));
        expect(created[0].caps).toEqual({ 'workspace-scratch-gb': 7 });
        expect(fatal()).toEqual([]);
    });

    it('the history names the changed caps from the catalogue, and an unknown one by its id', async () => {
        const history = [{ timestamp: '2026-11-10T10:00:00Z', event: 'updated', actor: 'dennis.pfisterer@dhbw.de', caps_from: { 'release-gpu-max-hours': 4, 'gone-cap': 1 }, caps_to: { 'release-gpu-max-hours': 0, 'batch-priority': 1 } }];
        renderView(<NodeInspectModal opened onClose={() => {}} resources={RESOURCES} node={project({ history })} initialTab="history" />);
        const line = (id, from, to) => {
            const cap = CAPS.find(c => c.id === id);
            const name = cap ? `${groupTitle(i18n.t, cap.group)} · ${i18n.t(`projects.caps.${id}.name`)}` : id;
            return i18n.t('projects.caps.historyChange', { name, from, to });
        };
        expect(await screen.findByText(line('release-gpu-max-hours', `4 ${i18n.t('projects.caps.release-gpu-max-hours.unit')}`, i18n.t('projects.caps.unbounded')))).toBeTruthy();
        expect(screen.getByText(line('batch-priority', i18n.t('projects.caps.notSet'), i18n.t('projects.caps.batch-priority.choices.guaranteed')))).toBeTruthy();
        expect(screen.getByText(line('gone-cap', '1', i18n.t('projects.caps.notSet')))).toBeTruthy();
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
