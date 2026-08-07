import { useQuery } from '@tanstack/react-query';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { Alert, Badge, Button, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { Loading, LoadError, useApiMutation } from '/helper/query-state.jsx';
import { useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { COLOR } from './util-project.jsx';


export function RootAdminView() {
    const api = useNodesApi();

    const statusQuery = useQuery({
        queryKey: projectKeys.rootStatus().concat('reconcile'),
        queryFn: () => api.getReconcileStatus(),
        enabled: !!api,
    });

    const trigger = useApiMutation({
        mutationFn: () => api.triggerReconcile(),
        invalidates: [projectKeys.rootStatus()],
    });

    // Loader only until the first status fetch resolves; the manual "Refresh"
    // button re-fetches without blanking the panel.
    if (!api || statusQuery.isPending) return <Loading size="sm" />;
    if (statusQuery.isError) return <LoadError query={statusQuery} title="Could not load sync status" />;

    // null (a 503 from the API) means the reconciler is switched off here.
    const status = statusQuery.data;
    if (status === null) {
        return (<Text size="sm" c="dimmed">Reconciler is disabled.</Text>);
    }

    const lastRun = status?.last_run_at ? new Date(status.last_run_at).toLocaleString() : '—';

    return (
        <Stack gap="md">
            <Group justify="space-between" align="center">
                <Title order={4}>OpenStack Sync Status</Title>
                <Group gap="xs">
                    {status?.running ? <Badge color={COLOR.info} variant="light">Running...</Badge> : null}
                    <Button
                        size="sm"
                        variant="light"
                        leftSection={<RefreshCw size="14" />}
                        onClick={() => statusQuery.refetch()}
                        loading={statusQuery.isFetching}
                    >
                        Refresh
                    </Button>
                    <Button
                        size="sm"
                        loading={trigger.isPending}
                        onClick={() => trigger.mutate()}
                        disabled={status?.running}
                    >
                        Trigger Sync
                    </Button>
                </Group>
            </Group>

            {trigger.isSuccess ? (
                <Alert color={COLOR.positive}>
                    Sync triggered. Refresh status in a moment.
                </Alert>
            ) : null}

            <Paper withBorder p="md" radius="sm">
                <SimpleGrid cols={3} spacing="md">
                    <Stack gap="2">
                        <Text size="xs" c="dimmed">Last Run</Text>
                        <Text size="sm" fw={500}>{lastRun}</Text>
                    </Stack>
                    <Stack gap="2">
                        <Text size="xs" c="dimmed">Projects Synced</Text>
                        <Text size="sm" fw={500}>{status?.projects_synced ?? 0}</Text>
                    </Stack>
                    <Stack gap="2">
                        <Text size="xs" c="dimmed">Projects Created</Text>
                        <Text size="sm" fw={500}>{status?.projects_created ?? 0}</Text>
                    </Stack>
                    <Stack gap="2">
                        <Text size="xs" c="dimmed">OS-Only Imported</Text>
                        <Text size="sm" fw={500}>{status?.os_only_imported ?? 0}</Text>
                    </Stack>
                    <Stack gap="2">
                        <Text size="xs" c="dimmed">OS-Only Removed</Text>
                        <Text size="sm" fw={500}>{status?.os_only_removed ?? 0}</Text>
                    </Stack>
                    <Stack gap="2">
                        <Text size="xs" c="dimmed">Orphaned Users Removed</Text>
                        <Text size="sm" fw={500}>{status?.orphaned_users_removed ?? 0}</Text>
                    </Stack>
                    <Stack gap="2">
                        <Text size="xs" c="dimmed">Last Error</Text>
                        <Text size="sm" fw={500} c={status?.last_error ? 'red' : 'dimmed'}>
                            {status?.last_error || '—'}
                        </Text>
                    </Stack>
                </SimpleGrid>
            </Paper>

            {/* Users whose Keystone account could not be resolved without guessing.
                Their role was NOT assigned — without this panel that stays invisible
                until someone reports missing access. */}
            {status?.preseed_conflicts?.length ? (
                <Alert color={COLOR.attention} icon={<AlertTriangle size="16" />}
                    title={`${status.preseed_conflicts.length} user(s) could not be prepared in OpenStack`}>
                    <Text size="sm" mb="xs">
                        These people did not get their role. Their OpenStack account is ambiguous — most
                        often the OIDC username differs from the email address. Assign the role to the
                        correct account by hand, or correct the username; the next sync retries.
                    </Text>
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
