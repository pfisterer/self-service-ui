import { projectKinds } from './util-project.jsx';
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
