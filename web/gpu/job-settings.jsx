import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Group, Modal, Stack } from '@mantine/core';
import { useGpuApi } from '/gpu/api-gpu.jsx';
import { gpuKeys } from '/gpu/query-keys.js';
import { BatchJobsBox, useWorkspaceSettings } from '/gpu/workspace-settings.jsx';

// JobSettingsModal switches batch jobs on in a project from the jobs page, where they are missed: the same box as in the project's dialog (Workspaces tab), saved at once. Only admins set a project's limits, so only they get here.
export function JobSettingsModal({ project, opened, onClose }) {
    const { t } = useTranslation();
    const api = useGpuApi();
    const draft = useWorkspaceSettings(opened ? project?.tree_node || null : null, opened);
    const catalog = useQuery({ queryKey: gpuKeys.catalog(), queryFn: () => api.catalog(), staleTime: 10 * 60 * 1000, enabled: opened });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const p = draft.value;
    const setLimit = (k, v) => draft.update(cur => ({ ...cur, limits: { ...cur.limits, [k]: Number(v) || 0 } }));
    const save = async () => {
        setBusy(true); setError('');
        try {
            await draft.save();
            onClose();
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };
    return (
        <Modal opened={opened} onClose={onClose} size="lg" title={t('gpu.jobs.settings.title', { project: project?.name || project?.slug })}>
            {p && (
                <Stack gap="md">
                    <BatchJobsBox p={p} setLimit={setLimit} locked={false} classes={catalog.data?.gpuClasses ?? []} />
                    {error && <Alert color="red" variant="light">{error}</Alert>}
                    <Group justify="flex-end">
                        <Button variant="default" onClick={onClose}>{t('gpu.projects.cancel')}</Button>
                        <Button onClick={save} loading={busy} disabled={!draft.changed}>{t('gpu.projects.save')}</Button>
                    </Group>
                </Stack>
            )}
        </Modal>
    );
}
