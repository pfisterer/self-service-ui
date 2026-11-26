// The navigation of the new layout (gate ui-v2), as plain data so it can be tested without React: at most five entries at the top, Start only through the logo.
//
//   Projekte             every project in one place, the kind as a filter with its own address, and "Was ich bekommen kann"
//   Workspaces           its tools: servers, batch jobs, usage
//   Sprachmodelle        its tools: overview, available models, keys, usage
//   DNS und Zertifikate  zones, TLS certificates
//   Verwaltung           what few people need: budgets, groups, the zones' administration, and for admins the fleets, the models and the root admin
//
// Who sees what follows the same conditions as the classic navigation (nav.jsx): an entry nobody may use there is left out here too. A section without items is left out.

// PROJECT_FILTERS are the kinds a project page can be filtered to, in the menu's order, with their path segment.
export const PROJECT_FILTERS = [
    { kind: 'all', path: '/projects/all' },
    { kind: 'cloud', path: '/projects/cloud' },
    { kind: 'workspaces', path: '/projects/workspaces' },
    { kind: 'llm', path: '/projects/llm' },
];

export const OFFERS_PATH = '/projects/offers';
export const TLS_PATH = '/dyndns/tls';
// DNS_ADMIN_PATH is the zones' administration in the new layout: under "Verwaltung", with the other things few people need.
export const DNS_ADMIN_PATH = '/admin/dns/administration';

// navSectionsV2 returns the sections (id, label, base, href, items, dot) for the viewer. ctx holds what nav.jsx knows about them: which services exist (cloudProjects, dnsZones), the AI areas (workspaces and llmArea: 'member', 'offer' or false; llm: isAdmin, isFleetAdmin), the cloud status (isRoot, pending, hasBudgets, canRequestBudgets), DNS (hasPolicy, adminEvents, ownEvents) and groups (groupsVisible).
export function navSectionsV2(t, ctx) {
    const {
        cloudProjects = false, dnsZones = false, workspaces = false, llmArea = false, llm = {},
        isRoot = false, pending = 0, hasBudgets = false, canRequestBudgets = false,
        hasPolicy = false, adminEvents = 0, ownEvents = 0, groupsVisible = false,
    } = ctx || {};
    const shows = { all: true, cloud: true, workspaces: !!workspaces, llm: !!llmArea };
    const sections = [
        cloudProjects && {
            id: 'projects',
            label: t('nav.v2.projects'),
            base: '/projects',
            items: [
                // The kinds are filters of one page and are drawn as one group (group: the header frames consecutive items of the same group); "Meine Ressourcen" is something else and stands apart behind a divider (apart).
                ...PROJECT_FILTERS.filter(f => shows[f.kind]).map(f => ({ label: t(`nav.v2.filter_${f.kind}`), href: f.path, group: 'projects' })),
                { label: t('nav.v2.offers'), href: OFFERS_PATH, apart: true },
            ],
        },
        workspaces === 'member' && {
            id: 'workspaces',
            label: t('nav.workspaces'),
            base: '/workspaces',
            items: [
                { label: t('nav.gpuServers'), href: '/workspaces/servers' },
                { label: t('nav.gpuJobs'), href: '/workspaces/jobs' },
                { label: t('nav.gpuUsage'), href: '/workspaces/usage' },
            ],
        },
        llmArea === 'member' && {
            id: 'llm',
            label: t('nav.llm'),
            base: '/llm',
            items: [
                { label: t('nav.llmOverview'), href: '/llm/overview' },
                { label: t('nav.llmAvailable'), href: '/llm/available' },
                { label: t('nav.llmKeys'), href: '/llm/keys' },
                { label: t('nav.llmUsage'), href: '/llm/usage' },
            ],
        },
        dnsZones && {
            id: 'dyndns',
            label: t('nav.v2.dns'),
            base: '/dyndns',
            dot: ownEvents > 0,
            items: [
                { label: t('nav.zoneManagement'), href: '/dyndns/zones', dot: ownEvents > 0 },
                { label: t('nav.v2.tls'), href: TLS_PATH },
            ],
        },
        {
            id: 'admin',
            label: t('nav.v2.admin'),
            base: '/admin',
            dot: pending > 0 || (hasPolicy && adminEvents > 0),
            items: [
                cloudProjects && (hasBudgets || canRequestBudgets || isRoot) && { label: t('nav.budgets'), href: '/admin/budgets', dot: pending > 0 },
                groupsVisible && { label: t('nav.groups'), href: '/admin/groups' },
                workspaces === 'member' && llm.isAdmin && { label: t('nav.gpuFleet'), href: '/admin/workspaces/gpus' },
                llmArea === 'member' && llm.isFleetAdmin && { label: t('nav.llmFleet'), href: '/admin/llm/fleet' },
                llmArea === 'member' && llm.isAdmin && { label: t('nav.llmModels'), href: '/admin/llm/models' },
                dnsZones && hasPolicy && { label: t('nav.v2.dnsAdmin'), href: DNS_ADMIN_PATH, dot: adminEvents > 0 },
                cloudProjects && isRoot && { label: t('nav.rootAdmin'), href: '/admin/budgets/admin' },
            ].filter(Boolean),
        },
    ];
    return sections.filter(s => s && s.items.length > 0).map(s => ({ ...s, href: s.items[0].href }));
}

// The addresses of the classic layout and where they live in the new one. Old links (bookmarks, mails, the guides on the homepage) keep working: legacyRedirect sends them on.
const MOVED = [
    // [old prefix, new prefix, exact]: exact only moves the address itself, not what is below it.
    ['/cloud/projects', '/projects/cloud', false],
    ['/cloud', '/projects/cloud', true],
    ['/workspaces/projects', '/projects/workspaces', false],
    ['/llm/projects', '/projects/llm', false],
    ['/workspaces/gpus', '/admin/workspaces/gpus', false],
    ['/llm/fleet', '/admin/llm/fleet', false],
    ['/llm/models', '/admin/llm/models', false],
    ['/budgets', '/admin/budgets', false],
    ['/groups', '/admin/groups', false],
    ['/dyndns/administration', '/admin/dns/administration', false],
];

// legacyRedirect returns where an address of the classic layout lives in the new one (with its query, e.g. ?project= from a notification mail), or null when it stays where it is.
export function legacyRedirect(path, search = '') {
    const clean = (path || '/').replace(/\/+$/, '') || '/';
    for (const [from, to, exact] of MOVED) {
        if (clean === from || (!exact && clean.startsWith(from + '/'))) {
            const query = search ? (search.startsWith('?') ? search : `?${search}`) : '';
            return to + clean.slice(from.length) + query;
        }
    }
    return null;
}

// subNavRuns splits the items of a section into runs: consecutive items with the same `group` form one run, every other item a run of its own. An item marked `apart` starts its run behind a divider.
export function subNavRuns(items) {
    const runs = [];
    for (const item of items) {
        const last = runs[runs.length - 1];
        if (item.group && last?.group === item.group && !item.apart) last.items.push(item);
        else runs.push({ group: item.group, apart: !!item.apart, items: [item] });
    }
    return runs;
}
