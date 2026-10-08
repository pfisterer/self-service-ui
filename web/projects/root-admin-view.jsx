import { useQuery } from '@tanstack/react-query';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { Alert, Badge, Button, Group, Paper, SimpleGrid, Stack, Table, Text, Title, Tooltip } from '@mantine/core';
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
                        <Text size="sm" fw={500}>{status?.imported_leaves ?? 0}</Text>
                    </Stack>
                    <Stack gap="2">
                        <Text size="xs" c="dimmed">{t('projects.rootAdmin.osOnlyRemoved')}</Text>
                        <Text size="sm" fw={500}>{status?.imported_removed ?? 0}</Text>
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

            <ProblemsTable runs={status?.recent_runs ?? []} problems={status?.problems ?? []} />

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

// ProblemsTable: what the recent runs logged as warnings and errors. The
// reconciler carries on past a failed grant or quota, so without this a
// mismatch between portal and OpenStack only shows up in the pod log.
function ProblemsTable({ runs, problems }) {
    const { t } = useTranslation();
    if (!runs.length) {
        return <Text size="sm" c="dimmed">{t('projects.rootAdmin.problemsNoRuns')}</Text>;
    }
    if (!problems.length) {
        return (
            <Text size="sm" c="dimmed">{t('projects.rootAdmin.problemsNone', { count: runs.length })}</Text>
        );
    }
    return (
        <Paper withBorder p="md" radius="sm">
            <Stack gap="xs">
                <Title order={5}>{t('projects.rootAdmin.problemsTitle')}</Title>
                <Text size="sm" c="dimmed">{t('projects.rootAdmin.problemsText', { count: runs.length })}</Text>
                <Table.ScrollContainer minWidth={720}>
                    <Table striped fz="xs" verticalSpacing="xs">
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>{t('projects.rootAdmin.problemLastSeen')}</Table.Th>
                                <Table.Th>
                                    <Tooltip label={t('projects.rootAdmin.problemRunsHelp', { count: runs.length })}>
                                        <span>{t('projects.rootAdmin.problemRuns')}</span>
                                    </Tooltip>
                                </Table.Th>
                                <Table.Th>{t('projects.rootAdmin.problemMessage')}</Table.Th>
                                <Table.Th>{t('projects.rootAdmin.problemProject')}</Table.Th>
                                <Table.Th>{t('projects.rootAdmin.problemError')}</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {problems.map((p, i) => (
                                <ProblemRow key={i} problem={p} total={runs.length} />
                            ))}
                        </Table.Tbody>
                    </Table>
                </Table.ScrollContainer>
            </Stack>
        </Paper>
    );
}

function ProblemRow({ problem: p, total }) {
    const { t } = useTranslation();
    // Every run means it will not go away by itself.
    const persistent = p.runs >= total;
    const fields = Object.entries(p.fields ?? {}).sort(([a], [b]) => a.localeCompare(b));
    return (
        <Table.Tr>
            <Table.Td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(p.last_seen)}</Table.Td>
            <Table.Td>
                <Badge size="sm" variant="light" color={persistent ? COLOR.negative : COLOR.attention}>
                    {p.runs}/{total}
                </Badge>
            </Table.Td>
            <Table.Td>
                <Group gap={6} wrap="nowrap" align="flex-start">
                    <Badge size="xs" variant="outline" color={p.level === 'error' ? COLOR.negative : COLOR.attention}>
                        {t(`projects.rootAdmin.problemLevel_${p.level === 'error' ? 'error' : 'warn'}`)}
                    </Badge>
                    <Text size="xs">{p.message}</Text>
                </Group>
                {fields.length ? (
                    <Text size="xs" c="dimmed" ff="monospace">
                        {fields.map(([k, v]) => `${k}=${v}`).join(' ')}
                    </Text>
                ) : null}
            </Table.Td>
            <Table.Td>
                {p.node_id ? <Text size="xs" ff="monospace">{p.node_id}</Text> : null}
                {p.os_project_id ? <Text size="xs" ff="monospace" c="dimmed">{p.os_project_id}</Text> : null}
            </Table.Td>
            <Table.Td>
                <Text size="xs" c="red" style={{ wordBreak: 'break-word' }}>{p.error}</Text>
            </Table.Td>
        </Table.Tr>
    );
}
