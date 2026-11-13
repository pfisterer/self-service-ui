// Made-up data the screenshots show: invented people, projects and budgets, nothing from a real installation. answer(api, method, path, query, shot) returns the JSON body for a request, or undefined for one not covered (take.mjs names it). A shot can override answers with its own `fixtures` ({ 'llm GET /v1/gpu/start-options': body }).
// The person the screenshots are taken as: the dev login's address (the UI compares owners and members with it), shown in the pictures as SHOWN_AS.
export const ME = 'root.admin@uni.example';
export const SHOWN_AS = 'lea.muster@dhbw.example';

export const PROFILES = [
    { slug: 'cpu', name: 'CPU', gpu: false, idle_minutes: 60, max_hours: 8 },
    { slug: 'cpu-gpukernel', name: 'CPU + GPU-Kernel', gpu: true, idle_minutes: 60, max_hours: 8 },
    { slug: 'gpu', name: 'GPU', gpu: true, idle_minutes: 30, max_hours: 8 },
];
const CLASSES = [
    { id: 'general-small', name: 'General · small', hardware: 'L4-3Q · 3 GB', available: true },
    { id: 'general-medium', name: 'General · medium', hardware: 'L4-6Q · 6 GB', available: true },
];
// Release times in seconds, as the AI service sends them.
const RELEASE = { servers: { cpu: { idle_open: 3600, idle_closed: 1800, max: 8 * 3600 }, 'cpu-gpukernel': { idle_open: 3600, idle_closed: 1800, max: 8 * 3600 }, gpu: { idle_open: 1800, idle_closed: 900, max: 8 * 3600 } }, kernel: { idle_open: 900, idle_closed: 600, max: 4 * 3600 } };

export const COURSE = { slug: 'ml-grundlagen-wi24', name: 'ML-Grundlagen WI24', profiles: ['cpu', 'cpu-gpukernel'], project_image: 'registry.gpu.services.dhbw.cloud/platform/base-pytorch', image_derived: true, image_label: 'Basis PyTorch', storage_gb: 10, scratch_gb: 5, gpu_classes: CLASSES, image_archs: ['amd64'], release: RELEASE, ends_at: '2027-03-31T00:00:00Z', delete_at: '2027-04-30T00:00:00Z', material_git_url: 'https://github.com/beispiel/ml-grundlagen' };
export const RESEARCH = { ...COURSE, slug: 'bildanalyse', name: 'Bildanalyse', profiles: ['cpu', 'cpu-gpukernel', 'gpu'], image_label: 'Basis PyTorch + Git', storage_gb: 20, gpu_classes: [CLASSES[1]], ends_at: undefined, delete_at: undefined, material_git_url: undefined };
export const OWN_IMAGE = { slug: 'bildanalyse', name: 'Bildanalyse (eigenes Image)', profiles: ['cpu', 'gpu'], split_needs_base: true, project_image: 'quay.io/jupyter/pytorch-notebook:2026-10-01', image_derived: false, image_label: 'quay.io/jupyter/pytorch-notebook:2026-10-01', storage_gb: 20, scratch_gb: 5, gpu_classes: CLASSES, image_archs: ['amd64'], release: RELEASE };

