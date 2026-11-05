// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
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

// Whose LLM tokens the workspace's key draws from: what the service names as the project's default (its setting, its own tokens, the person's first LLM project), another LLM project or none only when chosen (in the form or the link).
describe('start page: LLM', () => {
    const ws = { slug: 'ws', name: 'Workspace-Testprojekt', profiles: ['cpu'], storage_gb: 15 };
    function api(llmProjects, llm = {}) {
        const started = [];
        globalThis.__gpuApi = {
            startOptions: async () => ({ projects: [{ ...ws, ...llm }], profiles: PROFILES, llm_projects: llmProjects }),
            listServers: async () => [],
            startServer: async (body) => { started.push(body); return { name: 'ws-cpu', project: 'ws' }; },
            serverProgress: async () => ({ events: [], starting: true }),
        };
        globalThis.__nodesApi = nodesApi();
        return started;
    }
    async function startAndGetBody(started) {
        fireEvent.click(await screen.findByRole('button', { name: i18n.t('gpu.start.start') }));
        await waitFor(() => expect(started.length).toBe(1));
        return started[0];
    }
    const mark = (label) => `${label} (${i18n.t('gpu.start.llmDefaultMark')})`;
    it('uses the project\'s own LLM tokens when it has them, sent as the default', async () => {
        const started = api([{ slug: 'other', name: 'Anderes' }, { slug: 'ws', name: 'Workspace-Testprojekt' }], { llm_default: 'ws', llm_default_source: 'project' });
        renderView(<GpuStart />);
        expect(await screen.findByText(i18n.t('gpu.start.llmOwn'))).toBeTruthy();
        expect(screen.getByDisplayValue(mark('Workspace-Testprojekt'))).toBeTruthy();
        expect((await startAndGetBody(started)).llm_project).toBe('');
    });
    it('shows the project\'s setting', async () => {
        api([{ slug: 'other', name: 'Anderes' }], { default_llm_project: 'other', llm_default: 'other', llm_default_source: 'preset' });
        renderView(<GpuStart />);
        expect(await screen.findByText(i18n.t('gpu.start.llmPreset', { project: 'Anderes' }))).toBeTruthy();
    });
    it('names the fallback to the person\'s first LLM project', async () => {
        api([{ slug: 'other', name: 'Anderes' }], { llm_default: 'other', llm_default_source: 'fallback' });
        renderView(<GpuStart />);
        expect(await screen.findByText(i18n.t('gpu.start.llmFallback', { project: 'Anderes' }))).toBeTruthy();
    });
    it('says that the set LLM project is not available and starts without LLM', async () => {
        const started = api([{ slug: 'other', name: 'Anderes' }], { default_llm_project: 'kurs-llm', llm_default: 'none', llm_default_source: 'preset', llm_default_unavailable: true });
        renderView(<GpuStart />);
        expect(await screen.findByText(i18n.t('gpu.start.llmPresetUnavailable', { project: 'kurs-llm' }))).toBeTruthy();
        expect(screen.getByDisplayValue(mark(i18n.t('gpu.start.llmNone')))).toBeTruthy();
        expect((await startAndGetBody(started)).llm_project).toBe('');
    });
    it('takes another LLM project or none from the link', async () => {
        window.history.replaceState({}, '', '/workspaces/servers/start?project=ws&llm=none');
        const started = api([{ slug: 'other', name: 'Anderes' }], { llm_default: 'other', llm_default_source: 'fallback' });
        renderView(<GpuStart />);
        expect(await screen.findByText(i18n.t('gpu.start.llmNoneHint'))).toBeTruthy();
        expect((await startAndGetBody(started)).llm_project).toBe('none');
    });
    it('says that an LLM project from the link is not available and uses the default', async () => {
        window.history.replaceState({}, '', '/workspaces/servers/start?project=ws&llm=fremd');
        api([{ slug: 'ws', name: 'Workspace-Testprojekt' }], { llm_default: 'ws', llm_default_source: 'project' });
        renderView(<GpuStart />);
        expect(await screen.findByText(i18n.t('gpu.start.unknownLlm', { project: 'fremd' }))).toBeTruthy();
        expect(screen.getByText(i18n.t('gpu.start.llmOwn'))).toBeTruthy();
    });
    it('without any LLM project says the workspace has none', async () => {
        const started = api([], { llm_default: 'none', llm_default_source: 'none' });
        renderView(<GpuStart />);
        expect(await screen.findByText(i18n.t('gpu.start.llmNoProjects'))).toBeTruthy();
        expect((await startAndGetBody(started)).llm_project).toBe('');
    });
});
