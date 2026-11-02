// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderView } from '/test/render-harness.jsx';

// Does each GPU view render at all, with data in it? Same question as llm/views.render.test.jsx.

const ME = {
    email: 'dennis.pfisterer@dhbw.de', role: 'admin', tier: 'staff', jupyter_url: 'https://jupyter.example',
};

// The workspace settings ask the AI service only where this deployment has it.
vi.mock('/features.js', async (importOriginal) => ({ ...(await importOriginal()), llmEnabled: true }));
// A test switches to a project manager who is not an admin with globalThis.__llmIsAdmin = false.
vi.mock('/llm/use-llm-me.jsx', () => ({
    useLlmMe: () => ({ query: { isPending: false, isError: false }, me: ME, hasAccess: true, isFleetAdmin: true, isAdmin: globalThis.__llmIsAdmin ?? true }),
}));
vi.mock('/gpu/api-gpu.jsx', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, useGpuApi: () => globalThis.__gpuApi };
});

const SERVERS = [
    { name: '', ready: true, url: 'https://jupyter.example/user/a/', profile: 'cpu-gpukernel' },
    { name: 'kurs-gpu', ready: false, pending: 'spawn', url: 'https://jupyter.example/user/a/kurs-gpu/', profile: 'gpu' },
];

const USAGE = {
    from: '2026-09-11T00:00:00Z', to: '2026-10-10T00:00:00Z',
    total: { days: 3, server_hours: 12, vcpu_hours: 8, ram_gb_hours: 30, gpu_hours: 2, cpu_used_hours: 2, ram_used_gb_hours: 10, home_gb_days: 4.5 },
    per_day: [],
    entries: [
        { project: 'group:wwi23seb', person: 'a@dhbw.de', profile: 'cpu', days: 2, server_hours: 8, vcpu_hours: 4, ram_gb_hours: 16, gpu_hours: 0, cpu_used_hours: 1, ram_used_gb_hours: 6, home_gb_days: 0 },
        { project: 'group:wwi23seb', person: 'b@dhbw.de', profile: 'pytorch', gpu_class: 'l4-3q', days: 1, server_hours: 2, vcpu_hours: 2, ram_gb_hours: 4, gpu_hours: 2, cpu_used_hours: 1, ram_used_gb_hours: 4, home_gb_days: 0 },
        { project: 'group:wwi23seb', person: 'a@dhbw.de', profile: 'home', days: 3, server_hours: 0, vcpu_hours: 0, ram_gb_hours: 0, gpu_hours: 0, cpu_used_hours: 0, ram_used_gb_hours: 0, home_gb_days: 4.5 },
    ],
};