// The course project as its managers see it in Workspaces → Projekte.
const COURSE_PROJECT = { id: 1, slug: COURSE.slug, name: COURSE.name, description: 'Übungen zur Vorlesung Machine Learning', role: 'manager', profiles: COURSE.profiles, tree_profiles: true, image_base: 'pytorch', image_derived: true, project_image: '', material_git_url: COURSE.material_git_url, material_git_ref: '', storage_gb: 10, scratch_gb: 5, scratch_effective_gb: 5, gpu_classes: ['general-small', 'general-medium'], gpus_by_class: { 'general-small': 4 }, image_archs: ['amd64'], ends_at: COURSE.ends_at, delete_at: COURSE.delete_at, tree_node: 'p_ml', limits: { servers_per_person: 2, cpu_per_person: 4, ram_gb_per_person: 8, gpus_per_person: 1, jobs_per_person: 0 }, release_effective: RELEASE, members: [{ token: `user:${ME}`, role: 'manager' }, { token: 'group:wi24a', role: 'member' }, { token: 'user:tom.beispiel@dhbw.example', role: 'manager' }] };
const RESEARCH_PROJECT = { id: 2, slug: 'bildanalyse', name: 'Bildanalyse', description: 'Masterarbeit Bildsegmentierung', role: 'admin', profiles: ['cpu', 'cpu-gpukernel', 'gpu'], tree_profiles: true, image_base: 'pytorch', image_derived: true, image_git_url: 'https://github.com/beispiel/bildanalyse-env', image_build: { status: 'ready', commit: '3f9c2a17be04', branch: 'main', updated_at: '2026-11-08T14:12:00Z' }, storage_gb: 20, scratch_gb: 20, scratch_effective_gb: 20, gpu_classes: ['general-medium'], image_archs: ['amd64'], tree_node: 'p_bild', limits: { servers_per_person: 2, cpu_per_person: 8, ram_gb_per_person: 16, gpus_per_person: 1, jobs_per_person: 2, job_max_hours: 12 }, tree_jobs: true, release_effective: RELEASE, members: [{ token: `user:${ME}`, role: 'admin' }] };

// The resource catalogue as on the platform (names and units), with made-up amounts below.
const RESOURCES = [
    { id: 'cores', name: 'Cores', group: 'Compute', area: 'cloud', provider: 'openstack', default: 4, min: 0, max: 100000, show_on_ui: true },
    { id: 'ram', name: 'RAM', unit: 'GB', group: 'Compute', area: 'cloud', provider: 'openstack', default: 16, min: 0, max: 256000, show_on_ui: true },
    { id: 'storage', name: 'Storage', unit: 'GB', group: 'Storage', area: 'cloud', provider: 'openstack', default: 50, min: 0, max: 100000, show_on_ui: true },
    { id: 'ws-vcpu-hours', name: 'Workspace CPU', unit: 'vCPU h', kind: 'window', window: '30d', group: 'Workspaces', area: 'workspaces', provider: 'aiaas', default: 0, min: 0, max: 200000, show_on_ui: true },
    { id: 'ws-ram-gb-hours', name: 'Workspace RAM', unit: 'GB h', kind: 'window', window: '30d', group: 'Workspaces', area: 'workspaces', provider: 'aiaas', default: 0, min: 0, max: 800000, show_on_ui: true },
    { id: 'ws-storage-gb', name: 'Workspace storage', unit: 'GB', group: 'Workspaces', area: 'workspaces', provider: 'aiaas', default: 0, min: 0, max: 10000, show_on_ui: true },
    { id: 'ws-gpu-hours-general-small', name: 'GPU hours General · small', unit: 'GPU h', kind: 'window', window: '30d', group: 'Workspaces', area: 'workspaces', provider: 'aiaas', default: 0, min: 0, max: 10000, show_on_ui: true },
    { id: 'ws-gpus-general-small', name: 'GPUs General · small', group: 'Workspaces', area: 'workspaces', provider: 'aiaas', default: 0, min: 0, max: 50, show_on_ui: true },
    { id: 'ws-profile-cpu', name: 'Workspace type: CPU', kind: 'bool', group: 'Workspaces', area: 'workspaces', provider: 'aiaas', default: 1, show_on_ui: true },
    { id: 'ws-profile-cpu-gpukernel', name: 'Workspace type: CPU + GPU kernel', kind: 'bool', group: 'Workspaces', area: 'workspaces', provider: 'aiaas', default: 1, show_on_ui: true },
    { id: 'llm-mtokens', name: 'LLM tokens', unit: 'M tokens', kind: 'window', window: '30d', group: 'LLM', area: 'llm', provider: 'aiaas', default: 0, min: 0, max: 100000, show_on_ui: true },
];

