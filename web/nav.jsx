import { useLocation } from 'wouter';
import { useCloudStatus } from '/projects/cloud-status.jsx';

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
export function useNav() {
    const [currentPath] = useLocation();
    const { isRoot, pending } = useCloudStatus();

    const cloudProjectsEnabled = Boolean(window?.appconfig?.cloudResourcesBaseUrl);

    const sections = [
        { id: 'home', label: 'Home', href: '/', items: [] },
        cloudProjectsEnabled && {
            id: 'projects',
            label: 'Cloud Projects',
            base: '/projects',
            // A dot, not a count: the budget view can widen its scope, so a
            // number up here would disagree with the number down there.
            dot: pending > 0,
            items: [
                { label: 'My Projects', href: '/projects/projects' },
                { label: 'My Budgets', href: '/projects/budgets', dot: pending > 0 },
                isRoot && { label: 'Root Admin', href: '/projects/admin-sync' },
            ].filter(Boolean),
        },
        {
            id: 'dyndns',
            label: 'DNS Zones',
            base: '/dyndns',
            items: [
                { label: 'Zone Management', href: '/dyndns/zones' },
                { label: 'API Tokens', href: '/dyndns/tokens' },
                { label: 'DNS Policy', href: '/dyndns/policy' },
                { label: 'API Documentation', href: '/dyndns/api-doc' },
            ],
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
        // Only a section WITH items gets a second bar; Home would otherwise
        // leave an empty strip under the header.
        subNavItems: activeSection?.items ?? [],
    };
}
