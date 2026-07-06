import { useEffect, useMemo, useState } from 'react';
import { useProjectConfig } from './projects.jsx';
import { Plus } from 'lucide-react';
import { Button, Checkbox, Group, Loader, SimpleGrid, Stack, Text } from '@mantine/core';
import { useClient } from '../providers/client.jsx';
import { useAuth } from '/providers/auth.jsx';
import { useErrorModal } from '/providers/error-modal.jsx';
import { ProjectCard } from './project-card.jsx';
import { ProjectDelegationsTable } from './component-common.jsx';
import { RequestModal } from './project-modal.jsx';
import { getAuthUserEmail, normalizeArrayResponse, useAsyncRefresh } from './util-project.jsx';

export function MyProjectsView() {
    const { client, sdk } = useClient('projects');
    const { user } = useAuth();
    const { showError } = useErrorModal();
    const userEmail = getAuthUserEmail(user);
    const [requests, setRequests] = useState([]);
    const [eligibleDelegations, setEligibleDelegations] = useState([]);
    const [showNewModal, setShowNewModal] = useState(false);
    const [editingRequest, setEditingRequest] = useState(null);
    const [showAllocations, setShowAllocations] = useState(true);
    const projectConfig = useProjectConfig();

    const { loading, refresh } = useAsyncRefresh(async () => {
        const [reqRes, eligibleRes] = await Promise.all([
            sdk.listMyProjects({ client }),
            sdk.listDelegationsEligibleForMe({ client }),
        ]);
        setRequests(normalizeArrayResponse(reqRes));
        setEligibleDelegations(normalizeArrayResponse(eligibleRes));
    }, showError);

    useEffect(() => { refresh(); }, [userEmail, client, sdk]);

    const handleRelease = async (reqId) => {
        await sdk.releaseProject({ client, path: { id: reqId } });
        refresh();
    };

    const handleCreate = async (formData) => {
        await sdk.createProject({
            client, body: {
                quota: formData.quota,
                reason: formData.reason,
                termination_date: formData.termination_date,
                authorized_users: formData.authorized_users,
                funding_delegation_id: formData.funding_delegation_id,
            },
            headers: { 'Content-Type': 'application/json' }
        });
        setShowNewModal(false);
        refresh();
    };

    const handleUpdate = async (formData) => {
        if (!editingRequest?.id) return;
        await sdk.updateProject({
            client, path: { id: editingRequest.id }, body: {
                quota: formData.quota,
                reason: formData.reason,
                termination_date: formData.termination_date,
                authorized_users: formData.authorized_users
            },
            headers: { 'Content-Type': 'application/json' }
        });
        setEditingRequest(null);
        refresh();
    };

    const myRequests = requests;

    // Group active requests by funder and status: { [funderId]: { [status]: ResourceQuota } }
    // NOTE: this hook must run unconditionally (before any early return) to keep
    // the hook order stable across renders — see the Rules of Hooks.
    const projectsByFunderId = useMemo(() => {
        const active = myRequests.filter(r => r.status === 'approved' || r.status === 'change_pending');
        const byFunder = {};
        active.forEach(req => {
            const funderId = req.funded_by;
            if (!funderId) return;
            if (!byFunder[funderId]) byFunder[funderId] = {};
            const prev = byFunder[funderId][req.status] ?? {};
            const merged = { ...prev };
            Object.keys(req.quota).forEach(k => {
                merged[k] = (merged[k] || 0) + req.quota[k];
            });
            byFunder[funderId][req.status] = merged;
        });
        return byFunder;
    }, [requests]);

    if (!projectConfig || loading) return (<Loader />);

    return (
        <Stack>
            <Group justify="space-between" align="center" mb="md">
                <Text fw={600}></Text>
                <Group gap="sm" align="center">
                    <Checkbox
                        size="xs"
                        label="Show allocations and funders"
                        checked={showAllocations}
                        onChange={e => setShowAllocations(e.currentTarget.checked)}
                    />
                    <Button size="xs" leftSection={<Plus size="16"/>} onClick={() => setShowNewModal(true)}>
                        Create Project
                    </Button>
                </Group>
            </Group>

            {showAllocations && (
                <ProjectDelegationsTable projectConfig={projectConfig} projectsByFunderId={projectsByFunderId} delegations={eligibleDelegations} />
            )}

            {myRequests.length === 0 ? (
                <Text c="dimmed" ta="center" py="xl">No project requests yet.</Text>
            ) : (
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                    {myRequests.map(req => (
                        <ProjectCard key={req.id} req={req} config={projectConfig} onRelease={handleRelease} onEdit={(r) => setEditingRequest(r)} />
                    ))}
                </SimpleGrid>
            )}

            <RequestModal
                config={projectConfig}
                eligibleDelegations={eligibleDelegations}
                opened={showNewModal}
                onClose={() => setShowNewModal(false)}
                onSubmit={handleCreate}
            />

            <RequestModal
                config={projectConfig}
                initialData={editingRequest}
                opened={!!editingRequest}
                onClose={() => setEditingRequest(null)}
                onSubmit={handleUpdate}
            />
        </Stack>
    );
}
