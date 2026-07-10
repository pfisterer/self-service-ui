import { useEffect, useState } from 'react';
import { useProjectConfig } from './projects.jsx';
import { Settings } from 'lucide-react';
import { Button, Chip, Group, Loader, SimpleGrid, Stack, Text } from '@mantine/core';
import { Delayed } from '/helper/delayed.jsx';
import { useClient } from '../providers/client.jsx';
import { useAuth } from '/providers/auth.jsx';
import { useErrorModal } from '/providers/error-modal.jsx';
import { ProjectCard } from './project-card.jsx';
import { EligibilityModal } from './eligibility-modal.jsx';
import { getAuthUserEmail, normalizeArrayResponse, statusLabel, useAsyncRefresh } from './util-project.jsx';

export function ManageRequestsView() {
    const { client, sdk } = useClient('projects');
    const { user } = useAuth();
    const { showError } = useErrorModal();
    const userEmail = getAuthUserEmail(user);
    const [requests, setRequests] = useState([]);
    const [delegations, setDelegations] = useState([]);
    const [visibleStatuses, setVisibleStatuses] = useState([]);
    const [eligibilityOpen, setEligibilityOpen] = useState(false);
    const projectConfig = useProjectConfig();

    const { loaded, refresh } = useAsyncRefresh(async () => {
        const [reqsRes, delegRes] = await Promise.all([
            sdk.listProjectsToManage({ client }),
            sdk.listDelegationsToMe({ client }),
        ]);
        if (reqsRes?.error) throw new Error(reqsRes.error?.error ?? reqsRes.error?.message ?? String(reqsRes.error));
        if (delegRes?.error) throw new Error(delegRes.error?.error ?? delegRes.error?.message ?? String(delegRes.error));
        const sorted = normalizeArrayResponse(reqsRes).sort((a, b) => {
            const timeA = new Date(a?.history?.[0]?.timestamp || 0).getTime();
            const timeB = new Date(b?.history?.[0]?.timestamp || 0).getTime();
            return timeB - timeA;
        });
        setRequests(sorted);
        setDelegations(normalizeArrayResponse(delegRes));
        // Select all present statuses by default so chip counts always match displayed cards.
        setVisibleStatuses([...new Set(sorted.map(r => r.status))]);
    }, showError);

    useEffect(() => { refresh(); }, [userEmail, client, sdk]);

    const sdkError = (res) => res?.error?.error ?? res?.error?.message ?? (res?.error ? String(res.error) : null);

    const handleApprove = async (reqId, funderId) => {
        const res = await sdk.approveProject({
            client, path: { id: reqId },
            body: { delegation_id: funderId },
            headers: { 'Content-Type': 'application/json' }
        });
        const err = sdkError(res);
        if (err) { showError(err); return; }
        refresh();
    };

    const handleApproveWithEdit = async (reqId, funderId, modifiedQuota) => {
        const res = await sdk.approveProject({
            client, path: { id: reqId },
            body: { delegation_id: funderId, modified_quota: modifiedQuota },
            headers: { 'Content-Type': 'application/json' }
        });
        const err = sdkError(res);
        if (err) { showError(err); return; }
        refresh();
    };

    const handleReject = async (reqId, reason) => {
        const res = await sdk.rejectProject({
            client, path: { id: reqId },
            body: reason ? { reason } : {},
            headers: { 'Content-Type': 'application/json' }
        });
        const err = sdkError(res);
        if (err) { showError(err); return; }
        refresh();
    };

    const handlePromote = async (reqId, body) => {
        const res = await sdk.markProjectForPromotion({
            client, path: { id: reqId },
            body,
            headers: { 'Content-Type': 'application/json' }
        });
        const err = sdkError(res);
        if (err) throw new Error(err);
        refresh();
    };

    // Loader only on the INITIAL load; refreshes keep the current content on screen.
    if (!projectConfig || !loaded) return <Delayed><Loader /></Delayed>;

    const visible = requests.filter(r => visibleStatuses.includes(r.status));
    const presentStatuses = [...new Set(requests.map(r => r.status))];

    return (
        <Stack>

            <Group justify="flex-end">
                <Button
                    size="xs"
                    variant="default"
                    leftSection={<Settings size="14"/>}
                    onClick={() => setEligibilityOpen(true)}
                >
                    Eligibility Rules
                </Button>
            </Group>

            {presentStatuses.length > 0 && (
                <Chip.Group multiple value={visibleStatuses} onChange={setVisibleStatuses}>
                    <Stack gap="xs">
                        <Text size="xs" c="dimmed" fw={600} tt="uppercase">Show statuses</Text>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {presentStatuses.map(status => (
                                <Chip key={status} value={status} size="xs">
                                    {statusLabel(status)}
                                    {` (${requests.filter(r => r.status === status).length})`}
                                </Chip>
                            ))}
                        </div>
                    </Stack>
                </Chip.Group>
            )}

            {visible.length === 0 ? (
                <Text c="dimmed" ta="center" py="xl">
                    {requests.length === 0 ? 'There is nothing to do.' : 'No requests match the selected filters.'}
                </Text>
            ) : (
                <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }}>
                    {visible.map(req => (
                        <ProjectCard
                            key={req.id}
                            req={req}
                            config={projectConfig}
                            potentialFunders={delegations}
                            onApprove={handleApprove}
                            onApproveWithEdit={handleApproveWithEdit}
                            onReject={handleReject}
                            onPromote={handlePromote}
                        />
                    ))}
                </SimpleGrid>
            )}

            <EligibilityModal
                opened={eligibilityOpen}
                onClose={() => { setEligibilityOpen(false); refresh(); }}
            />

        </Stack>
    );
}
