// The screenshots of the guides on dhbw.cloud: name (file name in the homepage's frontend/public/img/anleitungen), path in the app, what to do before (act), what part to take (clip: one element; else from the top down to the end of upTo), and answers of its own (fixtures, see fixtures.mjs).
import { COURSE, OWN_IMAGE, PROFILES, RESEARCH } from './fixtures.mjs';

// The start page with only these projects, as for a person in just them; the course has LLM tokens (the start shows it as the workspace's LLM).
const only = (...projects) => ({ 'llm GET /v1/gpu/start-options': { projects: projects.map(p => (p === COURSE ? { ...p, llm_default: p.slug, llm_default_source: 'project' } : p)), profiles: PROFILES, llm_projects: projects.filter(p => p === COURSE).map(p => ({ slug: p.slug, name: p.name })) } });

export const SHOTS = [
    // workspace-starten: what a student sees after following the course's link.
    { name: 'workspace-starten', path: `/workspaces/servers/start?project=${COURSE.slug}&env=cpu`, fixtures: only(COURSE) },
    // cpu-gpu-kernel: the kind chosen, with the GPU class.
    { name: 'cpu-gpu-kernel-start', path: `/workspaces/servers/start?project=${COURSE.slug}&env=cpu-gpukernel`, fixtures: only(COURSE) },
    // cpu-gpu-kernel: a project on its own image, with the hint.
    { name: 'cpu-gpu-kernel-hinweis', path: `/workspaces/servers/start?project=${OWN_IMAGE.slug}&env=cpu`, fixtures: only(OWN_IMAGE) },
    // workspace-starten: the running workspaces.
    { name: 'aktive-workspaces', path: '/workspaces/servers' },
    // workspaces-lehre: the project's settings.
    { name: 'workspace-projekte', path: '/workspaces/projects' },
    // workspaces-lehre: a course project's settings, environment and material.
    {
        name: 'workspace-projekt-bearbeiten', path: '/workspaces/projects', clip: '.mantine-Modal-content',
        act: async (page) => {
            await page.locator('.mantine-Card-root, .mantine-Paper-root').filter({ hasText: 'ML-Grundlagen WI24' }).getByRole('button', { name: 'Bearbeiten' }).click();
            await page.locator('.mantine-Modal-content').waitFor();
            await page.getByRole('tab', { name: 'Workspace-Einstellungen' }).click();
        },
    },
    // batch-jobs: the list and a new job.
    { name: 'batch-jobs', path: '/workspaces/jobs' },
    {
        name: 'batch-job-neu', path: '/workspaces/jobs/new', fixtures: only(RESEARCH),
        act: async (page) => {
            await page.getByRole('textbox', { name: 'Name' }).fill('segmentierung-training');
            await page.getByRole('textbox', { name: 'Befehl' }).fill('python train.py --epochs 40');
            await page.getByRole('textbox', { name: 'Arbeitsverzeichnis' }).fill('projects/bildanalyse');
            await page.evaluate(() => document.activeElement?.blur());
        },
    },
    // projekte-und-budgets: one's budgets and projects.
    { name: 'budgets', path: '/budgets' },
    { name: 'cloud-projekte', path: '/cloud/projects' },
    // sprachmodelle: the API keys.
    { name: 'llm-schluessel', path: '/llm/keys' },
    // dns-zertifikate: the zones.
    { name: 'dns-zonen', path: '/dyndns/zones' },
];
