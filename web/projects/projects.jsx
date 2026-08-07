import { createContext, useContext, lazy, Suspense } from 'react';
import { Route, Switch, useRoute, Redirect } from 'wouter';
import { Container } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { ErrorBoundary } from '/helper/error-boundary.jsx';
import { Loading } from '/helper/query-state.jsx';
import { RoleSwitchPanel } from './component-group-role-switcher.jsx';
import { TokenLabelProvider } from './token-labels.jsx';
import { useCloudStatus } from './cloud-status.jsx';

import { MyProjectsView } from './view-my-projects.jsx';
import { MyBudgetsView } from './view-my-budgets.jsx';
import { RootAdminView } from './root-admin-view.jsx';

// Swagger UI is ~1 MB — load it only when the API-doc route is opened. Same
// component as the dyndns section's, pointed at the other API.
const CloudProjectsApiSwagger = lazy(() =>
    import('/swagger/swagger.jsx').then(m => ({ default: m.CloudProjectsApiSwagger })));

// ProjectConfigContext distributes /v1/config (resource definitions, OpenStack
// roles, dev users) to every view below.
export const ProjectConfigContext = createContext(null);
export function useProjectConfig() {
    return useContext(ProjectConfigContext);
}

// CloudProjectManagement is the cloud resources section: one budget tree in
// which budgets are delegated downwards and projects hang as leaves.
const EMPTY_CONFIG = { resources: [], openstackRoles: [], dummyDevUsers: [] };

export function CloudProjectManagement() {
    const api = useNodesApi();
    const { isRoot, ready } = useCloudStatus();

    // Which section is showing — used to key the error boundary, so a crash in
    // one section resets when the user navigates to another.
    const [matchProjects] = useRoute('/projects');
    const [matchBudgets] = useRoute('/budgets');
    const [matchAdminSync] = useRoute('/admin-sync');
    const [matchApiDoc] = useRoute('/api-doc');

    function getActiveSection() {
        if (matchProjects) return 'projects';
        if (matchBudgets) return 'budgets';
        if (matchAdminSync) return 'admin-sync';
        if (matchApiDoc) return 'api-doc';
        return '';
    }

    // Through the facade like everything else, and cached: the config is asked
    // for by several views. A failure falls back to empty lists rather than
    // blocking the section — the views degrade to "nothing configured".
    const configQuery = useQuery({
        queryKey: projectKeys.config(),
        queryFn: () => api.getConfig(),
        enabled: !!api,
        retry: false,
    });
    const projectConfig = api
        ? (configQuery.isPending ? null : (configQuery.data ?? EMPTY_CONFIG))
        : null;

    return (
        <ProjectConfigContext.Provider value={projectConfig}>
            {/* Group labels are resolved once per token and shared by every view
                below, so moving between sections does not look them up again. */}
            <TokenLabelProvider>
            <Container size="xl" py="md">

                {/* Open, the role switch is a bar across the content. Collapsed,
                    it is a single button at the right end of this section's nav
                    bar (see header.jsx), so it costs neither a row nor a column
                    of width — and it stays reachable when the page under it
                    changes, which is what impersonating drops you into. */}
                <RoleSwitchPanel />

                {/* Per-section boundary: a render crash in one section keeps the
                    role switcher and the navigation usable, and moving to another
                    section (key change) auto-resets it. The outer boundary in
                    index.jsx would blank all of /projects instead. */}
                <ErrorBoundary
                    key={getActiveSection()}
                    title="This view failed to render"
                    message="Switch to another section or reload the page. If it persists, a record here may be malformed."
                >
                    <Suspense fallback={<div style={{ padding: '2rem' }}>Lädt…</div>}>
                        <Switch>
                            <Route path="/projects" component={MyProjectsView} />
                            <Route path="/budgets" component={MyBudgetsView} />
                            {isRoot ? <Route path="/admin-sync" component={RootAdminView} /> : null}
                            <Route path="/api-doc" component={CloudProjectsApiSwagger} />
                            {/* /projects itself, before anything is known. */}
                            <Route path="/">
                                <Redirect to="/projects" replace />
                            </Route>
                            {/* Catch-all: the admin route above UNREGISTERS the
                                moment isRoot goes false, which is what impersonating
                                a student does — from the page the admin was standing
                                on. Without this the content area goes blank on a URL
                                that no longer matches anything.

                                Only once the status is KNOWN, though. isRoot starts
                                false on every page load, so redirecting before the
                                answer arrives throws a root admin off /admin-sync on
                                every single reload — which is exactly what it did. */}
                            <Route>
                                {ready ? <Redirect to="/projects" replace /> : <Loading size="sm" />}
                            </Route>
                        </Switch>
                    </Suspense>
                </ErrorBoundary>
            </Container>
            </TokenLabelProvider>
        </ProjectConfigContext.Provider>
    );
}