const PROJECTS = [
    { slug: 'wwi23seb-ml', tree_node: 'p_ml', name: 'Machine Learning WWI23SEB', description: 'Übungen', role: 'manager', profiles: ['cpu', 'gpu'], gpu_classes: ['l4-3q'],
      members: [{ token: 'group:wwi23seb', role: 'member' }], image_base: 'tensorflow',
      image_git_url: 'https://github.com/o/ml-kurs', project_image: 'reg/envs/github-com-o-ml-kurs:0123456789ab-v1.1.0',
      image_build: { status: 'building', image: 'reg/envs/github-com-o-ml-kurs:89abcdef0123-v1.1.0', commit: '89abcdef0123456', branch: 'main', updated_at: '2026-10-14T08:00:00Z' },
      limits: { servers_per_person: 2, cpu_per_person: 4, ram_gb_per_person: 16, gpus_per_person: 1 }, gpus_by_class: { "l4-3q": 4 },
      budgets: [{ unit: 'vcpu_hours', window: '30d', amount: 40, per_person: true }],
      budget_status: [{ unit: 'vcpu_hours', window: '30d', amount: 40, per_person: true, used: 34.5, exhausted: false }],
      release: { gpu: { idle_closed_minutes: 10 } }, release_max: { gpu: { idle_open_minutes: 60, max_hours: 0 } },
      release_ceiling: { cpu: { idle_open_minutes: 120, idle_closed_minutes: 120, max_hours: 12 }, gpu: { idle_open_minutes: 60, idle_closed_minutes: 30, max_hours: 0 } },
      release_effective: { servers: { cpu: { idle_open: 7200, idle_closed: 7200, max: 43200 }, gpu: { idle_open: 3600, idle_closed: 600, max: 0 } }, kernel: { idle_open: 3600, idle_closed: 600, max: 0 } } },
    { slug: 'statistik', name: 'Statistik', role: 'member', profiles: ['cpu'], gpu_classes: [], members: [],
      limits: { servers_per_person: 1 }, budgets: [], ends_at: '2027-03-31T00:00:00Z' },
];
const JOBS = [
    { id: 'j-1', name: 'training-1', person: 'dennis.pfisterer@dhbw.de', project: 'wwi23seb-ml', gpu_class: 'l4-3q', gpus: 1, max_hours: 4, state: 'queued', position: 2, submitted: '2026-10-31T10:00:00Z', command: 'python train.py' },
    { id: 'j-2', name: 'eval', person: 'b@dhbw.de', project: 'wwi23seb-ml', gpu_class: 'l4-3q', gpus: 1, max_hours: 2, state: 'failed', exit_code: 1, reason: 'Error', submitted: '2026-10-30T10:00:00Z', started: '2026-10-30T10:01:00Z', ended: '2026-10-30T10:31:00Z', gpu_hours: 0.5, evictions: 1, command: 'python eval.py' },
];
const START_OPTIONS = { profiles: [], projects: [{ slug: 'wwi23seb-ml', name: 'Machine Learning WWI23SEB', gpu_classes: [{ id: 'l4-3q', name: 'L4 klein', hardware: 'L4-3Q · 3 GB' }, { id: 'l4-6q', name: 'L4 mittel' }] }, { slug: 'statistik', name: 'Statistik', gpu_classes: [] }] };
const JOB_PROJECTS = PROJECTS.map(p => (p.slug === 'wwi23seb-ml' ? { ...p, limits: { ...p.limits, jobs_per_person: 2, job_max_hours: 8 } } : p));

const CATALOG = { profiles: [{ slug: 'cpu', name: 'CPU' }, { slug: 'gpu', name: 'GPU', gpu_class: 'l4-3q' }], gpuClasses: ['l4-3q'],
    bases: [{ id: 'python', name: 'Python', image: 'reg/platform/base-python:v2' }, { id: 'pytorch', name: 'PyTorch', image: 'reg/platform/base-pytorch:v2', default: true }, { id: 'tensorflow', name: 'TensorFlow / Keras', image: 'reg/platform/base-tensorflow:v2' }] };

const { GpuServers } = await import('/gpu/servers.jsx');
const { GpuJobs, GpuJobDetail } = await import('/gpu/jobs.jsx');
const { GpuJobSubmit } = await import('/gpu/job-submit.jsx');
const { GpuUsage, groupUsage } = await import('/gpu/usage.jsx');
const { WorkspaceSettingsPanel, useWorkspaceSettings } = await import('/gpu/workspace-settings.jsx');

function SettingsTab({ nodeId }) {
    const draft = useWorkspaceSettings(nodeId, true);
    return draft.available ? <WorkspaceSettingsPanel draft={draft} /> : <span>none</span>;
}

