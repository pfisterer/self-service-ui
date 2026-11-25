import { useQuery } from '@tanstack/react-query';
import { Redirect, useSearch } from 'wouter';
import { Loading } from '/helper/query-state.jsx';
import { cloudProjectsEnabled, llmEnabled } from '/features.js';
import { useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { useProjectConfig } from './projects.jsx';
import { linkTarget } from './project-link.js';

// ProjectLink (/projects?project=<id>, /projects?budget=<id>, /projects?node=<id>): the address links from outside use for an object — the mails of the notification service above all. It does not know where the object is shown for the viewer, so it finds out: a project the viewer owns or works in opens in the list of its area with the card marked; anything else (a project the viewer pays for as a budget's manager, a budget, a request) opens in Budgets, whose detail panel shows any node the viewer may see and says so when it is none.
export function ProjectLink() {
    const params = new URLSearchParams(useSearch());
    const projectId = params.get('project');
    const api = useNodesApi();
    const config = useProjectConfig();
    const mine = useQuery({ queryKey: projectKeys.mine(), queryFn: () => api.listMine(), enabled: !!api && !!projectId });
    if (projectId && (!api || !config || mine.isPending)) return <Loading />;
    const to = linkTarget({ params, mine: mine.data?.items ?? [], resources: config?.resources ?? [], sections: { cloud: cloudProjectsEnabled, workspaces: llmEnabled, llm: llmEnabled } });
    // "~" leaves the /projects nest: the target is an address of the whole app.
    return <Redirect to={`~${to}`} replace />;
}
