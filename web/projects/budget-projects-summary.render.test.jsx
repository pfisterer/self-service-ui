// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderView } from '/test/render-harness.jsx';
import i18n from '/i18n/index.js';

// The budget's project table where it is too narrow for a column per resource: a few sums instead, sorted by the server over all their resources, and a click on a row opens the project on its consumption.

vi.mock('/projects/api-nodes.jsx', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, useNodesApi: () => globalThis.__testApi };
});
// Narrow: the width decides between a column per resource and the sums.
vi.mock('@mantine/hooks', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, useElementSize: () => ({ ref: () => {}, width: 500, height: 400 }) };
});

const { BudgetProjectsTable } = await import('/projects/component-budget-projects.jsx');
const { NodeInspectModal, TAB_USAGE } = await import('/projects/modal-inspect.jsx');

const RESOURCES = [
    { id: 'cores', name: 'Cores', area: 'cloud' },
    { id: 'gpu-hours-small', name: 'General · small: GPU hours', unit: 'GPU h', kind: 'window', window: '30d', area: 'workspaces' },
    { id: 'gpu-hours-large', name: 'General · large: GPU hours', unit: 'GPU h', kind: 'window', window: '30d', area: 'workspaces' },
    { id: 'ws-vcpu-hours', name: 'Workspace CPU', unit: 'vCPU h', kind: 'window', window: '30d', area: 'workspaces' },
    { id: 'ws-ram-gb-hours', name: 'Workspace RAM', unit: 'GB h', kind: 'window', window: '30d', area: 'workspaces' },
    { id: 'ws-storage-gb', name: 'Workspace storage', unit: 'GB', area: 'workspaces' },
];
const BUDGET = { id: 'b', kind: 'budget', name: 'Budget', limit: { cores: 100, 'gpu-hours-small': 100, 'gpu-hours-large': 100, 'ws-vcpu-hours': 1000, 'ws-ram-gb-hours': 4000, 'ws-storage-gb': 100 } };
const PROJECTS = [
    { id: 'p1', kind: 'project', status: 'approved', name: 'Bildanalyse', parent_id: 'b', limit: { 'gpu-hours-small': 50, 'gpu-hours-large': 20, 'ws-vcpu-hours': 100, 'ws-ram-gb-hours': 400, 'ws-storage-gb': 20 },
      bindings: { aiaas: { in_use: { 'gpu-hours-small': 12, 'gpu-hours-large': 3, 'ws-vcpu-hours': 40, 'ws-ram-gb-hours': 160, 'ws-storage-gb': 7 } } } },
    { id: 'p2', kind: 'project', status: 'approved', name: 'Noch leer', parent_id: 'b', limit: { 'gpu-hours-small': 10 } },
];

let calls;
beforeEach(() => {
    calls = [];
    globalThis.__testApi = {
        listChildren: async (id, opts) => { calls.push(opts); return { items: PROJECTS, total: PROJECTS.length }; },
    };
    const store = new Map();
    vi.stubGlobal('localStorage', { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear() });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('the budget table, narrow', () => {
    it('shows the summed GPU and CPU hours, sorts by the sum and opens a row on its consumption', async () => {
        const onOpen = vi.fn();
        renderView(<BudgetProjectsTable budget={BUDGET} resources={RESOURCES} onAction={() => {}} onOpen={onOpen} />, { config: { resources: RESOURCES } });
        const row = (await screen.findByText('Bildanalyse')).closest('tr');
        // 12 + 3 GPU hours of two classes, the CPU hours beside them; a project with nothing measured shows a dash.
        expect(within(row).getByText('15')).toBeTruthy();
        expect(within(row).getByText('40')).toBeTruthy();
        expect(within(screen.getByText('Noch leer').closest('tr')).getAllByText('–').length).toBeGreaterThan(0);
        // No cloud project on the page: no column for cores; RAM and storage only under Workspaces.
        expect(screen.queryByText(i18n.t('projects.budgetProjects.summary.cores'))).toBeNull();
        expect(screen.queryByText(i18n.t('projects.budgetProjects.summary.ramHours'))).toBeNull();

        fireEvent.click(screen.getByText(i18n.t('projects.budgetProjects.summary.gpuHours')));
        await waitFor(() => expect(calls.some(c => c.sort === 'used:gpu-hours-small,gpu-hours-large' && c.order === 'desc')).toBe(true));

        fireEvent.click(row);
        expect(onOpen).toHaveBeenCalledWith(PROJECTS[0]);
    });

    it('under Workspaces also shows RAM hours and storage', async () => {
        localStorage.setItem('self-service.budget-projects.kind', JSON.stringify('workspaces'));
        renderView(<BudgetProjectsTable budget={BUDGET} resources={RESOURCES} onAction={() => {}} onOpen={() => {}} />, { config: { resources: RESOURCES } });
        const row = (await screen.findByText('Bildanalyse')).closest('tr');
        expect(screen.getByText(i18n.t('projects.budgetProjects.summary.ramHours'))).toBeTruthy();
        expect(screen.getByText(i18n.t('projects.budgetProjects.summary.storage'))).toBeTruthy();
        expect(within(row).getByText('160')).toBeTruthy();
        expect(within(row).getByText('7')).toBeTruthy();
    });

    it('the project dialog opens on its consumption, also for a project without OpenStack', async () => {
        renderView(<NodeInspectModal opened node={PROJECTS[0]} resources={RESOURCES} initialTab={TAB_USAGE} onClose={() => {}} />, { config: { resources: RESOURCES } });
        expect(await screen.findByText(i18n.t('projects.consumption.now'))).toBeTruthy();
        expect(screen.queryByText(i18n.t('projects.consumption.history'))).toBeNull();
    });
});
