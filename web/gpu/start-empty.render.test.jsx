// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import i18n from '/i18n/index.js';
import { renderView } from '/test/render-harness.jsx';

// The start page offers exactly the projects a workspace can start in, shows the only one as set, and without any explains the way to a project instead of an empty choice.

vi.mock('/features.js', async (importOriginal) => ({ ...(await importOriginal()), llmEnabled: true, cloudProjectsEnabled: true }));
vi.mock('/gpu/api-gpu.jsx', async (importOriginal) => ({ ...(await importOriginal()), useGpuApi: () => globalThis.__gpuApi }));
vi.mock('/projects/api-nodes.jsx', async (importOriginal) => ({ ...(await importOriginal()), useNodesApi: () => globalThis.__nodesApi }));

const { GpuStart } = await import('/gpu/start.jsx');
const { workspaceOffers } = await import('/gpu/start-empty.jsx');

const PROFILES = [{ slug: 'cpu' }, { slug: 'gpu', gpu: true }];
const RESOURCES = [
    { id: 'ws-vcpu-hours', name: 'vCPU hours', area: 'workspaces', provider: 'aiaas' },
    { id: 'ws-profile-cpu', name: 'CPU', area: 'workspaces', provider: 'aiaas', kind: 'bool' },
    { id: 'cores', name: 'Cores' },
];
const POOL = { id: 'b_pool', name: 'Prof-Andreas-Dittrich', status: 'approved', limit: { 'ws-vcpu-hours': 100 }, usage: {}, auto_approve: {} };
const ASK = { id: 'b_ask', name: 'Kurs', status: 'approved', limit: { 'ws-vcpu-hours': 100 }, usage: {} };
const CLOUD = { id: 'b_cloud', name: 'Cloud only', status: 'approved', limit: { cores: 10 }, available_resources: ['cores'] };

function nodesApi({ managed = [], eligible = [] } = {}) {
    return {
        getConfig: async () => ({ resources: RESOURCES }),
        listMyBudgets: async () => ({ items: managed, total: managed.length }),
        listEligibleForMe: async () => ({ items: eligible, total: eligible.length }),
        listMine: async () => ({ items: [], total: 0 }),
    };
}

beforeEach(() => {
    window.history.replaceState({}, '', '/workspaces/servers/start');
});
afterEach(() => {
    cleanup();
    delete globalThis.__gpuApi;
    delete globalThis.__nodesApi;
});

describe('workspaceOffers', () => {
    it('names the budgets offering workspaces, those that give a project at once first', () => {
        const offers = workspaceOffers({ managed: [], eligible: [ASK, POOL, CLOUD], resources: RESOURCES, ownProjects: [] });
        expect(offers.map(o => [o.budget.id, o.instant])).toEqual([['b_pool', true], ['b_ask', false]]);
    });
    it('counts a budget the person manages as at once, and only once', () => {
        const offers = workspaceOffers({ managed: [ASK], eligible: [ASK], resources: RESOURCES, ownProjects: [] });
        expect(offers.map(o => [o.budget.id, o.instant])).toEqual([['b_ask', true]]);
    });
    it('does not call a budget at once whose auto-approve has no room left', () => {
        const full = { ...POOL, usage: { approved: { limit: { 'ws-vcpu-hours': 100 } } } };
        const offers = workspaceOffers({ eligible: [full], resources: RESOURCES });
        expect(offers[0].instant).toBe(false);
    });
});