// The budget tree: a lecturer's budget below the faculty, with a course, a thesis and a cloud project.
const node = (n) => ({ status: 'approved', created_at: '2026-10-01T10:00:00Z', child_count: 0, ...n });
const B_ROOT = node({ id: 'b_root', kind: 'budget', name: 'DHBW', child_count: 1, child_budget_count: 1 });
const B_FAC = node({ id: 'b_wi', kind: 'budget', name: 'Wirtschaftsinformatik', parent_id: 'b_root', parent_name: 'DHBW', ancestor_ids: ['b_root'], child_count: 1, child_budget_count: 1 });
const B_LEA = node({
    id: 'b_lea', kind: 'budget', name: 'Dozentin-Lea-Muster', parent_id: 'b_wi', parent_name: 'Wirtschaftsinformatik', ancestor_ids: ['b_root', 'b_wi'],
    parent_path: [{ id: 'b_root', name: 'DHBW' }, { id: 'b_wi', name: 'Wirtschaftsinformatik' }],
    admin_scope: [`user:${ME}`], eligible_requesters: [`user:${ME}`], auto_approve: {},
    limit: { cores: 16, ram: 64, storage: 500, 'ws-vcpu-hours': 6000, 'ws-ram-gb-hours': 20000, 'ws-storage-gb': 200, 'ws-gpu-hours-general-small': 300, 'ws-gpus-general-small': 4, 'ws-profile-cpu': 1, 'ws-profile-cpu-gpukernel': 1, 'llm-mtokens': 200 },
    available_resources: RESOURCES.map(r => r.id),
    usage: { approved: { limit: { cores: 4, ram: 16, storage: 100, 'ws-vcpu-hours': 4800, 'ws-ram-gb-hours': 9600, 'ws-storage-gb': 30, 'ws-gpu-hours-general-small': 200, 'ws-gpus-general-small': 4, 'llm-mtokens': 50 }, node_ids: ['p_ml', 'p_bild', 'p_web'] } },
    child_count: 3, child_project_count: 3,
});
const project = (id, name, limit, extra = {}) => node({ id, kind: 'project', name, parent_id: 'b_lea', parent_name: 'Dozentin-Lea-Muster', ancestor_ids: ['b_root', 'b_wi', 'b_lea'], owner: `user:${ME}`, viewer_relation: 'owner', limit, termination_date: '2027-03-31', ...extra });
const P_ML = project('p_ml', 'ML-Grundlagen WI24', { 'ws-vcpu-hours': 4800, 'ws-ram-gb-hours': 9600, 'ws-storage-gb': 10, 'ws-gpu-hours-general-small': 200, 'ws-gpus-general-small': 4, 'ws-profile-cpu': 1, 'ws-profile-cpu-gpukernel': 1 }, { reason: 'Übungen zur Vorlesung Machine Learning, Kurs WI24A', authorized_users: [{ token: 'group:wi24a' }, { token: 'user:tom.beispiel@dhbw.example' }], bindings: { aiaas: { external_id: 'ml-grundlagen-wi24' } } });
const P_BILD = project('p_bild', 'Bildanalyse', { 'ws-storage-gb': 20, 'llm-mtokens': 50 }, { reason: 'Masterarbeit Bildsegmentierung', bindings: { aiaas: { external_id: 'bildanalyse' } } });
const P_WEB = project('p_web', 'Webserver Projektarbeit', { cores: 4, ram: 16, storage: 100 }, { reason: 'Webserver für die Projektarbeit im 5. Semester', termination_date: '2027-02-28', bindings: { openstack: { external_id: 'os-web', external_name: 'webserver-projektarbeit', in_use: { cores: 2, ram: 8, storage: 40 } } } });
const NODES = [B_ROOT, B_FAC, B_LEA, P_ML, P_BILD, P_WEB];
const page = (items) => ({ items, total: items.length });

