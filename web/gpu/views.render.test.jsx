// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { renderView } from '/test/render-harness.jsx';

// Does each GPU view render at all, with data in it? Same question as llm/views.render.test.jsx.

const ME = {
    email: 'dennis.pfisterer@dhbw.de', role: 'admin', tier: 'staff', jupyter_url: 'https://jupyter.example',
};

// The workspace settings ask the AI service only where this deployment has it.
// And the role provider, through which a project's groups look up the people of its course groups.
vi.mock('/features.js', async (importOriginal) => ({ ...(await importOriginal()), llmEnabled: true, groupsEnabled: true }));
vi.mock('/groups/api-groups.jsx', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, useGroupsApi: () => globalThis.__groupsApi };
});
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
      areas: [{ mount: 'dhbw/project', dir: 'project-shared', read_only: false }],
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
    { id: 'j-3', name: 'training-0', person: 'dennis.pfisterer@dhbw.de', project: 'wwi23seb-ml', gpu_class: 'l4-3q', gpus: 1, max_hours: 4, state: 'succeeded', exit_code: 0, submitted: '2026-10-29T10:00:00Z', started: '2026-10-29T10:01:00Z', ended: '2026-10-29T11:01:00Z', gpu_hours: 1, evictions: 0, command: 'python train.py', result: 'accuracy 0.83' },
];
const START_OPTIONS = { profiles: [], projects: [{ slug: 'wwi23seb-ml', name: 'Machine Learning WWI23SEB', gpu_classes: [{ id: 'l4-3q', name: 'L4 klein', hardware: 'L4-3Q · 3 GB' }, { id: 'l4-6q', name: 'L4 mittel' }] }, { slug: 'statistik', name: 'Statistik', gpu_classes: [] }] };
const JOB_PROJECTS = PROJECTS.map(p => (p.slug === 'wwi23seb-ml' ? { ...p, limits: { ...p.limits, jobs_per_person: 2, job_max_hours: 8 } } : p));

const CATALOG = { profiles: [{ slug: 'cpu', name: 'CPU' }, { slug: 'gpu', name: 'GPU', gpu_class: 'l4-3q' }], gpuClasses: ['l4-3q'],
    bases: [{ id: 'python', name: 'Python', image: 'reg/platform/base-python:v2' }, { id: 'pytorch', name: 'PyTorch', image: 'reg/platform/base-pytorch:v2', default: true }, { id: 'tensorflow', name: 'TensorFlow / Keras', image: 'reg/platform/base-tensorflow:v2' }] };

const { GpuServers } = await import('/gpu/servers.jsx');
const { GpuJobs, GpuJobDetail } = await import('/gpu/jobs.jsx');
const { GpuJobSubmit } = await import('/gpu/job-submit.jsx');
const { GpuUsage, groupUsage } = await import('/gpu/usage.jsx');
const { rebaseDraft, useWorkspaceSettings, workspaceSettingsItems } = await import('/gpu/workspace-settings.jsx');
const { FormSections } = await import('/projects/component-form-modal.jsx');
const { ProjectId } = await import('/gpu/project-id.jsx');

