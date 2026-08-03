import { createContext, useContext, useEffect, useState } from 'react';
import { Route, Switch, useLocation, useRoute, Redirect } from 'wouter';
import { FolderKanban, Inbox, ShieldCheck, Wallet } from 'lucide-react';
import { Container, Tabs } from '@mantine/core';
import { useAuth } from '/providers/auth.jsx';
import { useClient } from '../providers/client.jsx';
import { ErrorBoundary } from '/helper/error-boundary.jsx';
import { GroupRoleSwitcher } from './component-group-role-switcher.jsx';
import { normalizeObjectResponse } from './util-project.jsx';

import { MyProjectsView } from './view-my-projects.jsx';
import { MyBudgetsView } from './view-my-budgets.jsx';
import { ApprovalsView } from './view-approvals.jsx';
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
    const [isRoot, setIsRoot] = useState(false);

    const [matchProjects] = useRoute('/projects');
    const [matchBudgets] = useRoute('/budgets');
    const [matchApprovals] = useRoute('/approvals');
    const [matchAdminSync] = useRoute('/admin-sync');

    function getActiveSection() {
        if (matchProjects) return 'projects';
        if (matchBudgets) return 'budgets';
        if (matchApprovals) return 'approvals';
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

    // Use role switch eligibility as a proxy for root user status.
    useEffect(() => {
        if (!client || !sdk) return;
        (async () => {
            try {
                const res = await sdk.getRoleSwitch({ client });
                // `allowed` reflects the REAL caller's role-switch capability, which
                // stays true while impersonating (so they can still hit Reset). Identity
                // impersonation drops root from the effective identity, so the Root Admin
                // tab must follow the impersonated user (not root) — hide it whenever an
                // identity is being impersonated. Group override keeps root, so it stays.
                setIsRoot(!!res?.data?.allowed && !res?.data?.impersonated_user);
            } catch (_) {
                setIsRoot(false);
            }
        })();
    }, [client, sdk]);

    return (
        <ProjectConfigContext.Provider value={projectConfig}>
            <Container size="xl" py="md">

                <GroupRoleSwitcher />

                <Tabs value={getActiveSection()} onChange={(val) => val && navigate(`/${val}`)} mb="lg">
                    <Tabs.List>
                        <Tabs.Tab value="projects" leftSection={<FolderKanban size="16" />}>My Projects</Tabs.Tab>
                        <Tabs.Tab value="approvals" leftSection={<Inbox size="16" />}>Approvals</Tabs.Tab>
                        <Tabs.Tab value="budgets" leftSection={<Wallet size="16" />}>My Budgets</Tabs.Tab>
                        {isRoot ? <Tabs.Tab value="admin-sync" leftSection={<ShieldCheck size="16" />}>Root Admin</Tabs.Tab> : null}
                    </Tabs.List>
                </Tabs>

                {/* Per-tab boundary: a render crash in one tab keeps the tab bar +
                    role switcher usable, and switching tabs (key change) auto-resets
                    it. The outer section boundary in index.jsx would blank all of
                    /projects instead. */}
                <ErrorBoundary
                    key={getActiveSection()}
                    title="This view failed to render"
                    message="Switch to another tab or reload the page. If it persists, a record on this tab may be malformed."
                >
                    <Switch>
                        <Route path="/projects" component={MyProjectsView} />
                        <Route path="/budgets" component={MyBudgetsView} />
                        <Route path="/approvals" component={ApprovalsView} />
                        {isRoot ? <Route path="/admin-sync" component={RootAdminView} /> : null}
                        <Route path="/">
                            <Redirect to="/projects" replace />
                        </Route>
                    </Switch>
                </ErrorBoundary>
            </Container>
        </ProjectConfigContext.Provider>
    );
}
