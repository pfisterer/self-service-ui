import { useEffect, useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { Route, Switch, useLocation, useRoute } from 'wouter-preact';
import { Box, Database, Shield, Users, ShieldCheck } from 'lucide-preact';
import { Container, Tabs } from '@mantine/core';
import { useAuth } from '/providers/auth.js';
import { useClient } from '../providers/client.js';
import { GroupRoleSwitcher } from './component-group-role-switcher.js';
import { normalizeObjectResponse } from './util-project.js';

import { MyProjectsView } from './project-my-view.js';
import { ManageRequestsView } from './project-manage-view.js';
import { MyDelegationsView } from './delegation-view-to-me.js';
import { ManageDelegationsView } from './delegation-view-by-me.js';
import { RootAdminView } from './root-admin-view.js';

import { createContext } from 'preact';
import { useContext } from 'preact/hooks';

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
                setIsRoot(!!res?.data?.allowed);
            } catch (_) {
                setIsRoot(false);
            }
        })();
    }, [client, sdk]);

    return html`
        <${ProjectConfigContext.Provider} value=${projectConfig}>
            <${Container} size="xl" py="md">

                <${GroupRoleSwitcher} />

                <${Tabs} value=${getActiveSection()} onChange=${(val) => val && navigate(`/${val}`)} mb="lg">
                    <${Tabs.List}>
                        <${Tabs.Tab} value="projects" leftSection=${html`<${Users} size="16" />`}>My Projects<//>
                        <${Tabs.Tab} value="requests" leftSection=${html`<${Shield} size="16" />`}>Manage Project Requests<//>
                        <${Tabs.Tab} value="delegations" leftSection=${html`<${Database} size="16" />`}>Delegations I've Made<//>
                        <${Tabs.Tab} value="my-delegations" leftSection=${html`<${Box} size="16" />`}>Projects Delegated To Me<//>
                        ${isRoot ? html`<${Tabs.Tab} value="admin-sync" leftSection=${html`<${ShieldCheck} size="16" />`}>Root Admin<//>` : null}
                    <//>
                <//>

                <${Switch}>
                    <${Route} path="/projects" component=${MyProjectsView} />
                    <${Route} path="/requests" component=${ManageRequestsView} />
                    <${Route} path="/delegations" component=${ManageDelegationsView} />
                    <${Route} path="/my-delegations" component=${MyDelegationsView} />
                    ${isRoot ? html`<${Route} path="/admin-sync" component=${RootAdminView} />` : null}
                    <${Route} path="/">
                        ${() => { navigate('/projects', { replace: true }); return null; }}
                    <//>
                <//>
            <//>
        <//>
    `;
}