// For the README's Cloud and Budgets pictures (README_CLOUD in shots.mjs): a project waiting for approval and one administered for a colleague beside the own one, two budgets to draw from (one granting a fixed share per person on its own, one on request), and a student's request waiting in the lecturer's budget.
const TOM = 'user:tom.beispiel@dhbw.example';
const P_DB = project('p_db', 'Datenbanken Seminar', { cores: 2, ram: 8, storage: 50 }, { status: 'pending', reason: 'Übungsdatenbanken für das Seminar Datenbanken', termination_date: '2027-01-31', created_at: '2026-11-09T10:00:00Z' });
const P_IOT = project('p_iot', 'IoT-Labor', { cores: 8, ram: 32, storage: 200 }, { parent_id: 'b_lab', parent_name: 'Forschungslabor WI', ancestor_ids: ['b_root', 'b_wi', 'b_lab'], owner: TOM, viewer_relation: 'admin', admin_scope: [`user:${ME}`], authorized_users: [{ token: TOM, role: 'member' }, { token: `user:${ME}`, role: 'member' }, { token: 'group:tutoren', role: 'member' }], termination_date: '2027-09-30', bindings: { openstack: { external_id: 'os-iot', external_name: 'iot-labor', in_use: { cores: 6, ram: 24, storage: 120 } } } });
const P_REQ = project('p_req', 'Chatbot Projektarbeit', { cores: 4, ram: 16, storage: 100 }, { status: 'pending', owner: 'user:mia.beispiel@dhbw.example', viewer_relation: undefined, reason: 'Chatbot für die Projektarbeit im 5. Semester, mit einer kleinen Datenbank', termination_date: '2027-02-28', created_at: '2026-11-09T14:20:00Z' });
const B_STUD = node({ id: 'b_stud', kind: 'budget', name: 'WI Studierende (kleine VM)', parent_id: 'b_wi', parent_name: 'Wirtschaftsinformatik', ancestor_ids: ['b_root', 'b_wi'], admin_scope: ['group:lehrende-wi'], eligible_requesters: ['group:wi24a'], limit: { cores: 64, ram: 256, storage: 2000 }, available_resources: ['cores', 'ram', 'storage'], auto_approve: { per_requester_limit: { cores: 2, ram: 4, storage: 20 } }, usage: { approved: { limit: { cores: 20, ram: 80, storage: 400 } } }, termination_date: '2027-09-30' });
const B_LAB = node({ id: 'b_lab', kind: 'budget', name: 'Forschungslabor WI', parent_id: 'b_wi', parent_name: 'Wirtschaftsinformatik', ancestor_ids: ['b_root', 'b_wi'], admin_scope: [TOM], eligible_requesters: ['group:lehrende-wi'], limit: { cores: 48, ram: 192, storage: 2000 }, available_resources: ['cores', 'ram', 'storage'], usage: { approved: { limit: { cores: 8, ram: 32, storage: 200 } } }, termination_date: '2027-12-31' });
export const README_CLOUD = {
    'projects GET /v1/nodes/mine': page([P_WEB, P_DB, P_IOT]),
    'projects GET /v1/nodes/eligible-for-me': page([B_STUD, B_LAB]),
    'projects GET /v1/nodes/to-manage': page([P_REQ]),
    'projects GET /v1/nodes/b_lea/children': (query) => page([P_ML, P_BILD, P_WEB, P_REQ].filter(n => !query.get('kind') || n.kind === query.get('kind'))),
    'projects GET /v1/nodes/p_req': P_REQ,
    'projects GET /v1/nodes/b_stud': B_STUD,
    'projects GET /v1/nodes/b_lab': B_LAB,
};

const at = (h) => new Date(Date.UTC(2026, 10, 10, h, 0)).toISOString();

