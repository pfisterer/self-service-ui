import { useEffect, useState } from 'react';
import { Route, Switch, useLocation, useRoute, Redirect } from 'wouter';
import { Box, Database, Shield, Users, ShieldCheck } from 'lucide-react';
import { Container, Tabs } from '@mantine/core';
import { useAuth } from '/providers/auth.jsx';
import { useClient } from '../providers/client.jsx';
import { ErrorBoundary } from '/helper/error-boundary.jsx';
import { GroupRoleSwitcher } from './component-group-role-switcher.jsx';
import { normalizeObjectResponse } from './util-project.jsx';

import { MyProjectsView } from './project-my-view.jsx';
import { ManageRequestsView } from './project-manage-view.jsx';
import { MyDelegationsView } from './delegation-view-to-me.jsx';
import { ManageDelegationsView } from './delegation-view-by-me.jsx';
import { RootAdminView } from './root-admin-view.jsx';

import { createContext } from 'react';
import { useContext } from 'react';

export const ProjectConfigContext = createContext(null);
export function useProjectConfig() {
    return useContext(ProjectConfigContext);
}

export function CloudProjectManagement() {
    const { client, sdk } = useClient('projects');
    const [, navigate] = useLocation();
    const { user, dev_user, useDummyAuth } = useAuth();
    const [projectConfig, setProjectConfig] = useState(null);
    const [isRoot, setIsRoot] = useState(false);

    const [matchProjects] = useRoute('/projects');
    const [matchRequests] = useRoute('/requests');
    const [matchMyDelegations] = useRoute('/my-delegations');
    const [matchDelegations] = useRoute('/delegations');
    const [matchAdminSync] = useRoute('/admin-sync');

    // Helper to determine which tab is active
    function getActiveSection() {
        if (matchProjects) return 'projects';
        if (matchRequests) return 'requests';
        if (matchMyDelegations) return 'my-delegations';
        if (matchDelegations) return 'delegations';
        if (matchAdminSync) return 'admin-sync';
        return '';
    }

    useEffect(() => {
        (async () => {
            const defaultResponse = { projects: [], openstackRoles: [], delegationStrategies: [], dummyDevUsers: [] };
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
                        <Tabs.Tab value="projects" leftSection={<Users size="16" />}>My Projects</Tabs.Tab>
                        <Tabs.Tab value="requests" leftSection={<Shield size="16" />}>Manage Project Requests</Tabs.Tab>
                        <Tabs.Tab value="delegations" leftSection={<Database size="16" />}>Delegations I've Made</Tabs.Tab>
                        <Tabs.Tab value="my-delegations" leftSection={<Box size="16" />}>Projects Delegated To Me</Tabs.Tab>
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
                        <Route path="/requests" component={ManageRequestsView} />
                        <Route path="/delegations" component={ManageDelegationsView} />
                        <Route path="/my-delegations" component={MyDelegationsView} />
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
