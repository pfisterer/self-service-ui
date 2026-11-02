import { Route, Switch, Redirect } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Alert, Container } from '@mantine/core';
import { LoadError, Loading } from '/helper/query-state.jsx';
import { useLlmMe } from '/llm/use-llm-me.jsx';
import { hasWorkspaces } from '/gpu/access.js';
import { GpuServers } from '/gpu/servers.jsx';
import { GpuStart } from '/gpu/start.jsx';
import { GpuUsage } from '/gpu/usage.jsx';
import { GpuFleet } from '/gpu/fleet.jsx';
import { GpuJobDetail, GpuJobs } from '/gpu/jobs.jsx';
import { GpuJobSubmit } from '/gpu/job-submit.jsx';
import { NoProject } from '/projects/no-project.jsx';
import { AreaProjects } from '/projects/projects.jsx';

// Workspaces (docs/plan-workspaces.md): running servers, batch jobs and usage. A project's workspace settings open from its card under Projects (gpu/workspace-settings.jsx). Served by llm-management-api; who may use it is its decision: a member of a project (workspace_projects in /v1/me); admins always, they manage the projects. Without a project it offers the way to one.
export function GpuManagement() {
    const { t } = useTranslation();
    const { query, me, isAdmin } = useLlmMe();

    if (query.isPending) return <Container size="lg" py="md"><Loading /></Container>;
    if (query.isError) return <Container size="lg" py="md"><LoadError query={query} /></Container>;
    // The projects of this area are there for everybody: they are the way to a first one.
    const projects = <Route path="/projects"><AreaProjects area="workspaces" /></Route>;
    if (!hasWorkspaces(me, isAdmin)) {
        return (
            <Switch>
                {projects}
                <Route><NoProject area="workspaces" title={t('gpu.noAccess.title')} text={t('gpu.noAccess.text')} /></Route>
            </Switch>
        );
    }
    return (
        <Switch>
            {projects}
            <Route path="/servers/start" component={GpuStart} />
            <Route path="/servers" component={GpuServers} />
            <Route path="/jobs/new" component={GpuJobSubmit} />
            <Route path="/jobs/:id" component={GpuJobDetail} />
            <Route path="/jobs" component={GpuJobs} />
            <Route path="/usage" component={GpuUsage} />
            <Route path="/gpus" component={GpuFleet} />
            <Route path="/"><Redirect to="/servers" replace /></Route>
            <Route>
                <Container size="md" py="md">
                    <Alert color="gray" variant="light">{t('gpu.noAccess.page')}</Alert>
                </Container>
            </Route>
        </Switch>
    );
}