const DEFAULTS = {
    'llm GET /v1/me': { email: ME, role: ['user'], workspace_projects: 2, llm_mtokens: 5, jupyter_url: 'https://jupyter.gpu.services.dhbw.cloud', api_url: 'https://api.llm.services.dhbw.cloud/v1', chat_url: 'https://chat.llm.services.dhbw.cloud' },
    'llm GET /v1/gpu/start-options': { projects: [{ ...COURSE, llm_default: COURSE.slug, llm_default_source: 'project' }, OWN_IMAGE], profiles: PROFILES, llm_projects: [{ slug: COURSE.slug, name: COURSE.name }] },
    'llm GET /v1/gpu/servers': page([{ name: 'ml-grundlagen-wi24-1', project: COURSE.slug, profile: 'cpu-gpukernel', ready: true, url: '/user/x/ml-grundlagen-wi24-1/', started: at(7), last_activity: at(8) }]),
    'llm GET /v1/workspaces/projects': page([COURSE_PROJECT, RESEARCH_PROJECT]),
    'llm GET /v1/workspaces/catalog': { profiles: PROFILES, bases: [{ id: 'python', name: 'Python' }, { id: 'pytorch', name: 'PyTorch' }, { id: 'tensorflow', name: 'TensorFlow' }] },
    'llm GET /v1/gpu/jobs': page([
        { id: 'j7', name: 'segmentierung-training', project: 'bildanalyse', person: ME, state: 'running', gpu_class: 'general-medium', gpus: 1, max_hours: 12, submitted: at(5), admitted: at(5), started: at(5), gpu_hours: 3.4, command: 'python train.py --epochs 40', working_dir: 'projects/bildanalyse' },
        { id: 'j8', name: 'auswertung', project: 'bildanalyse', person: ME, state: 'queued', position: 2, gpu_class: 'general-medium', gpus: 1, max_hours: 2, submitted: at(8), notebook: 'auswertung.ipynb', working_dir: 'projects/bildanalyse' },
        { id: 'j6', name: 'vortraining', project: 'bildanalyse', person: ME, state: 'succeeded', exit_code: 0, gpu_class: 'general-medium', gpus: 1, max_hours: 12, submitted: '2026-11-09T18:00:00Z', started: '2026-11-09T18:01:00Z', ended: '2026-11-09T23:40:00Z', gpu_hours: 5.65, command: 'python pretrain.py', working_dir: 'projects/bildanalyse' },
    ]),
    'llm GET /v1/usage': {
        projects: [{ slug: 'bildanalyse', name: 'Bildanalyse', default: true, mtokens: 5, spend: 0.8, budget: 5, budget_duration: '30d', reset_at: '2026-11-30T00:00:00Z', models: ['chat-default', 'code-default', 'embedding-default'], rpm: 60, tpm: 100000 }],
        keys: [
            { id: 'k1', name: 'Laptop', project: 'bildanalyse', project_name: 'Bildanalyse', spend: 0.5, budget: 1, budget_duration: '30d', reset_at: '2026-11-30T00:00:00Z' },
            { id: 'k2', name: 'Chat', chat: true, project: 'bildanalyse', project_name: 'Bildanalyse', spend: 0.3, reset_at: '2026-11-30T00:00:00Z' },
        ],
        own_keys: 1, max_keys: 5,
    },
    'llm GET /v1/keys': page([]),
    'llm GET /v1/workspaces/projects/ml-grundlagen-wi24/credentials': page([]),
    'projects GET /v1/config': { resources: RESOURCES, providers: ['aiaas'], roles: ['member'], provisioningEnabled: true, retirement: { delete: 'after-grace', deleteGraceDays: 30, aiaasDeleteGraceDays: 30, chargeReleased: true } },
    'projects GET /config.json': {},
    'projects GET /v1/act-as': { actor: ME, may_act_as: false, effective_tokens: [`user:${ME}`] },
    'projects GET /v1/nodes/eligible-for-me': { items: [], total: 0 },
    'projects GET /v1/nodes/my-budgets': page([B_LEA]),
    'projects GET /v1/principals/search': { users: [], groups: [{ token: 'group:wi24a', label: 'Kurs WI24A', description: 'Studierende des Kurses WI24A' }] },
    'projects GET /v1/nodes/to-manage': { items: [], total: 0 },
    'projects GET /v1/nodes/mine': page([P_ML, P_BILD, P_WEB]),
    'llm GET /config.json': {},
    'dyndns GET /config.json': {},
    'dyndns GET /v1/me': { email: ME, super_admin: false, may_act_as: false },
    'dyndns GET /v1/policies/rules': [],
    'dyndns GET /v1/zones/lea-muster.user.dhbw.cloud': { owners: [ME], creator: ME, allow_subdomains: true, zoneData: { zone: 'lea-muster.user.dhbw.cloud', zone_keys: [{ keyname: 'lea-muster.user.dhbw.cloud.', algorithm: 'hmac-sha256', key: 'bWFkZS11cC1rZXktZm9yLXNjcmVlbnNob3RzLW9ubHk=' }] } },
    'dyndns GET /v1/dns/records': { records: [
        { zone: 'lea-muster.user.dhbw.cloud', name: 'lea-muster.user.dhbw.cloud.', type: 'AAAA', ttl: 60, value: '2001:db8:1::10' },
        { zone: 'lea-muster.user.dhbw.cloud', name: 'www.lea-muster.user.dhbw.cloud.', type: 'AAAA', ttl: 60, value: '2001:db8:1::10' },
        { zone: 'lea-muster.user.dhbw.cloud', name: 'jupyter.lea-muster.user.dhbw.cloud.', type: 'AAAA', ttl: 60, value: '2001:db8:1::11' },
    ] },
    'dyndns GET /v1/zones/': { zones: [
        { name: 'lea-muster.user.dhbw.cloud', zone_soa: 'user.dhbw.cloud', exists: true, owners: [ME], creator: ME, allow_subdomains: true },
        { name: 'bildanalyse.projects.dhbw.cloud', zone_soa: 'projects.dhbw.cloud', exists: true, owners: [ME, 'tom.beispiel@dhbw.example'], creator: ME, sharing_allowed: true },
        { name: 'wi24a.lehre.dhbw.cloud', zone_soa: 'lehre.dhbw.cloud', exists: false, can_join: false },
    ] },
    'dyndns GET /v1/zone-events/': [],
};

