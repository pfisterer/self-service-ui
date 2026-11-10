import { createContext, useContext, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Route, Switch, useRoute, Redirect } from 'wouter';
import { Container } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { ErrorBoundary } from '/helper/error-boundary.jsx';
import { Loading } from '/helper/query-state.jsx';
import { TokenLabelProvider } from './token-labels.jsx';
import { useCloudStatus } from './cloud-status.jsx';

import { MyProjectsView } from './view-my-projects.jsx';
import { StartView } from './view-start.jsx';
import { MyBudgetsView } from './view-my-budgets.jsx';
import { RootAdminView } from './root-admin-view.jsx';
import { ApiTokens } from '/tokens/api-tokens.jsx';

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

const EMPTY_CONFIG = { resources: [], roles: [] };

// ProjectsShell gives the views of the budget tree what they share: /v1/config
// (resource definitions, OpenStack roles) through ProjectConfigContext, the token
// labels, and an error boundary per page. Every section that shows projects or
// budgets (Cloud, Workspaces, LLM, Budgets) renders its pages inside one.
function ProjectsShell({ page, children }) {
    const { t } = useTranslation();
    const api = useNodesApi();

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
                below, so moving between pages does not look them up again. */}
            <TokenLabelProvider>
            <Container size="xl" py="md">
                {/* Per-page boundary: a render crash in one page keeps the
                    navigation usable, and moving to another page (key change)
                    auto-resets it. */}
                <ErrorBoundary
                    key={page}
                    title={t('projects.shell.renderErrorTitle')}
                    message={t('projects.shell.renderErrorMessage')}
                >
                    <Suspense fallback={<div style={{ padding: '2rem' }}>{t('projects.actions.loading')}</div>}>
                        {children}
                    </Suspense>
                </ErrorBoundary>
            </Container>
            </TokenLabelProvider>
        </ProjectConfigContext.Provider>
    );
}

// AreaProjects is the project list of one area, for the sections Workspaces and LLM (mounted there under /projects).
export function AreaProjects({ area }) {
    return <ProjectsShell page={`projects-${area}`}><MyProjectsView area={area} /></ProjectsShell>;
}

// CloudSection (/cloud): the cloud projects, the API tokens of this API and its documentation.
export function CloudSection() {
    const [matchTokens] = useRoute('/tokens');
    const [matchApiDoc] = useRoute('/api-doc');
    return (
        <ProjectsShell page={matchTokens ? 'tokens' : matchApiDoc ? 'api-doc' : 'projects'}>
            <Switch>
                <Route path="/projects"><MyProjectsView area="cloud" /></Route>
                <Route path="/tokens"><ApiTokens scope="projects" /></Route>
                <Route path="/api-doc" component={CloudProjectsApiSwagger} />
                <Route><Redirect to="/projects" replace /></Route>
            </Switch>
        </ProjectsShell>
    );
}

// BudgetsSection (/budgets): the budgets the user manages, and the root admin pages.
export function BudgetsSection() {
    const { isRoot, ready } = useCloudStatus();
    const [matchAdmin] = useRoute('/admin/:page?');
    return (
        <ProjectsShell page={matchAdmin ? 'admin' : 'budgets'}>
            <Switch>
                {/* Before the budget id: "admin" is no budget. Registered for
                    root admins only, and only once that is KNOWN: isRoot starts
                    false on every page load, and acting on behalf of somebody
                    turns it false from the page the admin stood on. */}
                {isRoot ? <Route path="/admin/:page?" component={RootAdminView} /> : null}
                {!ready && <Route path="/admin/:page?"><Loading size="sm" /></Route>}
                <Route path="/:id?" component={MyBudgetsView} />
            </Switch>
        </ProjectsShell>
    );
}

// ProjectsStart (/projects): the start page that gets somebody a project of an area
// (/projects/start?for=…, linked from the other services).
export function ProjectsStart() {
    return (
        <ProjectsShell page="start">
            <Route path="/start" component={StartView} />
        </ProjectsShell>
    );
}