let consoleErrors = [];
beforeEach(() => {
    globalThis.__gpuApi = {
        listServers: async () => SERVERS,
        projectImageLog: async () => 'log',
        rebuildProjectImage: async () => ({}),
        updateProjectImage: async () => ({}),
        listCredentials: async () => [],
        setCredential: async () => [],
        deleteCredential: async () => undefined,
        myWorkspaceUsage: async () => USAGE,
        listProjects: async () => PROJECTS,
        catalog: async () => CATALOG,
        workspaceUsage: async () => USAGE,
        listJobs: async () => JOBS,
        getJob: async (id) => JOBS.find(j => j.id === id),
        jobLog: async () => ({ log: 'epoch 1/10' }),
        cancelJob: async () => ({}),
        submitJob: async () => JOBS[0],
        startOptions: async () => START_OPTIONS,
    };
    globalThis.__llmIsAdmin = true;
    consoleErrors = [];
    vi.spyOn(console, 'error').mockImplementation((...args) => { consoleErrors.push(args.join(' ')); });
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

function expectNoRenderFailure() {
    const fatal = consoleErrors.filter(e =>
        /Maximum update depth|is not defined|is not a function|Cannot read/.test(e));
    expect(fatal).toEqual([]);
}

describe('the GPU views render', () => {
    it('Servers lists the servers', async () => {
        renderView(<GpuServers />);
        expect(await screen.findByText('kurs-gpu')).toBeTruthy();
        expectNoRenderFailure();
    });

    it('the workspace settings tab shows a project the AI service knows, with what is used of it', async () => {
        renderView(<SettingsTab nodeId="p_ml" />);
        expect(await screen.findByText(/34.5 (von|of) 40/)).toBeTruthy();
        // The project image from Git: its build and the image in use until the build is ready.
        expect(screen.getByText('reg/envs/github-com-o-ml-kurs:0123456789ab-v1.1.0')).toBeTruthy();
        expect(screen.getByText('89abcdef0123 (main)')).toBeTruthy();
        // The project id, which the command line takes as --project.
        expect(screen.getByText(/^(Projekt-ID|Project ID):$/)).toBeTruthy();
        expect(screen.getByText('wwi23seb-ml')).toBeTruthy();
        expect(screen.getByRole('button', { name: /(Projekt-ID kopieren|Copy project ID)/ })).toBeTruthy();
        expectNoRenderFailure();
    });

    it('the workspace settings tab lets an admin add budgets', async () => {
        renderView(<SettingsTab nodeId="p_ml" />);
        expect(await screen.findByText(/Grenze hinzufügen|Add a limit/)).toBeTruthy();
        expect(screen.queryByText(/legen Admins fest|set by admins/)).toBeNull();
    });

    it('the workspace settings tab shows a manager the settings of the admins without offering to change them', async () => {
        globalThis.__llmIsAdmin = false;
        renderView(<SettingsTab nodeId="p_ml" />);
        expect(await screen.findByText(/legen Admins fest|set by admins/)).toBeTruthy();
        expect(screen.queryByText(/Grenze hinzufügen|Add a limit/)).toBeNull();
        // The environment stays editable.
        expect(screen.getByText('89abcdef0123 (main)')).toBeTruthy();
        expectNoRenderFailure();
    });

    it('the workspace settings tab lets a manager choose the release times within the budget', async () => {
        globalThis.__llmIsAdmin = false;
        renderView(<SettingsTab nodeId="p_ml" />);
        expect(await screen.findByText(/^(Rückgabezeiten|Release times)$/)).toBeTruthy();
        // The budget's value as placeholder, the ceiling below, no upper bound offered where the budget allows it (own GPUs).
        expect(screen.getByPlaceholderText(/(wie Budget|as budget): 60/)).toBeTruthy();
        expect(screen.getAllByText(/(höchstens|at most) 120/).length).toBeGreaterThan(0);
        expect(screen.getAllByLabelText(/(ohne Obergrenze|no upper bound)/).length).toBe(1);
        expect(screen.queryByText(/(Höchstwerte des Budgets|Budget maximums)/)).toBeNull();
        expectNoRenderFailure();
    });

    it('the workspace settings tab shows admins the budget maximums', async () => {
        renderView(<SettingsTab nodeId="p_ml" />);
        expect(await screen.findByText(/(Höchstwerte des Budgets|Budget maximums)/)).toBeTruthy();
        expect(screen.getByText(/(Zurzeit gilt|Currently in effect)/)).toBeTruthy();
        expectNoRenderFailure();
    });

    it('the workspace settings tab stays away for a project the AI service does not know', async () => {
        renderView(<SettingsTab nodeId="p_unknown" />);
        expect(await screen.findByText('none')).toBeTruthy();
    });

    it('Batch jobs lists the jobs with their place in the queue and their outcome', async () => {
        globalThis.__gpuApi.listProjects = async () => JOB_PROJECTS;
        renderView(<GpuJobs />);
        expect(await screen.findByText('training-1')).toBeTruthy();
        expect(screen.getByText(/(Platz 2 in der Warteschlange|Place 2 in the queue)/)).toBeTruthy();
        expect(screen.getByText(/(Exit-Code|Exit code) 1 · Error/)).toBeTruthy();
        // Another person's job (a manager's view) names the person.
        expect(screen.getByText('b@dhbw.de')).toBeTruthy();
        // Without a chosen project there is no project id to show.
        expect(screen.queryByText(/^(Projekt-ID|Project ID):$/)).toBeNull();
        expectNoRenderFailure();
    });

    it('Batch jobs filtered by a project show its id to copy', async () => {
        globalThis.__gpuApi.listProjects = async () => JOB_PROJECTS;
        window.history.replaceState(null, '', '/jobs?project=wwi23seb-ml');
        try {
            renderView(<GpuJobs />);
            expect(await screen.findByText('training-1')).toBeTruthy();
            expect(screen.getByText(/^(Projekt-ID|Project ID):$/)).toBeTruthy();
            expect(screen.getByText('wwi23seb-ml')).toBeTruthy();
            expect(screen.getByRole('button', { name: /(Projekt-ID kopieren|Copy project ID)/ })).toBeTruthy();
        } finally {
            window.history.replaceState(null, '', '/');
        }
        expectNoRenderFailure();
    });

    it('a job shows its output and offers to cancel it while it runs', async () => {
        globalThis.__gpuApi.getJob = async () => ({ ...JOBS[0], state: 'running', position: 0, started: '2026-10-31T10:05:00Z' });
        renderView(<GpuJobDetail params={{ id: 'j-1' }} />);
        expect(await screen.findByText('epoch 1/10')).toBeTruthy();
        expect(screen.getByRole('button', { name: /^(Abbrechen|Cancel)$/ })).toBeTruthy();
        expectNoRenderFailure();
    });

    it('a finished job offers no cancelling', async () => {
        renderView(<GpuJobDetail params={{ id: 'j-2' }} />);
        expect(await screen.findByText('epoch 1/10')).toBeTruthy();
        expect(screen.queryByRole('button', { name: /^(Abbrechen|Cancel)$/ })).toBeNull();
        expectNoRenderFailure();
    });

    it('the submit form offers only the projects that allow jobs, with their maximum run time', async () => {
        globalThis.__gpuApi.listProjects = async () => JOB_PROJECTS;
        renderView(<GpuJobSubmit />);
        expect(await screen.findByText('Machine Learning WWI23SEB')).toBeTruthy();
        expect(screen.queryByText('Statistik')).toBeNull();
        expect(screen.getByText(/(höchstens|at most) 8 h/)).toBeTruthy();
        expect(screen.getByDisplayValue('4')).toBeTruthy();
        // The same job on the command line, following the form: two GPU classes, so the chosen one is named; the run time is below the project's maximum.
        expect(screen.getByText(/^(Per Kommandozeile|On the command line)$/)).toBeTruthy();
        const code = () => document.querySelector('code.hljs').textContent;
        expect(code()).toMatch(/^dhbw-cloud job submit --project wwi23seb-ml --gpu-class l4-3q --max-hours 4 -- <(Befehl|command)>$/);
        fireEvent.change(screen.getByPlaceholderText('python train.py --epochs 10'), { target: { value: 'python train.py --epochs 10' } });
        expect(code()).toBe("dhbw-cloud job submit --project wwi23seb-ml --gpu-class l4-3q --max-hours 4 -- 'python train.py --epochs 10'");
        expect(screen.getByText(/pip install dhbw-cloud/)).toBeTruthy();
        expectNoRenderFailure();
    });

    it('the submit form says when no project allows jobs', async () => {
        renderView(<GpuJobSubmit />);
        expect(await screen.findByText(/(erlaubt Batch-Jobs|allows batch jobs)/)).toBeTruthy();
        expectNoRenderFailure();
    });

    it('Usage shows the units per profile', async () => {
        renderView(<GpuUsage />);
        expect(await screen.findByText('pytorch')).toBeTruthy();
        expect(screen.getByText('home')).toBeTruthy();
        expectNoRenderFailure();
    });
});

describe('groupUsage', () => {
    it('sums by a dimension and counts people', () => {
        const byProject = groupUsage(USAGE.entries, 'project');
        expect(byProject).toHaveLength(1);
        expect(byProject[0]).toMatchObject({ name: 'group:wwi23seb', people: 2, vcpu_hours: 6, gpu_hours: 2, home_gb_days: 4.5 });
        expect(byProject[0].cpu_utilization).toBeCloseTo(2 / 6);
        const byClass = groupUsage(USAGE.entries, 'gpu_class');
        expect(byClass.map(g => g.name).sort()).toEqual(['', 'l4-3q']);
    });
});
