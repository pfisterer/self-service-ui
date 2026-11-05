import { useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import { cloudProjectsEnabled, dnsZonesEnabled } from '/features.js';
import { useGroupsMe } from '/groups/use-groups-me.jsx';
import { useCloudStatus } from '/projects/cloud-status.jsx';
import { useDnsPolicyStatus } from '/dyndns/use-policy.jsx';
import { useAiAreasVisible } from '/ai-areas.jsx';

// The whole navigation as data, in one place: the header renders it two ways
// (two bars on a wide screen, one vertical list in the burger) and the shell
// needs to know how tall the result is. Three copies of the same link list is
// how the old header drifted apart.
//
// A section is a top-level category. Its `href` is where clicking the category
// itself goes — the first item, so a click never lands on an empty page. Items
// are the second level.

export const HEADER_HEIGHT = 60;
// The second level is a row of the same header block, not a band of its own —
// hence the modest number.
export const SUBNAV_HEIGHT = 40;

// Below this the navigation goes into the burger. Deliberately not Mantine's
// `sm` (768px): the widest case — three categories plus a signed-in user with a
// long address — needs about 900px before the row starts wrapping, and a
// wrapped header looks broken long before it becomes unusable.
export const NAV_BREAKPOINT = 'md';

// useNav returns the sections the current user may see, plus which section and
// item the current URL is in. Availability is decided here so no caller has to
// repeat it: Cloud Projects only exists where the backend is configured (its
// route is not even registered otherwise), Root Admin only for root admins.
// An entry left out here is still reachable by URL — this decides what the
// menu offers, not what exists.
export function useNav() {
    const [currentPath] = useLocation();
    const { t } = useTranslation();
    const { isRoot, pending, hasBudgets, canRequestBudgets } = useCloudStatus();
    const { hasPolicy, adminEvents, ownEvents } = useDnsPolicyStatus();
    // Which of the AI service's areas are visible, and how (ai-areas.jsx, shared with the footer).
    const { llm, workspaces, llmArea } = useAiAreasVisible();
    // Only for whoever maintains a group (or admins), as the role provider answers.
    const groups = useGroupsMe();

    const sections = [
        { id: 'home', label: t('nav.home'), href: '/', items: [] },
        // One section per concern: Cloud, Workspaces, LLM and DNS each with their
        // own projects (a project of several areas shows in each), and Budgets
        // for whoever runs them. The API tokens and documentation of the
        // services are in the account menu (/developer, developer.jsx), not here.
        // Docs: docs/bauplan.md 8.14 in aiaas-deployment.
        cloudProjectsEnabled && {
            id: 'cloud',
            label: t('nav.cloud'),
            base: '/cloud',
            items: [
                { label: t('nav.projects'), href: '/cloud/projects' },
            ],
        },
        // Workspaces (Jupyter now, Coder later) from the AI service: for members
        // of a project, and admins, who manage the projects; for everybody else
        // the way to a project, when a budget in reach offers one.
        workspaces === 'member' ? {
            id: 'workspaces',
            label: t('nav.workspaces'),
            base: '/workspaces',
            items: [
                cloudProjectsEnabled && { label: t('nav.projects'), href: '/workspaces/projects' },
                { label: t('nav.gpuServers'), href: '/workspaces/servers' },
                { label: t('nav.gpuJobs'), href: '/workspaces/jobs' },
                { label: t('nav.gpuUsage'), href: '/workspaces/usage' },
                llm.isAdmin && { label: t('nav.gpuFleet'), href: '/workspaces/gpus' },
            ].filter(Boolean),
        } : workspaces === 'offer' && { id: 'workspaces', label: t('nav.workspaces'), base: '/workspaces', items: [{ label: t('nav.projects'), href: '/workspaces/projects' }] },
        // For whoever has LLM tokens through a project (or a role there); for
        // somebody without, only the way to a project, and only when a budget
        // in reach offers one. Its API keys are LiteLLM keys for the model
        // endpoint — a different thing from the API tokens of Cloud and DNS,
        // which manage this platform.
        llmArea === 'member' ? {
            id: 'llm',
            label: t('nav.llm'),
            base: '/llm',
            items: [
                { label: t('nav.llmOverview'), href: '/llm/overview' },
                cloudProjectsEnabled && { label: t('nav.projects'), href: '/llm/projects' },
                { label: t('nav.llmKeys'), href: '/llm/keys' },
                { label: t('nav.llmUsage'), href: '/llm/usage' },
                llm.isFleetAdmin && { label: t('nav.llmFleet'), href: '/llm/fleet' },
                llm.isAdmin && { label: t('nav.llmModels'), href: '/llm/models' },
            ].filter(Boolean),
        } : llmArea === 'offer' && { id: 'llm', label: t('nav.llm'), base: '/llm', items: [{ label: t('nav.projects'), href: '/llm/projects' }] },
        dnsZonesEnabled && {
            id: 'dyndns',
            label: t('nav.dnsZones'),
            base: '/dyndns',
            // Like the projects' pending requests: a dot, not a count, wherever
            // a zone problem is waiting to be looked at.
            dot: adminEvents > 0 || ownEvents > 0,
            items: [
                { label: t('nav.zoneManagement'), href: '/dyndns/zones', dot: ownEvents > 0 },
                // Read-only for most users, and worth reading only if a rule
                // actually applies to them; empty for a student. Named for
                // what the page became: policy rules are one tab among the
                // administrative ones (delegations, orphaned zones, zone
                // events). Old /policy links redirect (see dyndns-routes).
                hasPolicy && { label: t('nav.administration'), href: '/dyndns/administration', dot: adminEvents > 0 },
            ].filter(Boolean),
        },
        // Only for someone who manages a budget, may request a sub-budget somewhere, or is root admin. A dot, not a count: the budget view can widen its scope, so a number up here would disagree with the number down there.
        cloudProjectsEnabled && (hasBudgets || canRequestBudgets || isRoot) && {
            id: 'budgets',
            label: t('nav.budgets'),
            base: '/budgets',
            dot: pending > 0,
            items: [
                { label: t('nav.myBudgets'), href: '/budgets', dot: pending > 0 },
                isRoot && { label: t('nav.rootAdmin'), href: '/budgets/admin' },
            ].filter(Boolean),
        },
        // Groups maintained by hand: courses, study programmes, offices. Last, because few people have it.
        groups.visible && {
            id: 'groups',
            label: t('nav.groups'),
            base: '/groups',
            items: [{ label: t('nav.groups'), href: '/groups' }],
        },
    ].filter(Boolean).map(s => ({ ...s, href: s.href ?? s.items[0]?.href ?? '/' }));

    const inSection = (s) => (s.base
        ? currentPath === s.base || currentPath.startsWith(s.base + '/')
        : currentPath === '/');
    const activeSection = sections.find(inSection) ?? null;

    // Longest match wins, so /dyndns/zones/example.org still marks "Zone
    // Management" — sub-routes belong to the item they hang under.
    const activeItem = (activeSection?.items || [])
        .filter(i => currentPath === i.href || currentPath.startsWith(i.href + '/'))
        .sort((a, b) => b.href.length - a.href.length)[0] ?? null;

    return {
        sections,
        activeSection,
        activeItem,
        // Only a section with at least two items gets a second bar: Home would
        // otherwise leave an empty strip under the header, and a single item
        // is where clicking the section goes anyway (Cloud: Projects).
        subNavItems: (activeSection?.items?.length ?? 0) > 1 ? activeSection.items : [],
    };
}
