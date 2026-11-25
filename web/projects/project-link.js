import { liveAllocations, projectKinds } from './util-project.jsx';
import { AREA_PROJECTS } from './start-link.js';

// linkTarget is where a link to an object (/projects?project=… / ?budget=… / ?node=…) leads: a project in the viewer's own list (mine) to the list of the first area it belongs to that this deployment shows (sections), with ?project= so the card is marked; every other node to /budgets/<id>; nothing known to the start page.
export function linkTarget({ params, mine = [], resources = [], sections = {} }) {
    const projectId = params.get('project');
    const nodeId = params.get('budget') || params.get('node') || params.get('allocation');
    if (projectId) {
        const own = mine.find(n => n.id === projectId);
        if (own) {
            const kinds = projectKinds(own, resources);
            // A project that holds nothing yet is listed in every area.
            const area = ['cloud', 'workspaces', 'llm'].find(a => sections[a] && (kinds.length === 0 || kinds.includes(a)));
            if (area) return `${AREA_PROJECTS[area]}?project=${encodeURIComponent(projectId)}`;
        }
        return `/budgets/${encodeURIComponent(projectId)}`;
    }
    if (nodeId) return `/budgets/${encodeURIComponent(nodeId)}`;
    return '/';
}

// linkedPaths are the ways down the budget tree to a linked node, each a list of budget ids from below the root: a budget's or an allocation's parent_path; for a project — which has no parent — the path of every budget paying for it (budget_path, down to that budget), since it is found under each of them. A project no longer paid for is found under the budgets that paid.
export function linkedPaths(node) {
    if (!node) return [];
    if (node.kind === 'project') {
        const live = liveAllocations(node);
        return (live.length > 0 ? live : (node.allocations || [])).map(a => (a.budget_path || [{ id: a.budget_id }]).map(p => p.id));
    }
    return [(node.parent_path || []).map(p => p.id)];
}
