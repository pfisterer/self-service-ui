// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { fakeNodesApi, renderView } from '/test/render-harness.jsx';

vi.mock('/projects/api-nodes.jsx', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, useNodesApi: () => globalThis.__testApi };
});

const { StartView } = await import('/projects/view-start.jsx');

const CONFIG = {
    resources: [
        { id: 'cores', name: 'Cores', provider: 'openstack', area: 'cloud', default: 4, min: 0, max: 64 },
        { id: 'llm-mtokens', name: 'LLM tokens', unit: 'M tokens', provider: 'aiaas', area: 'llm', kind: 'window', window: '30d', default: 0, min: 0, max: 1000 },
        { id: 'ws-vcpu-hours', name: 'Workspace CPU', unit: 'vCPU h', provider: 'aiaas', area: 'workspaces', kind: 'window', window: '30d', default: 0, min: 0, max: 100000 },
    ],
    roles: ['member'],
};

const budget = (id, name, extra) => ({
    id, kind: 'budget', status: 'approved', name, parent_id: 'root',
    limit: { 'llm-mtokens': 10000, 'ws-vcpu-hours': 50000, cores: 100 },
    available_resources: ['cores', 'llm-mtokens', 'ws-vcpu-hours'],
    usage: {}, ...extra,
});

afterEach(cleanup);

// Somebody without a project of an area (here workspaces, the default) sees the budgets they may draw from that offer it; the one approving on the spot is ticked with what it gives, the other waits for approval, one already used is shown as such — and creating sends one request per ticked budget, with only that area's resources.
describe('StartView', () => {
    it('ticks the budgets that approve on the spot and creates their projects', async () => {
        const created = [];
        const api = fakeNodesApi();
        api.listEligibleForMe = async () => ({ items: [
            budget('b_ws', 'Workspaces Studierende', { auto_approve: { per_requester_limit: { 'ws-vcpu-hours': 200 } } }),
            budget('b_kurs', 'Kurs ML', {}),
            budget('b_had', 'Workspaces Kurs', { auto_approve: { per_requester_limit: { 'ws-vcpu-hours': 100 } } }),
            budget('b_os', 'Nur OpenStack', { available_resources: ['cores'] }),
            budget('b_llm', 'Nur LLM', { available_resources: ['llm-mtokens'] }),
        ], total: 5 });
        api.listMine = async () => ({ items: [{ id: 'p_1', kind: 'project', parent_id: 'b_had', status: 'approved', limit: { 'ws-vcpu-hours': 100 } }], total: 1 });
        api.createNode = async (body) => { created.push(body); return { id: 'p_new', ...body }; };
        globalThis.__testApi = api;

        renderView(<StartView />, { config: CONFIG });
        await waitFor(() => expect(screen.getByText('Workspaces Studierende')).toBeTruthy());
        expect(screen.queryByText('Nur OpenStack')).toBeNull();
        expect(screen.queryByText('Nur LLM')).toBeNull();
        const boxes = screen.getAllByRole('checkbox');
        expect(boxes.map(b => b.checked)).toEqual([true, false, false]);
        expect(boxes[2].disabled).toBe(true);

        fireEvent.click(screen.getByRole('button', { name: /1/ }));
        await waitFor(() => expect(created.length).toBe(1));
        expect(created[0].parent_id).toBe('b_ws');
        expect(created[0].limit).toEqual({ 'ws-vcpu-hours': 200 });
    });
});
