// The screenshots of the guides on dhbw.cloud: name (file name in the homepage's frontend/public/img/anleitungen), path in the app, what to do before (act), what part to take (clip: one element; else from the top down to the end of upTo), and answers of its own (fixtures, see fixtures.mjs).
import { COURSE, ME, OWN_IMAGE, PROFILES, RESEARCH } from './fixtures.mjs';

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

// The pictures in this repo's README (docs/img), in English: `make readme-screenshots` takes them with `--readme` and writes them as WebP. The DNS ones see more zones than the guide: a subzone below the own zone and a zone not created yet.
const README_ZONES = { 'dyndns GET /v1/zones/': { zones: [
    { name: 'lea-muster.user.dhbw.cloud', zone_soa: 'user.dhbw.cloud', exists: true, owners: [ME], creator: ME, allow_subdomains: true },
    { name: 'iot.lea-muster.user.dhbw.cloud', parent: 'lea-muster.user.dhbw.cloud', exists: true, owners: [ME], creator: ME, allow_subdomains: true },
    { name: 'bildanalyse.projects.dhbw.cloud', zone_soa: 'projects.dhbw.cloud', exists: true, owners: [ME, 'tom.beispiel@dhbw.example'], creator: ME, sharing_allowed: true },
    { name: 'wi24a.lehre.dhbw.cloud', zone_soa: 'lehre.dhbw.cloud', exists: false, can_join: false },
] }, 'dyndns GET /config.json': { advertised_nameserver: 'ns1.dhbw.cloud' } };
const OWN_ZONE = '/dyndns/zones/zone/lea-muster.user.dhbw.cloud';
const tab = (name) => async (page) => { await page.getByRole('tab', { name, exact: true }).click(); };
const README_VIEW = { width: 1280, height: 1000 };

export const README_SHOTS = [
    { name: '03-budget-tree', lang: 'en', viewport: README_VIEW, path: '/budgets' },
    { name: '09-dns-zones', lang: 'en', viewport: README_VIEW, path: '/dyndns/zones/zone/wi24a.lehre.dhbw.cloud', fixtures: README_ZONES },
    {
        name: '10-subzones', lang: 'en', viewport: README_VIEW, path: OWN_ZONE, fixtures: README_ZONES, clip: '.mantine-Modal-content',
        act: async (page) => {
            await page.getByRole('button', { name: 'Create subzone' }).first().click();
            await page.locator('.mantine-Modal-content').waitFor();
            await page.getByRole('textbox', { name: 'Subzone label' }).fill('monitoring');
        },
    },
    { name: '11-zone-records', lang: 'en', viewport: README_VIEW, path: OWN_ZONE, fixtures: README_ZONES },
    { name: '12-zone-keys', lang: 'en', viewport: README_VIEW, path: OWN_ZONE, fixtures: README_ZONES, act: tab('Keys') },
    { name: '13-zone-dyndns', lang: 'en', viewport: README_VIEW, path: OWN_ZONE, fixtures: README_ZONES, act: tab('Dynamic DNS') },
    { name: '14-zone-tls', lang: 'en', viewport: README_VIEW, path: OWN_ZONE, fixtures: README_ZONES, act: tab('TLS Certificates') },
    {
        name: '17-groups', lang: 'en', viewport: README_VIEW, path: '/groups', groups: true,
        act: async (page) => {
            const row = (text) => page.getByRole('treeitem').filter({ has: page.getByText(text, { exact: true }) }).first();
            await row('lokal').waitFor();
            for (const name of ['lokal', 'dualis', 'dualis-standort-mannheim', 'dualis-mannheim-technik', 'kurs-wi24a']) {
                await row(name).getByText(name, { exact: true }).click();
                await page.waitForTimeout(300);
            }
        },
    },
];
