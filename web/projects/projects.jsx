import { createContext, useContext, useEffect, useState } from 'react';
import { Route, Switch, useLocation, useRoute, Redirect } from 'wouter';
import { Container } from '@mantine/core';
import { useAuth } from '/providers/auth.jsx';
import { useClient } from '../providers/client.jsx';
import { ErrorBoundary } from '/helper/error-boundary.jsx';
import { GroupRoleSwitcher } from './component-group-role-switcher.jsx';
import { TokenLabelProvider } from './token-labels.jsx';
import { useCloudStatus } from './cloud-status.jsx';
import { normalizeObjectResponse } from './util-project.jsx';

import { MyProjectsView } from './view-my-projects.jsx';
import { MyBudgetsView } from './view-my-budgets.jsx';
import { RootAdminView } from './root-admin-view.jsx';

// ProjectConfigContext distributes /v1/config (resource definitions, OpenStack
// roles, dev users) to every view below.
export const ProjectConfigContext = createContext(null);
export function useProjectConfig() {
    return useContext(ProjectConfigContext);
}

// CloudProjectManagement is the cloud resources section: one budget tree in
// which budgets are delegated downwards and projects hang as leaves.
export function CloudProjectManagement() {
    const { client, sdk } = useClient('projects');
    const [, navigate] = useLocation();
    const { user, dev_user, useDummyAuth } = useAuth();
    const [projectConfig, setProjectConfig] = useState(null);
    const { isRoot } = useCloudStatus();

    // Which section is showing — used to key the error boundary, so a crash in
    // one section resets when the user navigates to another.
    const [matchProjects] = useRoute('/projects');
    const [matchBudgets] = useRoute('/budgets');
    const [matchAdminSync] = useRoute('/admin-sync');

    function getActiveSection() {
        if (matchProjects) return 'projects';
        if (matchBudgets) return 'budgets';
        if (matchAdminSync) return 'admin-sync';
        return '';
    }

    useEffect(() => {
        (async () => {
            const defaultResponse = { resources: [], openstackRoles: [], dummyDevUsers: [] };
            try {
                const cfgRes = await sdk.getConfig({ client });
                setProjectConfig(normalizeObjectResponse(cfgRes, defaultResponse));
            } catch (_) {
                setProjectConfig(defaultResponse);
            }
        })();
    }, [client, sdk, user?.email, dev_user, useDummyAuth]);

    return (
        <ProjectConfigContext.Provider value={projectConfig}>
            {/* Group labels are resolved once per token and shared by every view
                below, so moving between sections does not look them up again. */}
            <TokenLabelProvider>
            <Container size="xl" py="md">

                <GroupRoleSwitcher />

                {/* Per-section boundary: a render crash in one section keeps the
                    role switcher and the navigation usable, and moving to another
                    section (key change) auto-resets it. The outer boundary in
                    index.jsx would blank all of /projects instead. */}
                <ErrorBoundary
                    key={getActiveSection()}
                    title="This view failed to render"
                    message="Switch to another section or reload the page. If it persists, a record here may be malformed."
                >
                    <Switch>
                        <Route path="/projects" component={MyProjectsView} />
                        <Route path="/budgets" component={MyBudgetsView} />
                        {isRoot ? <Route path="/admin-sync" component={RootAdminView} /> : null}
                        <Route path="/">
                            <Redirect to="/projects" replace />
                        </Route>
                    </Switch>
                </ErrorBoundary>
            </Container>
            </TokenLabelProvider>
        </ProjectConfigContext.Provider>
    );
}