// The groups the role provider maintains, for the groups shot: a local source (maintained here) and two imported ones (read-only), nested a level or two. Other shots answer /v1/manage/me with nothing to maintain, so the section stays out of their menu.
const grp = (id, description, source, childGroups = 0) => ({ id, token: `group:${id}`, display_name: id, description, source_name: source, editable: source === 'lokal', child_groups: childGroups });
const GROUP_SOURCES = [
    { name: 'lokal', type: 'local', local: true, groups: 3 },
    { name: 'dualis', type: 'csv', local: false, groups: 6, last_synced_at: '2026-11-10T06:00:00Z', last_sync_status: 'ok' },
    { name: 'zwr', type: 'csv', local: false, groups: 2, last_synced_at: '2026-11-10T06:00:00Z', last_sync_status: 'ok' },
];
const TOP_GROUPS = {
    lokal: [grp('kurs-wi24a', 'Kurs WI24A · Wirtschaftsinformatik', 'lokal', 1), grp('lehrende-wi', 'Lehrende · Wirtschaftsinformatik', 'lokal'), grp('tutoren', 'Tutorinnen und Tutoren', 'lokal')],
    dualis: [grp('dualis-standort-mannheim', 'DHBW Mannheim · alle Kurse', 'dualis', 2), grp('dualis-standort-stuttgart', 'DHBW Stuttgart · alle Kurse', 'dualis', 1)],
    zwr: [grp('zwr-fakultaet-wirtschaft', 'Fakultät Wirtschaft · DHBW Mannheim', 'zwr', 1)],
};
const CHILD_GROUPS = {
    'kurs-wi24a': [grp('kurs-wi24a-tutorium', 'Tutorium WI24A', 'lokal')],
    'dualis-standort-mannheim': [grp('dualis-mannheim-technik', 'Fakultät Technik · DHBW Mannheim', 'dualis', 2), grp('dualis-mannheim-wirtschaft', 'Fakultät Wirtschaft · DHBW Mannheim', 'dualis')],
    'dualis-mannheim-technik': [grp('kurs-tinf24ai1', 'Kurs TINF24AI1 · Informatik', 'dualis'), grp('kurs-tmb24a', 'Kurs TMB24A · Maschinenbau', 'dualis')],
    'dualis-standort-stuttgart': [grp('kurs-wwi24a', 'Kurs WWI24A · Wirtschaftsinformatik', 'dualis')],
    'zwr-fakultaet-wirtschaft': [grp('kurs-wwi24a', 'Kurs WWI24A · Wirtschaftsinformatik', 'dualis')],
};
const ALL_GROUPS = [...Object.values(TOP_GROUPS).flat(), ...Object.values(CHILD_GROUPS).flat()];
function groupsAnswer(path, query, shot) {
    if (path === '/v1/manage/me') return shot.groups ? { actor: ME, admin: true, manages_any: true, may_act_as: false, relations: ['member', 'dozent'], source_name: 'lokal' } : { actor: ME, admin: false, manages_any: false };
    if (path === '/v1/manage/sources') return GROUP_SOURCES;
    if (path === '/v1/manage/groups') {
        if (query.get('q')) return page(ALL_GROUPS.filter(g => g.id.includes(query.get('q'))));
        if (query.get('parent')) return page(CHILD_GROUPS[query.get('parent')] ?? []);
        if (query.get('source')) return page(TOP_GROUPS[query.get('source')] ?? []);
    }
    const m = path.match(/^\/v1\/manage\/groups\/([^/]+)(\/[a-z]+)?$/);
    if (m) {
        const g = ALL_GROUPS.find(x => x.id === m[1]);
        if (!g) return undefined;
        if (!m[2]) return { group: g, editable: g.editable, may_delete: false, managers: [`user:${ME}`], memberships: [
            { member: 'group:kurs-wi24a-tutorium', relation: 'member', created_at: '2026-10-01T10:00:00Z' },
            { member: 'user:tom.beispiel@dhbw.example', relation: 'member', created_at: '2026-10-01T10:00:00Z' },
            { member: 'user:mia.beispiel@dhbw.example', relation: 'member', created_at: '2026-10-01T10:00:00Z', expires_at: '2027-03-31T00:00:00Z' },
            { member: 'user:lea.muster@dhbw.example', relation: 'dozent', created_at: '2026-10-01T10:00:00Z' },
        ] };
        if (m[2] === '/effective') return ['user:tom.beispiel@dhbw.example', 'user:mia.beispiel@dhbw.example', 'user:jan.beispiel@dhbw.example'];
        if (m[2] === '/history' || m[2] === '/managers') return [];
    }
    return undefined;
}

export function answer(api, method, path, query, shot) {
    const key = `${api} ${method} ${path}`;
    const own = shot.fixtures ?? {};
    if (key in own) return typeof own[key] === 'function' ? own[key](query) : own[key];
    if (key in DEFAULTS) return DEFAULTS[key];
    if (api === 'groups' && method === 'GET') return groupsAnswer(path, query, shot);
    // The tree: one node, and a node's children (budgets or projects, as asked).
    if (api === 'projects' && method === 'GET') {
        const m = path.match(/^\/v1\/nodes\/([^/]+)(\/children)?$/);
        if (m && m[2]) return page(NODES.filter(n => n.parent_id === m[1] && (!query.get('kind') || n.kind === query.get('kind'))));
        if (m) return NODES.find(n => n.id === m[1]);
    }
    return undefined;
}
