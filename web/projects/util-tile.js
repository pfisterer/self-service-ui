// The decisions behind the unified project tile of the new layout (gate ui-v2), as plain functions so they can be tested without rendering: which kind a tile speaks for, its two visible actions and the rest in its "Mehr" menu, the one chip it may carry, and its at most three bars.

import { USAGE_HIGH, UNLIMITED_QUOTA, isAvailability } from './util-project.jsx';

// tileKind is the kind the tile speaks for: the filter of the page when the project is of that kind, else the first kind the project is (cloud, workspaces, llm), else null (a project that holds nothing yet).
export function tileKind(kinds, filter) {
    if (filter && filter !== 'all' && kinds.includes(filter)) return filter;
    return kinds[0] ?? null;
}

// tileActions decides the tile's buttons. facts:
//   kind          tileKind
//   can           projectActions (or { details: true } for a member)
//   openstackUrl  where the project opens in OpenStack, else null
//   start         where a workspace of it starts, else null
//   keys          whether the viewer has LLM keys to show (an LLM project they work in)
//   jobs          whether the project allows batch jobs
//   decide        whether a decision of the viewer waits on it
//   releasable    whether the viewer may give the whole project back (holders, or managers of every paying budget)
//   usage         whether a consumption history exists (a cloud project)
//   memberView    whether the viewer only works in it (no history, no members list)
// It returns { primary, secondary, menu }: primary and secondary are action ids or null, menu a list of { id, danger }. The ids: openstack, start, keys, decide, adopt, edit, details, usage, jobs, members, history, link, release, delete-for-good.
export function tileActions(facts) {
    const { kind, can = {}, openstackUrl = null, start = null, keys = false, jobs = false, decide = false, releasable = false, usage = false, memberView = false } = facts || {};
    const editOrDetails = can.change ? 'edit' : 'details';
    // What the project is for, by kind: the one thing most people come for.
    const own = kind === 'cloud' && openstackUrl ? 'openstack'
        : kind === 'workspaces' && start ? 'start'
            : kind === 'llm' && keys ? 'keys'
                : null;
    // A decision that waits on the viewer comes first: it is why they look at the tile.
    const primary = decide ? 'decide' : can.adopt ? 'adopt' : own ?? editOrDetails;
    const secondary = primary === editOrDetails ? (usage ? 'usage' : null) : editOrDetails;
    const taken = new Set([primary, secondary]);
    const menu = [
        own && !taken.has(own) && own,
        usage && !taken.has('usage') && 'usage',
        jobs && 'jobs',
        'members',
        !memberView && 'history',
        'link',
    ].filter(Boolean).map(id => ({ id, danger: false }));
    if (can.release && releasable) menu.push({ id: 'release', danger: true });
    if (can.deleteForGood) menu.push({ id: 'delete-for-good', danger: true });
    return { primary, secondary, menu };
}

// tileFlag is the one chip a tile carries, only where something differs from "running as granted", the most pressing first; null otherwise. facts: status, provisioning, decide, overage (any resource over its limit), expiryTone ('red', 'orange' or 'gray'), envFailed, deleting, full (the label of a resource at USAGE_HIGH or more, else null).
export function tileFlag(facts) {
    const { status, provisioning = false, decide = false, overage = false, expiryTone = 'gray', envFailed = false, deleting = false, full = null } = facts || {};
    if (deleting) return { key: 'deleting', color: 'red' };
    if (decide) return { key: 'decide', color: 'orange' };
    if (status === 'rejected') return { key: 'rejected', color: 'red' };
    if (status === 'pending') return { key: 'pending', color: 'blue' };
    if (status === 'change_pending') return { key: 'changePending', color: 'blue' };
    if (status === 'released' || status === 'archived') return { key: 'retired', color: 'gray' };
    if (provisioning) return { key: 'provisioning', color: 'blue' };
    if (overage) return { key: 'overage', color: 'red' };
    if (envFailed) return { key: 'envFailed', color: 'red' };
    if (full) return { key: 'full', color: 'orange', name: full };
    if (expiryTone === 'red' || expiryTone === 'orange') return { key: 'ending', color: expiryTone };
    return null;
}

// tileBars picks the at most three quantities a tile shows: those granted (limit not 0), fullest first, the catalogue's order among equals. Each { resource, used, limit, share, high }; used is undefined where nothing was measured. An unlimited one has no share and goes last.
export function tileBars(resources, limit, inUse, max = 3) {
    const granted = (resources || []).filter(r => !isAvailability(r) && (limit?.[r.id] ?? 0) !== 0);
    const bars = granted.map((r, i) => {
        const l = limit[r.id];
        const used = inUse?.[r.id];
        const share = typeof used === 'number' && l !== UNLIMITED_QUOTA && l > 0 ? used / l : null;
        return { resource: r, used, limit: l, share, high: share !== null && share >= USAGE_HIGH, order: i };
    });
    bars.sort((a, b) => (b.share ?? -1) - (a.share ?? -1) || a.order - b.order);
    return bars.slice(0, max);
}

// PANEL_TAB_ACTIONS are the tile actions that only lead to a tab of the side panel; inside the panel the tabs are right there, so they are no buttons of their own.
export const PANEL_TAB_ACTIONS = new Set(['details', 'usage', 'members', 'history']);

// panelActions are a tile's actions as the side panel shows them: without those leading to one of its tabs. A second action moves up when the first one goes; "Mehr" keeps only what is left. All three may end up empty, and the panel then has no buttons at all.
export function panelActions({ primary = null, secondary = null, menu = [] } = {}) {
    const keep = (id) => (id && !PANEL_TAB_ACTIONS.has(id) ? id : null);
    const first = keep(primary), second = keep(secondary);
    // Copying the project's link is left out too: the panel is where one already is, and nobody missed it there.
    return { primary: first ?? second, secondary: first ? second : null, menu: menu.filter(i => !PANEL_TAB_ACTIONS.has(i.id) && i.id !== 'link') };
}