describe('start page', () => {
    it('without a project explains the way to one and names the budget that gives it at once', async () => {
        globalThis.__gpuApi = { startOptions: async () => ({ projects: [], profiles: PROFILES }), listServers: async () => [] };
        globalThis.__nodesApi = nodesApi({ eligible: [POOL] });
        renderView(<GpuStart />);
        expect(await screen.findByText(i18n.t('gpu.start.empty.title'))).toBeTruthy();
        expect(await screen.findByText(i18n.t('gpu.start.empty.instant', { budget: 'Prof-Andreas-Dittrich' }))).toBeTruthy();
        expect(screen.getByText(i18n.t('gpu.start.empty.create'))).toBeTruthy();
        expect(screen.queryByRole('combobox')).toBeNull();
    });
    it('says why a project without an environment offers nothing to start', async () => {
        globalThis.__gpuApi = { startOptions: async () => ({ projects: [{ slug: 'leer', name: 'Leer', profiles: [] }], profiles: PROFILES }), listServers: async () => [] };
        globalThis.__nodesApi = nodesApi();
        renderView(<GpuStart />);
        expect(await screen.findByText(i18n.t('gpu.start.empty.noEnv', { count: 1, projects: '„Leer“' }))).toBeTruthy();
        expect(await screen.findByText(i18n.t('gpu.start.empty.noBudget'))).toBeTruthy();
        expect(screen.getByText(i18n.t('gpu.start.empty.toProjects'))).toBeTruthy();
    });
    it('shows the only startable project as set, without a choice', async () => {
        globalThis.__gpuApi = {
            startOptions: async () => ({ projects: [{ slug: 'leer', name: 'Leer', profiles: [] }, { slug: 'ws', name: 'Workspace-Testprojekt', profiles: ['cpu'], storage_gb: 15 }], profiles: PROFILES }),
            listServers: async () => [],
        };
        globalThis.__nodesApi = nodesApi();
        renderView(<GpuStart />);
        expect(await screen.findByText('Workspace-Testprojekt')).toBeTruthy();
        expect(screen.getByText(i18n.t('gpu.start.introSingle'))).toBeTruthy();
        expect(screen.getByText(`(${i18n.t('gpu.start.onlyProject')})`)).toBeTruthy();
        expect(screen.queryByText('Leer')).toBeNull();
        expect(screen.queryByRole('combobox')).toBeNull();
        // An AI service from before sends no local storage: no line about it.
        expect(screen.queryByText(i18n.t('gpu.start.scratch', { gb: 1 }))).toBeNull();
    });
    it('names the local storage outside the home the AI service sends', async () => {
        globalThis.__gpuApi = {
            startOptions: async () => ({ projects: [{ slug: 'ws', name: 'Workspace-Testprojekt', profiles: ['cpu'], storage_gb: 15, scratch_gb: 1 }], profiles: PROFILES }),
            listServers: async () => [],
        };
        globalThis.__nodesApi = nodesApi();
        renderView(<GpuStart />);
        expect(await screen.findByText(i18n.t('gpu.start.scratch', { gb: 1 }))).toBeTruthy();
    });
    it('points a project on a free image that allows CPU + GPU kernel to a base and the guide', async () => {
        globalThis.__gpuApi = {
            startOptions: async () => ({ projects: [{ slug: 'ws', name: 'Eigenes Image', profiles: ['cpu'], image_derived: false, split_needs_base: true, storage_gb: 15 }], profiles: PROFILES }),
            listServers: async () => [],
        };
        globalThis.__nodesApi = nodesApi();
        renderView(<GpuStart />);
        expect(await screen.findByText(i18n.t('gpu.start.splitNeedsBase'))).toBeTruthy();
        expect(screen.getByText(i18n.t('gpu.start.splitNeedsBaseLink')).closest('a').getAttribute('href')).toBe('https://dhbw.cloud/anleitungen/cpu-gpu-kernel');
    });
    it('says nothing about bases where the project has no CPU + GPU kernel to miss', async () => {
        globalThis.__gpuApi = {
            startOptions: async () => ({ projects: [{ slug: 'ws', name: 'Eigenes Image', profiles: ['cpu'], image_derived: false, storage_gb: 15 }], profiles: PROFILES }),
            listServers: async () => [],
        };
        globalThis.__nodesApi = nodesApi();
        renderView(<GpuStart />);
        expect(await screen.findByText('Eigenes Image')).toBeTruthy();
        expect(screen.queryByText(i18n.t('gpu.start.splitNeedsBase'))).toBeNull();
    });
});