// SettingsTab is the workspace settings as the project dialog shows them: the project id in the header, one entry per section.
function SettingsTab({ nodeId }) {
    const { t } = useTranslation();
    const draft = useWorkspaceSettings(nodeId, true);
    const [active, setActive] = useState('workspaces-environment');
    return draft.available
        ? <FormSections value={active} onChange={setActive} header={<ProjectId slug={draft.project?.slug} />} groups={[{ key: 'workspaces', label: 'Workspaces', mark: 'instant', items: workspaceSettingsItems(t, draft) }]} />
        : <span>none</span>;
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
        listJobs: async () => ({ items: JOBS, total: JOBS.length, limit: 50, offset: 0 }),
        getJob: async (id) => JOBS.find(j => j.id === id),
        jobLog: async () => ({ log: 'epoch 1/10' }),
        cancelJob: async () => ({}),
        submitJob: async () => JOBS[0],
        startOptions: async () => START_OPTIONS,
    };
    globalThis.__groupsApi = {
        effectiveMembers: async () => [],
        getGroup: async () => ({ memberships: [] }),
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
        // The tab waits for several queries (project, usage, LLM projects) before it shows the usage; the default 1 s is too short on a busy CI runner.
        expect(await screen.findByText(/34.5 (von|of) 40/, {}, { timeout: 5000 })).toBeTruthy();
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
        expect(await screen.findByText(/Grenze hinzufügen|Add a Limit/)).toBeTruthy();
        expect(screen.queryByText(/legen Admins fest|set by admins/)).toBeNull();
    });

    it('the workspace settings tab shows a manager the settings of the admins without offering to change them', async () => {
        globalThis.__llmIsAdmin = false;
        renderView(<SettingsTab nodeId="p_ml" />);
        expect((await screen.findAllByText(/legen Admins fest|set by admins/)).length).toBe(2);
        expect(screen.queryByText(/Grenze hinzufügen|Add a Limit/)).toBeNull();
        // The environment stays editable.
        expect(screen.getByText('89abcdef0123 (main)')).toBeTruthy();
        expectNoRenderFailure();
    });

    it('the workspace settings tab lets a manager make groups and deal out the members', async () => {
        globalThis.__llmIsAdmin = false;
        const project = { ...PROJECTS[0], storage_gb: 20, groups: [],
            members: [{ token: 'user:a@dhbw.de', role: 'member' }, { token: 'user:b@dhbw.de', role: 'member' }, { token: 'user:c@dhbw.de', role: 'reader' }, { token: 'user:d@dhbw.de', role: 'member' }, { token: 'user:m@dhbw.de', role: 'manager' }] };
        globalThis.__gpuApi.listProjects = async () => [project, PROJECTS[1]];
        renderView(<SettingsTab nodeId="p_ml" />);
        fireEvent.click(await screen.findByRole('tab', { name: /^(Gruppen|Groups)$/ }));
        expect(screen.getByText(/(Noch keine Gruppen|No groups yet)/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /^(Verteilen …|Deal Out …)$/ }));
        let dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText(/^4 (Personen sind noch in keiner Gruppe|people are in no group yet)/)).toBeTruthy();
        // No places per group: only new groups are offered. Four of size 4 make one group; of size 2, two.
        expect(within(dialog).queryByText(/(Freie Plätze|free places)/)).toBeNull();
        expect(within(dialog).getByText(/→ 1 (neue Gruppe|new group): gruppe-1 \(4/)).toBeTruthy();
        fireEvent.change(within(dialog).getByLabelText(/(Personen je neuer Gruppe|People per new group)/), { target: { value: '2' } });
        expect(within(dialog).getByText(/→ 2 (neue Gruppen|new groups): gruppe-1, gruppe-2 \(2, 2/)).toBeTruthy();
        // Cancel changes nothing.
        fireEvent.click(within(dialog).getByRole('button', { name: /^(Abbrechen|Cancel)$/ }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(screen.queryByDisplayValue('gruppe-1')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /^(Verteilen …|Deal Out …)$/ }));
        dialog = await screen.findByRole('dialog');
        fireEvent.change(within(dialog).getByLabelText(/(Personen je neuer Gruppe|People per new group)/), { target: { value: '2' } });
        fireEvent.click(within(dialog).getByRole('button', { name: /^(Verteilen|Deal Out)$/ }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(screen.getByDisplayValue('gruppe-1')).toBeTruthy();
        expect(screen.getByDisplayValue('gruppe-2')).toBeTruthy();
        expect(screen.getByText('~/dhbw/groups/gruppe-1')).toBeTruthy();
        expect(screen.getAllByText('a@dhbw.de').length).toBeGreaterThan(0);
        expect(screen.queryByText('m@dhbw.de')).toBeNull();
        // Everyone placed: the button rests, with the reason beside it.
        expect(screen.getByRole('button', { name: /^(Verteilen …|Deal Out …)$/ }).disabled).toBe(true);
        expect(screen.getAllByText(/(Alle sind bereits in einer Gruppe|Everyone is in a group already)/).length).toBeGreaterThan(0);
        fireEvent.change(screen.getByDisplayValue('gruppe-2'), { target: { value: 'gruppe-1' } });
        expect(screen.getAllByText(/(gibt es schon|is taken)/).length).toBe(2);
        expectNoRenderFailure();
    });

    it('the deal-out dialog fills free places of the existing groups when there are places per group', async () => {
        globalThis.__llmIsAdmin = false;
        const project = { ...PROJECTS[0], storage_gb: 20, group_max_members: 2,
            groups: [{ id: '0000aaaa', name: 'g1', members: ['user:a@dhbw.de'] }, { id: '0000bbbb', name: 'g2', members: [] }, { id: '0000cccc', name: 'alt', members: [], archived: true }],
            members: ['a', 'b', 'c', 'd', 'e', 'f'].map(x => ({ token: `user:${x}@dhbw.de`, role: 'member' })) };
        globalThis.__gpuApi.listProjects = async () => [project, PROJECTS[1]];
        renderView(<SettingsTab nodeId="p_ml" />);
        fireEvent.click(await screen.findByRole('tab', { name: /^(Gruppen|Groups)$/ }));
        fireEvent.click(screen.getByRole('button', { name: /^(Verteilen …|Deal Out …)$/ }));
        const dialog = await screen.findByRole('dialog');
        fireEvent.click(within(dialog).getByRole('radio', { name: /(Freie Plätze|free places)/ }));
        // Three free places for five people: g1 one, g2 two, two left; the archived group gets none.
        expect(within(dialog).getByText(/→ g1 \+1, g2 \+2.*2 (Personen bleiben ohne Gruppe|people stay without a group)/)).toBeTruthy();
        fireEvent.click(within(dialog).getByRole('button', { name: /^(Verteilen|Deal Out)$/ }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(screen.getByText(/(Noch in keiner Gruppe|Not in a group yet) \(2\): e@dhbw.de, f@dhbw.de$/)).toBeTruthy();
        expectNoRenderFailure();
    });

    it('the workspace settings tab resolves course groups to their people, and says when a group is not visible', async () => {
        globalThis.__llmIsAdmin = false;
        const forbidden = Object.assign(new Error('forbidden'), { status: 403 });
        globalThis.__groupsApi = {
            getGroup: async (id) => (id === 'wwi24'
                ? { memberships: [{ member: 'user:s1@dhbw.de', relation: 'studierende' }, { member: 'user:s2@dhbw.de', relation: 'studierende' }, { member: 'user:doz@dhbw.de', relation: 'dozent' }] }
                : Promise.reject(forbidden)),
            effectiveMembers: async () => { throw forbidden; },
        };
        const project = { ...PROJECTS[0], storage_gb: 20, groups: [],
            members: [{ token: 'user:a@dhbw.de', role: 'member' }, { token: 'group:wwi24#studierende', role: 'member' }, { token: 'group:wwi25', role: 'member' }, { token: 'user:m@dhbw.de', role: 'manager' }] };
        globalThis.__gpuApi.listProjects = async () => [project, PROJECTS[1]];
        renderView(<SettingsTab nodeId="p_ml" />);
        fireEvent.click(await screen.findByRole('tab', { name: /^(Gruppen|Groups)$/ }));
        expect(await screen.findByText(/^2 (Personen|people)/)).toBeTruthy();
        expect(await screen.findByText(/(Mitglieder von wwi25 sind hier nicht einsehbar|members of wwi25 are not visible)/)).toBeTruthy();
        expect(screen.queryByText('s1@dhbw.de')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: /^(Verteilen …|Deal Out …)$/ }));
        const dialog = await screen.findByRole('dialog');
        fireEvent.change(within(dialog).getByLabelText(/(Personen je neuer Gruppe|People per new group)/), { target: { value: '1' } });
        fireEvent.click(within(dialog).getByRole('button', { name: /^(Verteilen|Deal Out)$/ }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        // a, s1 and s2 dealt into new groups; not the lecturer, who holds another relation, nor the manager.
        expect(screen.getAllByText('s1@dhbw.de').length).toBeGreaterThan(0);
        expect(screen.getAllByText('s2@dhbw.de').length).toBeGreaterThan(0);
        expect(screen.queryByText('doz@dhbw.de')).toBeNull();
        expect(screen.queryByText('m@dhbw.de')).toBeNull();
        expectNoRenderFailure();
    });

    it('the workspace settings tab has the group choice, places per group and who is in no group yet', async () => {
        globalThis.__llmIsAdmin = false;
        const project = { ...PROJECTS[0], storage_gb: 20, group_choice: true, group_max_members: 1,
            groups: [{ id: '0000aaaa', name: 'g1', members: ['user:a@dhbw.de', 'user:c@dhbw.de', 'group:alt'] }, { id: '0000bbbb', name: 'g2', members: [] }],
            members: [{ token: 'user:a@dhbw.de', role: 'member' }, { token: 'user:b@dhbw.de', role: 'member' }, { token: 'user:c@dhbw.de', role: 'member' }, { token: 'user:m@dhbw.de', role: 'manager' }] };
        globalThis.__gpuApi.listProjects = async () => [project, PROJECTS[1]];
        renderView(<SettingsTab nodeId="p_ml" />);
        fireEvent.click(await screen.findByRole('tab', { name: /^(Gruppen|Groups)$/ }));
        // While it runs, the managers are told that members join; the folders are mounted as always.
        expect(screen.getByText(/(Gruppenwahl läuft|Group choice is open)/)).toBeTruthy();
        expect(screen.queryByText(/noch nicht eingehängt|not mounted for members/)).toBeNull();
        expect(screen.getByRole('switch', { name: /(Gruppenwahl durch Mitglieder|Members may join)/ }).checked).toBe(true);
        // No board any more: one list, with who is in no group yet (not the manager).
        expect(screen.queryByText('Board')).toBeNull();
        expect(screen.getByText(/(Noch in keiner Gruppe|Not in a group yet) \(1\): b@dhbw.de$/)).toBeTruthy();
        // Places: 2/1 in the group's badge, marked, the managers may.
        expect(screen.getByText('2/1')).toBeTruthy();
        expect(screen.getByText(/(Mehr Personen als Plätze|More people than places)/)).toBeTruthy();
        // A course group from before shows as an entry to remove, not as a choice; it goes.
        expect(screen.getByText(/(Kursgruppe alt|Course group alt)/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /^(alt entfernen|Remove alt)$/ }));
        expect(screen.queryByText(/(Kursgruppe alt|Course group alt)/)).toBeNull();
        expectNoRenderFailure();
    });

    for (const lang of ['de', 'en']) {
        it(`the groups tab shows no raw translation keys (${lang})`, async () => {
            const { default: i18n } = await import('/i18n/index.js');
            const before = i18n.language;
            await i18n.changeLanguage(lang);
            try {
                globalThis.__llmIsAdmin = false;
                const project = { ...PROJECTS[0], storage_gb: 20, group_choice: true, group_max_members: 2,
                    groups: [{ id: '0000aaaa', name: 'g1', members: ['user:a@dhbw.de', 'group:alt'], read_only: true, storage_gb: 5, used_gib: 1 }, { id: '0000bbbb', name: 'g2', members: [], archived: true }],
                    members: [{ token: 'user:a@dhbw.de', role: 'member' }, { token: 'user:b@dhbw.de', role: 'member' }, { token: 'user:m@dhbw.de', role: 'manager' }] };
                globalThis.__gpuApi.listProjects = async () => [project, PROJECTS[1]];
                renderView(<SettingsTab nodeId="p_ml" />);
                fireEvent.click(await screen.findByRole('tab', { name: /^(Gruppen|Groups)$/ }));
                const raw = /gpu\.projects\.|gpu\.groupChoice\./;
                expect(document.body.textContent).not.toMatch(raw);
                // Everything all assigned, and the dialogs and the menu, too.
                fireEvent.click(screen.getByRole('button', { name: /^(Verteilen …|Deal Out …)$/ }));
                const dialog = await screen.findByRole('dialog');
                fireEvent.click(within(dialog).getByRole('radio', { name: /(Freie Plätze|free places)/ }));
                expect(document.body.textContent).not.toMatch(raw);
                fireEvent.click(within(dialog).getByRole('button', { name: /^(Abbrechen|Cancel)$/ }));
                await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
                fireEvent.click(screen.getByRole('button', { name: /(Aktionen für Gruppe|Actions for group) g1$/ }));
                await screen.findAllByRole('menuitem', { hidden: true });
                expect(document.body.textContent).not.toMatch(raw);
                const p2 = { ...project, groups: [{ id: '0000aaaa', name: 'g1', members: ['user:a@dhbw.de', 'user:b@dhbw.de'] }] };
                cleanup();
                globalThis.__gpuApi.listProjects = async () => [p2, PROJECTS[1]];
                renderView(<SettingsTab nodeId="p_ml" />);
                fireEvent.click(await screen.findByRole('tab', { name: /^(Gruppen|Groups)$/ }));
                expect(await screen.findByText(/(Alle Personen des Projekts sind in einer Gruppe|Everyone in the project is in a group)/)).toBeTruthy();
                expect(document.body.textContent).not.toMatch(raw);
            } finally {
                await i18n.changeLanguage(before);
            }
        });
    }

    it('removing a group asks first, says what its folder holds and offers archiving instead', async () => {
        globalThis.__llmIsAdmin = false;
        const project = { ...PROJECTS[0], storage_gb: 20,
            groups: [{ id: '0000aaaa', name: 'g1', members: [], used_gib: 2.54 }, { id: '0000bbbb', name: 'g2', members: [] }, { id: '0000cccc', name: 'g3', members: [], archived: true }],
            members: [{ token: 'user:a@dhbw.de', role: 'member' }] };
        globalThis.__gpuApi.listProjects = async () => [project, PROJECTS[1]];
        renderView(<SettingsTab nodeId="p_ml" />);
        fireEvent.click(await screen.findByRole('tab', { name: /^(Gruppen|Groups)$/ }));
        // Remove is in each group's menu.
        const remove = async (name) => {
            await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
            fireEvent.click(screen.getByRole('button', { name: new RegExp(`(Aktionen für Gruppe|Actions for group) ${name}$`) }));
            // hidden: after a Mantine modal closes, jsdom may still see its aria-hidden on the menu's portal.
            fireEvent.click(await screen.findByRole('menuitem', { name: /^(Entfernen …|Remove …)$/, hidden: true }));
        };
        // Archive instead: the group stays, archived.
        await remove('g1');
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText(/~\/dhbw\/groups\/g1 .*(gelöscht|deleted).*2\.5 GB/)).toBeTruthy();
        fireEvent.click(within(dialog).getByRole('button', { name: /^(Archivieren|Archive)$/ }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(screen.getByDisplayValue('g1')).toBeTruthy();
        expect(within(screen.getByRole('group', { name: /(Gruppe|Group) g1$/ })).getByText(/^(archiviert|archived)$/)).toBeTruthy();
        // Cancel keeps it; delete takes it out of the draft. Without a known size, no number.
        await remove('g2');
        let d = await screen.findByRole('dialog');
        expect(within(d).queryByText(/GB/)).toBeNull();
        fireEvent.click(within(d).getByRole('button', { name: /^(Abbrechen|Cancel)$/ }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(screen.getByDisplayValue('g2')).toBeTruthy();
        await remove('g2');
        d = await screen.findByRole('dialog');
        fireEvent.click(within(d).getByRole('button', { name: /^(Löschen|Delete)$/ }));
        await waitFor(() => expect(screen.queryByDisplayValue('g2')).toBeNull());
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        // An archived group: no archiving offered, deleting still asked.
        await remove('g3');
        d = await screen.findByRole('dialog');
        expect(within(d).queryByRole('button', { name: /^(Archivieren|Archive)$/ })).toBeNull();
        fireEvent.click(within(d).getByRole('button', { name: /^(Löschen|Delete)$/ }));
        await waitFor(() => expect(screen.queryByDisplayValue('g3')).toBeNull());
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        // A group not saved yet has no folder: it goes without asking.
        fireEvent.click(screen.getByRole('button', { name: /(Gruppe hinzufügen|Add Group)/ }));
        const added = screen.getAllByRole('textbox', { name: /^(Name \(Ordner\)|Name \(folder\))$/ }).at(-1).value;
        await remove(added);
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(screen.queryByDisplayValue(added)).toBeNull();
        expectNoRenderFailure();
    });

    it('a save sends the version loaded; changed meanwhile, the draft is offered to be loaded again', async () => {
        globalThis.__llmIsAdmin = false;
        const project = { ...PROJECTS[0], updated_at: '2026-11-17T08:00:00.123456Z' };
        globalThis.__gpuApi.listProjects = async () => [project, PROJECTS[1]];
        const sent = [];
        globalThis.__gpuApi.updateProject = async (p) => { sent.push(p); throw Object.assign(new Error('Das Projekt wurde inzwischen geändert, bitte neu laden.'), { status: 409, code: 'conflict' }); };
        function Harness() {
            const draft = useWorkspaceSettings('p_ml', true);
            const [error, setError] = useState(null);
            if (!draft.value) return null;
            return (
                <div>
                    <button type="button" onClick={() => draft.update(cur => ({ ...cur, description: 'neu' }))}>edit</button>
                    <button type="button" onClick={() => draft.save().catch(setError)}>save</button>
                    <button type="button" onClick={() => { setError(null); draft.reload(); }}>reload</button>
                    <span>{draft.changed ? 'changed' : 'unchanged'}</span>
                    {error && <span>{`${error.message} stale=${!!error.stale} status=${error.status}`}</span>}
                </div>
            );
        }
        renderView(<Harness />);
        fireEvent.click(await screen.findByText('edit'));
        expect(screen.getByText('changed')).toBeTruthy();
        fireEvent.click(screen.getByText('save'));
        // Not a 409 about the dialog's node (which would close it): a stale draft, to be loaded again.
        expect(await screen.findByText(/inzwischen geändert.* stale=true status=undefined/)).toBeTruthy();
        expect(sent[0].updated_at).toBe('2026-11-17T08:00:00.123456Z');
        expect(sent[0].group_seats).toBeUndefined();
        fireEvent.click(screen.getByText('reload'));
        expect(await screen.findByText('unchanged')).toBeTruthy();
        expectNoRenderFailure();
    });

    it('rebases a draft on what the dialog itself saved meanwhile', () => {
        const base = { updated_at: 'v1', description: 'alt', image_digest: 'sha256:1', groups: [] };
        const value = { ...base, description: 'neu' };
        const now = { ...base, updated_at: 'v2', image_digest: 'sha256:2' };
        expect(rebaseDraft(base, value, now)).toEqual({ updated_at: 'v2', description: 'neu', image_digest: 'sha256:2', groups: [] });
    });

    it('the workspace settings tab lets a manager set the storage limits and who writes the shared folder', async () => {
        globalThis.__llmIsAdmin = false;
        globalThis.__gpuApi.listProjects = async () => [{ ...PROJECTS[0], storage_gb: 20, shared_write: 'managers', storage_home_gb: 0, storage_project_gb: 5 }, PROJECTS[1]];
        renderView(<SettingsTab nodeId="p_ml" />);
        fireEvent.click(await screen.findByRole('tab', { name: /^(Speicher|Storage)$/ }));
        expect(screen.getByText(/20 GB/)).toBeTruthy();
        expect(screen.getByDisplayValue('5 GB')).toBeTruthy();
        expect(screen.getByRole('radio', { name: /(Nur Verwaltende schreiben|Only managers write)/ }).checked).toBe(true);
        expectNoRenderFailure();
    });

    it('the workspace settings tab lets a manager choose the release times within the budget', async () => {
        globalThis.__llmIsAdmin = false;
        renderView(<SettingsTab nodeId="p_ml" />);
        fireEvent.click(await screen.findByRole('tab', { name: /^(Rückgabezeiten|Release Times)$/ }));
        // The budget's value as placeholder, the ceiling below, no upper bound offered where the budget allows it (own GPUs).
        expect(screen.getByPlaceholderText(/(wie Budget|as budget): 60/)).toBeTruthy();
        expect(screen.getAllByText(/(höchstens|at most) 120/).length).toBeGreaterThan(0);
        expect(screen.getAllByLabelText(/(ohne Obergrenze|no upper bound)/).length).toBe(1);
        expect(screen.queryByText(/(Höchstwerte des Budgets|Budget maximums)/)).toBeNull();
        expectNoRenderFailure();
    });

    it('the workspace settings tab shows admins what is in effect, the budget maximums only in the budget', async () => {
        renderView(<SettingsTab nodeId="p_ml" />);
        fireEvent.click(await screen.findByRole('tab', { name: /^(Rückgabezeiten|Release Times)$/ }));
        expect(await screen.findByText(/(Zurzeit gilt|Currently in effect)/)).toBeTruthy();
        expect(screen.queryByText(/(Höchstwerte des Budgets|Budget maximums)/)).toBeNull();
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
        // What a job reported in its last line "RESULT …".
        expect(screen.getByText(/(Ergebnis|Result): accuracy 0\.83 · (Exit-Code|Exit code) 0/)).toBeTruthy();
        // Another person's job (a manager's view) names the person.
        expect(screen.getByText('b@dhbw.de')).toBeTruthy();
        // Without a chosen project there is no project id to show.
        expect(screen.queryByText(/^(Projekt-ID|Project ID):$/)).toBeNull();
        expectNoRenderFailure();
    });

    it('Batch jobs page through a long list', async () => {
        globalThis.__gpuApi.listProjects = async () => JOB_PROJECTS;
        const asked = [];
        globalThis.__gpuApi.listJobs = async (_project, page) => {
            asked.push(page);
            return { items: page.offset === 0 ? JOBS : [{ ...JOBS[0], id: 'j-old', name: 'old-training' }], total: 120, limit: page.limit, offset: page.offset };
        };
        renderView(<GpuJobs />);
        expect(await screen.findByText('training-1')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: '2' }));
        expect(await screen.findByText('old-training')).toBeTruthy();
        expect(asked.map(p => p.offset)).toEqual([0, 50]);
        expect(screen.getByRole('button', { name: '3' })).toBeTruthy();
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

    it('Batch jobs upload a file into the home or the shared folder of the filtered project', async () => {
        globalThis.__gpuApi.listProjects = async () => JOB_PROJECTS;
        const sent = [];
        // The facade gets { onProgress, signal } from useUpload and passes them to helper/upload.js; the progress shows while the upload runs.
        let finish;
        globalThis.__gpuApi.uploadFile = (project, path, file, opts) => {
            sent.push({ project, path, name: file.name, signal: opts.signal instanceof AbortSignal });
            opts.onProgress({ loaded: 4, total: 8, percent: 50, bytesPerSec: 2, etaSec: 2 });
            return new Promise((resolve) => { finish = () => resolve({ name: file.name, path, type: 'file', size: file.size }); });
        };
        window.history.replaceState(null, '', '/jobs?project=wwi23seb-ml');
        try {
            renderView(<GpuJobs />);
            expect(await screen.findByText('training-1')).toBeTruthy();
            fireEvent.click(screen.getByRole('button', { name: /^(Dateien hochladen|Upload Files)$/ }));
            const submit = await screen.findByRole('button', { name: /^(Hochladen|Upload)$/ });
            expect(submit.disabled).toBe(true);
            const input = document.querySelector('input[type=file]');
            fireEvent.change(input, { target: { files: [new File(['print(1)'], 'train.py')] } });
            fireEvent.click(screen.getByText(/(Gemeinsamer Ordner|Shared folder)/));
            fireEvent.change(screen.getByLabelText(/(Ordner|Folder) \(optional\)/), { target: { value: 'kurs/' } });
            expect(await screen.findByText('~/dhbw/project/kurs/train.py')).toBeTruthy();
            await waitFor(() => expect(screen.getByRole('button', { name: /^(Hochladen|Upload)$/ }).disabled).toBe(false));
            fireEvent.click(screen.getByRole('button', { name: /^(Hochladen|Upload)$/ }));
            expect(await screen.findByRole('progressbar')).toBeTruthy();
            expect(screen.getByText(/^50 ?%$/)).toBeTruthy();
            expect(screen.getByRole('button', { name: /^(Schließen|Close)$/ }).disabled).toBe(true);
            finish();
            expect(await screen.findByText(/(Hochgeladen|Uploaded): ~\/dhbw\/project\/kurs\/train\.py/)).toBeTruthy();
            expect(screen.queryByRole('progressbar')).toBeNull();
            expect(sent).toEqual([{ project: 'wwi23seb-ml', path: 'dhbw/project/kurs/train.py', name: 'train.py', signal: true }]);
            fireEvent.click(screen.getByRole('button', { name: /^(Schließen|Close)$/ }));
            await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        } finally {
            window.history.replaceState(null, '', '/');
        }
        expectNoRenderFailure();
    });

    it('Batch jobs cancel a running upload, and show a refusal in the dialog', async () => {
        globalThis.__gpuApi.listProjects = async () => JOB_PROJECTS;
        globalThis.__gpuApi.uploadFile = (project, path, file, opts) => new Promise((_, reject) => {
            opts.signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')));
        });
        renderView(<GpuJobs />);
        expect(await screen.findByText('training-1')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: /^(Dateien hochladen|Upload Files)$/ }));
        await screen.findByRole('button', { name: /^(Hochladen|Upload)$/ });
        fireEvent.change(document.querySelector('input[type=file]'), { target: { files: [new File(['print(1)'], 'train.py')] } });
        await waitFor(() => expect(screen.getByRole('button', { name: /^(Hochladen|Upload)$/ }).disabled).toBe(false));
        fireEvent.click(screen.getByRole('button', { name: /^(Hochladen|Upload)$/ }));
        fireEvent.click(await screen.findByRole('button', { name: /^(Abbrechen|Cancel)$/ }));
        expect(await screen.findByText(/(Hochladen abgebrochen|Upload cancelled)\./)).toBeTruthy();
        expect(screen.queryByRole('progressbar')).toBeNull();

        globalThis.__gpuApi.uploadFile = async () => { throw Object.assign(new Error('Kein Platz mehr im Home.'), { status: 507, code: 'quota' }); };
        fireEvent.click(screen.getByRole('button', { name: /^(Hochladen|Upload)$/ }));
        expect(await screen.findByText('Kein Platz mehr im Home.')).toBeTruthy();
        expect(screen.queryByText(/(Hochladen abgebrochen|Upload cancelled)\./)).toBeNull();
        expectNoRenderFailure();
    });

    it('Batch jobs do not offer a reader the shared folder for uploads', async () => {
        globalThis.__gpuApi.listProjects = async () => JOB_PROJECTS.map(p => ({ ...p, role: 'reader', areas: [{ mount: 'dhbw/project', dir: 'project-shared', read_only: true }] }));
        renderView(<GpuJobs />);
        expect(await screen.findByText('training-1')).toBeTruthy();
        fireEvent.click(await screen.findByRole('button', { name: /^(Dateien hochladen|Upload Files)$/ }));
        expect(await screen.findByText(/(Nur ins eigene Home|Into your home only)/)).toBeTruthy();
        expect(screen.queryByText(/(Gemeinsamer Ordner|Shared folder) \(/)).toBeNull();
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
        expect(screen.getByText(/^(Per Kommandozeile|On the Command Line)$/)).toBeTruthy();
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
