import { useEffect, useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { RefreshCw } from 'lucide-preact';
import { Alert, Badge, Button, Group, Loader, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useClient } from '../providers/client.js';
import { useErrorModal } from '/providers/error-modal.js';

const sdkError = (res) => res?.error?.error ?? res?.error?.detail ?? res?.error?.message ?? (res?.error ? String(res.error) : null);

export function RootAdminView() {
    const { client, sdk } = useClient('projects');
    const { showError } = useErrorModal();
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const [triggering, setTriggering] = useState(false);
    const [triggerSuccess, setTriggerSuccess] = useState(false);

    const fetchStatus = async () => {
        setLoading(true);
        setLoadFailed(false);
        const res = await sdk.getAdminReconcileStatus({ client });
        if (res.response?.status === 503) { setStatus(null); setLoading(false); return; }
        const err = sdkError(res);
        if (err) { showError(err); setLoadFailed(true); } else { setStatus(res.data); }
        setLoading(false);
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

    if (loading) {
        return html`
            <${Group} gap="xs" align="center">
                <${Loader} size="sm" />
                <${Text} size="sm">Loading sync status...<//>
            <//>
        `;
    }

    if (!loading && !loadFailed && status === null) {
        return html`<${Text} size="sm" c="dimmed">Reconciler is disabled.<//>`;
    }

    if (loadFailed) {
        return html`
            <${Button} size="sm" variant="light" leftSection=${html`<${RefreshCw} size="14" />`} onClick=${fetchStatus}>
                Retry
            <//>
        `;
    }

    const lastRun = status?.last_run_at ? new Date(status.last_run_at).toLocaleString() : '—';

    return html`
        <${Stack} gap="md">
            <${Group} justify="space-between" align="center">
                <${Title} order=${4}>OpenStack Sync Status<//>
                <${Group} gap="xs">
                    ${status?.running ? html`<${Badge} color="blue" variant="light">Running...<//>` : null}
                    <${Button}
                        size="sm"
                        variant="light"
                        leftSection=${html`<${RefreshCw} size="14" />`}
                        onClick=${fetchStatus}
                    >
                        Refresh
                    <//>
                    <${Button}
                        size="sm"
                        loading=${triggering}
                        onClick=${handleTrigger}
                        disabled=${status?.running}
                    >
                        Trigger Sync
                    <//>
                <//>
            <//>

            ${triggerSuccess ? html`
                <${Alert} color="green">
                    Sync triggered. Refresh status in a moment.
                <//>
            ` : null}

            <${Paper} withBorder p="md" radius="sm">
                <${SimpleGrid} cols=${3} spacing="md">
                    <${Stack} gap="2">
                        <${Text} size="xs" c="dimmed">Last Run<//>
                        <${Text} size="sm" fw=${500}>${lastRun}<//>
                    <//>
                    <${Stack} gap="2">
                        <${Text} size="xs" c="dimmed">Projects Synced<//>
                        <${Text} size="sm" fw=${500}>${status?.projects_synced ?? 0}<//>
                    <//>
                    <${Stack} gap="2">
                        <${Text} size="xs" c="dimmed">Projects Created<//>
                        <${Text} size="sm" fw=${500}>${status?.projects_created ?? 0}<//>
                    <//>
                    <${Stack} gap="2">
                        <${Text} size="xs" c="dimmed">OS-Only Imported<//>
                        <${Text} size="sm" fw=${500}>${status?.os_only_imported ?? 0}<//>
                    <//>
                    <${Stack} gap="2">
                        <${Text} size="xs" c="dimmed">OS-Only Removed<//>
                        <${Text} size="sm" fw=${500}>${status?.os_only_removed ?? 0}<//>
                    <//>
                    <${Stack} gap="2">
                        <${Text} size="xs" c="dimmed">Orphaned Users Removed<//>
                        <${Text} size="sm" fw=${500}>${status?.orphaned_users_removed ?? 0}<//>
                    <//>
                    <${Stack} gap="2">
                        <${Text} size="xs" c="dimmed">Last Error<//>
                        <${Text} size="sm" fw=${500} c=${status?.last_error ? 'red' : 'dimmed'}>
                            ${status?.last_error || '—'}
                        <//>
                    <//>
                <//>
            <//>
        <//>
    `;
}
