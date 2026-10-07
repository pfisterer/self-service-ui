import { useQuery } from '@tanstack/react-query';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { Alert, Badge, Button, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { CodeBlock } from '/helper/codeblock.jsx';
import { Loading, LoadError, useApiMutation } from '/helper/query-state.jsx';
import { useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { Trans, useTranslation } from 'react-i18next';
import { COLOR } from './util-project.jsx';
import { formatDateTime } from '../format-date.js';
import { UsageReportPanel } from './component-usage.jsx';


// The reconciler writes each managed project's state as Keystone tags (status,
// termination date, contact, …), so "what is there and in which state" is
// answerable from a shell with OpenStack credentials — no account here, no
// database access. The query is shown rather than run: it reads the cloud
// directly, which is the point of having it, and an admin holding those
// credentials is who it is for.
//
// Notes on the shape: /v3/projects is used instead of `openstack project list`
// because the CLI does not print tags; `prefix:value` tags become an object, the
// rest stays a list, so nothing here has to know which prefixes exist.
// OS_AUTH_URL comes with or without /v3, depending on the openrc.
function managedProjectsQuery(tag) {
    return [
        'TOKEN=$(openstack token issue -f value -c id) &&',
        `curl -s -H "X-Auth-Token: $TOKEN" "\${OS_AUTH_URL%/v3}/v3/projects?tags=${tag}" \\`,
        "  | jq '[.projects[] | {",
        '        id, name, enabled, description,',
        '        tags:   ([.tags[]? | capture("^(?<key>[^:]+):(?<value>.*)$")] | from_entries),',
        '        labels: [.tags[]? | select(contains(":") | not)]',
        "      }] | sort_by(.name)'",
    ].join('\n');
}

// RootAdminView: the reconciler's state, and the evaluation of what all
// projects used — which needs no reconciler to be read.
export function RootAdminView() {
    return (
        <Stack gap="xl">
            <ReconcilerPanel />
            <UsageReportPanel />
        </Stack>
    );
}

function ReconcilerPanel() {
    const api = useNodesApi();

    const statusQuery = useQuery({
        queryKey: projectKeys.rootStatus().concat('reconcile'),
        queryFn: () => api.getReconcileStatus(),
        enabled: !!api,
    });

    const { t } = useTranslation();

    const trigger = useApiMutation({
        mutationFn: () => api.triggerReconcile(),
        invalidates: [projectKeys.rootStatus()],
    });

    // Loader only until the first status fetch resolves; the manual "Refresh"
    // button re-fetches without blanking the panel.
    if (!api || statusQuery.isPending) return <Loading size="sm" />;
    if (statusQuery.isError) return <LoadError query={statusQuery} title={t('projects.rootAdmin.loadError')} />;

    // null (a 503 from the API) means the reconciler is switched off here.
    const status = statusQuery.data;
    if (status === null) {
        return (<Text size="sm" c="dimmed">{t('projects.rootAdmin.disabled')}</Text>);
    }

    const lastRun = status?.last_run_at ? formatDateTime(status.last_run_at) : '—';

    return (
        <Stack gap="md">
            <Group justify="space-between" align="center">
                <Title order={4}>{t('projects.rootAdmin.title')}</Title>
                <Group gap="xs">
                    {status?.running ? <Badge color={COLOR.info} variant="light">{t('projects.rootAdmin.running')}</Badge> : null}
                    <Button
                        size="sm"
                        variant="light"
                        leftSection={<RefreshCw size="14" />}
                        onClick={() => statusQuery.refetch()}
                        loading={statusQuery.isFetching}
                    >
                        {t('projects.rootAdmin.refresh')}
                    </Button>
                    <Button
                        size="sm"
                        loading={trigger.isPending}
                        onClick={() => trigger.mutate()}
                        disabled={status?.running}
                    >
                        {t('projects.rootAdmin.trigger')}
                    </Button>
                </Group>
            </Group>

            {trigger.isSuccess ? (
                <Alert color={COLOR.positive}>
                    {t('projects.rootAdmin.triggered')}
                </Alert>
            ) : null}

            <Paper withBorder p="md" radius="sm">
                <SimpleGrid cols={3} spacing="md">
                    <Stack gap="2">
                        <Text size="xs" c="dimmed">{t('projects.rootAdmin.lastRun')}</Text>
                        <Text size="sm" fw={500}>{lastRun}</Text>
                    </Stack>
                    <Stack gap="2">
                        <Text size="xs" c="dimmed">{t('projects.rootAdmin.projectsSynced')}</Text>
                        <Text size="sm" fw={500}>{status?.projects_synced ?? 0}</Text>
                    </Stack>
                    <Stack gap="2">
                        <Text size="xs" c="dimmed">{t('projects.rootAdmin.projectsCreated')}</Text>
                        <Text size="sm" fw={500}>{status?.projects_created ?? 0}</Text>
                    </Stack>
                    <Stack gap="2">
                        <Text size="xs" c="dimmed">{t('projects.rootAdmin.osOnlyImported')}</Text>
                        <Text size="sm" fw={500}>{status?.os_only_imported ?? 0}</Text>
                    </Stack>
                    <Stack gap="2">
                        <Text size="xs" c="dimmed">{t('projects.rootAdmin.osOnlyRemoved')}</Text>
                        <Text size="sm" fw={500}>{status?.os_only_removed ?? 0}</Text>
                    </Stack>
                    <Stack gap="2">
                        <Text size="xs" c="dimmed">{t('projects.rootAdmin.orphanedUsersRemoved')}</Text>
                        <Text size="sm" fw={500}>{status?.orphaned_users_removed ?? 0}</Text>
                    </Stack>
                    <Stack gap="2">
                        <Text size="xs" c="dimmed">{t('projects.rootAdmin.lastError')}</Text>
                        <Text size="sm" fw={500} c={status?.last_error ? 'red' : 'dimmed'}>
                            {status?.last_error || '—'}
                        </Text>
                    </Stack>
                </SimpleGrid>
            </Paper>

            {status?.managed_tag ? (
                <Paper withBorder p="md" radius="sm">
                    <Stack gap="xs">
                        <Title order={5}>{t('projects.rootAdmin.cliTitle')}</Title>
                        <Text size="sm" c="dimmed">
                            <Trans i18nKey="projects.rootAdmin.cliText"
                                values={{ tag: status.managed_tag }}
                                components={{ 1: <Text span ff="monospace" size="sm" /> }} />
                        </Text>
                        <CodeBlock language="bash" code={managedProjectsQuery(status.managed_tag)} />
                    </Stack>
                </Paper>
            ) : null}

            {/* Users whose Keystone account could not be resolved without guessing.
                Their role was NOT assigned — without this panel that stays invisible
                until someone reports missing access. */}
            {status?.preseed_conflicts?.length ? (
                <Alert color={COLOR.attention} icon={<AlertTriangle size="16" />}
                    title={t('projects.rootAdmin.preseedTitle')}>
                    <Text size="sm" mb="xs">{t('projects.rootAdmin.preseedText')}</Text>
                    <Stack gap="xs">
                        {status.preseed_conflicts.map((c, i) => (
                            <div key={`${c.email}-${i}`}>
                                <Text size="sm" fw={600}>{c.email}</Text>
                                <Text size="xs" c="dimmed">{c.reason}</Text>
                            </div>
                        ))}
                    </Stack>
                </Alert>
            ) : null}
        </Stack>
    );
}
