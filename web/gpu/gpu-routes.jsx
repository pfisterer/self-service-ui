import { Route, Switch, Redirect } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Alert, Container } from '@mantine/core';
import { LoadError, Loading } from '/helper/query-state.jsx';
import { useLlmMe } from '/llm/use-llm-me.jsx';
import { GpuEnvironments } from '/gpu/environments.jsx';
import { GpuServers } from '/gpu/servers.jsx';

// The GPU section: environments from Git repositories and JupyterHub servers in the GPU cluster. Served by llm-management-api; who may use it is its decision (an access rule with a GPU tier, reported as gpu_tier in /v1/me).
export function GpuManagement() {
    const { t } = useTranslation();
    const { query, me } = useLlmMe();

    if (query.isPending) return <Container size="lg" py="md"><Loading /></Container>;
    if (query.isError) return <Container size="lg" py="md"><LoadError query={query} /></Container>;
    if (!me?.gpu_tier) {
        return (
            <Container size="md" py="md">
                <Alert color="gray" variant="light" title={t('gpu.noAccess.title')}>{t('gpu.noAccess.text')}</Alert>
            </Container>
        );
    }
    return (
        <Switch>
            <Route path="/environments" component={GpuEnvironments} />
            <Route path="/servers" component={GpuServers} />
            <Route path="/"><Redirect to="/environments" replace /></Route>
            <Route>
                <Container size="md" py="md">
                    <Alert color="gray" variant="light">{t('gpu.noAccess.page')}</Alert>
                </Container>
            </Route>
        </Switch>
    );
}
