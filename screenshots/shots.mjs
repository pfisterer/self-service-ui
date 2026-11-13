// The screenshots of the guides on dhbw.cloud: name (file name in the homepage's frontend/public/img/anleitungen), path in the app, what to do before (act), what part to take (clip: one element; else from the top down to the end of upTo), and answers of its own (fixtures, see fixtures.mjs).
import { COURSE, ME, OWN_IMAGE, PROFILES, README_CLOUD, RESEARCH } from './fixtures.mjs';

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
// A card on the page (a project or a budget to draw from), by its title; the last, as a budget's name also stands on the cards of its projects, above.
const offer = (page, title) => page.locator('.mantine-Card-root').filter({ has: page.getByText(title, { exact: true }) }).last();

// The root admin's reconciliation page: the same data, seen by a root admin, after a few runs with one warning that keeps coming back.
const RUNS = [1, 2, 3].map(i => ({ started_at: `2026-11-10T0${6 + i}:00:00Z`, finished_at: `2026-11-10T0${6 + i}:00:04Z` }));
const README_ROOT = { ...README_CLOUD,
    'projects GET /v1/act-as': { actor: ME, may_act_as: true, effective_tokens: [`user:${ME}`] },
    'projects GET /v1/admin/reconcile/status': {
        last_run_at: '2026-11-10T09:00:04Z', running: false, projects_synced: 42, projects_created: 1, imported_leaves: 3, imported_removed: 0, orphaned_users_removed: 2, last_error: '', managed_tag: 'managed-by-dhbw-cloud',
        recent_runs: RUNS,
        problems: [{ last_seen: '2026-11-10T09:00:03Z', runs: 3, level: 'warn', message: 'role assignment skipped: user not found in Keystone', fields: { email: 'jan.beispiel@dhbw.example' }, node_id: 'p_iot', os_project_id: 'os-iot', error: 'no Keystone user with this email' }],
    },
};

// The sub-budget dialog of the lecturer's budget, filled in: a name, a purpose, a colleague who manages it and the course that may request from it; open on the Access tab.
const subBudget = async (page) => {
    await page.getByRole('button', { name: 'Sub-budget', exact: true }).first().click();
    await page.locator('.mantine-Modal-content').waitFor();
    const modal = page.locator('.mantine-Modal-content');
    await modal.getByRole('textbox', { name: 'Name', exact: true }).fill('Kurs WI24A Datenbanken');
    await modal.getByRole('textbox', { name: 'Purpose', exact: true }).fill('Small VMs for the students of the database course');
    await page.getByRole('tab', { name: 'Access' }).click();
    const box = (i) => page.locator('.mantine-Modal-content fieldset').nth(i);
    for (const [i, token] of [[0, 'user:tom.beispiel@dhbw.example'], [1, 'group:wi24a']]) {
        await box(i).locator('input:not([type=checkbox])').first().fill(token);
        await box(i).getByRole('button', { name: 'Add', exact: true }).click();
    }
};

export const README_SHOTS = [
    { name: '01-my-projects', lang: 'en', viewport: README_VIEW, path: '/cloud/projects', fixtures: README_CLOUD },
    {
        name: '02-request-project', lang: 'en', viewport: README_VIEW, path: '/cloud/projects', fixtures: README_CLOUD, clip: '.mantine-Modal-content',
        act: async (page) => {
            await offer(page, 'WI Studierende (kleine VM)').getByRole('button', { name: 'New project' }).click();
            await page.locator('.mantine-Modal-content').waitFor();
            await page.getByRole('textbox', { name: 'Name' }).fill('Webshop Prototyp');
            await page.getByRole('textbox', { name: 'Purpose' }).fill('Prototype of a web shop for the e-commerce course');
            await page.evaluate(() => document.activeElement?.blur());
        },
    },
    {
        name: '15-project-admins', lang: 'en', viewport: README_VIEW, path: '/cloud/projects', fixtures: README_CLOUD, clip: '.mantine-Modal-content',
        act: async (page) => {
            await offer(page, 'IoT-Labor').getByRole('button', { name: 'Edit' }).click();
            await page.locator('.mantine-Modal-content').waitFor();
            await page.getByRole('tab', { name: 'Members' }).click();
        },
    },
    {
        name: '16-import-list', lang: 'en', viewport: README_VIEW, path: '/cloud/projects', fixtures: README_CLOUD, clip: '.mantine-Modal-content >> nth=-1',
        act: async (page) => {
            await offer(page, 'IoT-Labor').getByRole('button', { name: 'Edit' }).click();
            await page.locator('.mantine-Modal-content').waitFor();
            await page.getByRole('tab', { name: 'Members' }).click();
            await page.getByRole('button', { name: 'Import list…' }).first().click();
            await page.getByRole('textbox', { name: 'Or paste a list' }).fill('email;role\nmia.beispiel@dhbw.example;member\njan.beispiel@dhbw.example;member\ntom.beispiel@dhbw.example;member\ngroup:kurs-wi24a;member\nnot-an-address;member');
            await page.getByRole('button', { name: 'Preview' }).click();
        },
    },
    {
        name: '07-request-budget', lang: 'en', viewport: README_VIEW, path: '/cloud/projects', fixtures: README_CLOUD, clip: '.mantine-Modal-content',
        act: async (page) => {
            await offer(page, 'Forschungslabor WI').getByRole('button', { name: 'Request sub-budget' }).click();
            const modal = page.locator('.mantine-Modal-content');
            await modal.waitFor();
            await modal.getByRole('textbox', { name: 'Name', exact: true }).fill('Projekt Smart Campus');
            await modal.getByRole('textbox', { name: 'Purpose', exact: true }).fill('Sensors and dashboards for the smart campus research project');
            await page.getByRole('tab', { name: 'Resources' }).click();
            for (const [name, value] of [['Cores', '16'], ['RAM (GB)', '64'], ['Storage (GB)', '500']]) await modal.getByRole('textbox', { name, exact: true }).fill(value);
            await page.evaluate(() => document.activeElement?.blur());
        },
    },
    {
        name: '04-delegate', lang: 'en', viewport: README_VIEW, path: '/budgets', fixtures: README_CLOUD, clip: '.mantine-Modal-content',
        act: subBudget,
    },
    {
        name: '06-auto-approve', lang: 'en', viewport: { width: 1280, height: 1500 }, path: '/budgets', fixtures: README_CLOUD, clip: '.mantine-Modal-content',
        act: async (page) => {
            await subBudget(page);
            await page.getByRole('tab', { name: 'Auto-approve' }).click();
            await page.getByRole('switch', { name: 'Auto-approve requests' }).click({ force: true });
            await page.getByRole('switch', { name: 'Apply individual limits' }).click({ force: true });
        },
    },
    {
        name: '05-approve-impact', lang: 'en', viewport: README_VIEW, path: '/budgets', fixtures: README_CLOUD, clip: '.mantine-Modal-content',
        act: async (page) => {
            await page.getByText('Chatbot Projektarbeit').first().waitFor();
            await page.getByRole('button', { name: 'Decide' }).first().click();
            await page.locator('.mantine-Modal-content').waitFor();
        },
    },
    { name: '08-root-admin', lang: 'en', viewport: README_VIEW, path: '/budgets/admin/sync', fixtures: README_ROOT },
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
