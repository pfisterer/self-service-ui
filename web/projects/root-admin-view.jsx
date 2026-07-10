import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Alert, Badge, Button, Group, Loader, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { Delayed } from '/helper/delayed.jsx';
import { useClient } from '../providers/client.jsx';
import { useErrorModal } from '/providers/error-modal.jsx';

const sdkError = (res) => res?.error?.error ?? res?.error?.detail ?? res?.error?.message ?? (res?.error ? String(res.error) : null);

export function RootAdminView() {
    const { client, sdk } = useClient('projects');
    const { showError } = useErrorModal();
    const [status, setStatus] = useState(null);
    const [loaded, setLoaded] = useState(false);
    const [loadFailed, setLoadFailed] = useState(false);
    const [triggering, setTriggering] = useState(false);
    const [triggerSuccess, setTriggerSuccess] = useState(false);

    const fetchStatus = async () => {
        setLoadFailed(false);
        try {
            const res = await sdk.getAdminReconcileStatus({ client });
            if (res.response?.status === 503) { setStatus(null); return; }
            const err = sdkError(res);
            if (err) { showError(err); setLoadFailed(true); } else { setStatus(res.data); }
        } finally {
            setLoaded(true);
        }
    };

    useEffect(() => { if (client && sdk) fetchStatus(); }, [client, sdk]);

    const handleTrigger = async () => {
        setTriggering(true);
        setTriggerSuccess(false);
        const res = await sdk.triggerAdminReconcile({ client });
        const err = sdkError(res);
        if (err) { showError(`Failed to trigger sync: ${err}`); } else { setTriggerSuccess(true); }
        setTriggering(false);
    };

    // Loader only until the first status fetch resolves; the manual "Refresh"
    // button re-fetches without blanking the panel.
    if (!loaded) {
        return (
            <Delayed>
                <Group gap="xs" align="center">
                    <Loader size="sm" />
                    <Text size="sm">Loading sync status...</Text>
                </Group>
            </Delayed>
        );
    }

    if (!loadFailed && status === null) {
        return (<Text size="sm" c="dimmed">Reconciler is disabled.</Text>);
    }

    if (loadFailed) {
        return (
            <Button size="sm" variant="light" leftSection={<RefreshCw size="14" />} onClick={fetchStatus}>
                Retry
            </Button>
        );
    }

    const lastRun = status?.last_run_at ? new Date(status.last_run_at).toLocaleString() : '—';

    return (
        <Stack gap="md">
            <Group justify="space-between" align="center">
                <Title order={4}>OpenStack Sync Status</Title>
                <Group gap="xs">
                    {status?.running ? <Badge color="blue" variant="light">Running...</Badge> : null}
                    <Button
                        size="sm"
                        variant="light"
                        leftSection={<RefreshCw size="14" />}
                        onClick={fetchStatus}
                    >
                        Refresh
                    </Button>
                    <Button
                        size="sm"
                        loading={triggering}
                        onClick={handleTrigger}
                        disabled={status?.running}
                    >
                        Trigger Sync
                    </Button>
                </Group>
            </Group>

            {triggerSuccess ? (
                <Alert color="green">
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
        </Stack>
    );
}
