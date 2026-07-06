import { useState } from 'react';
import { Shield } from 'lucide-react';
import { Badge, Button, Card, Divider, Group, Stack, Text } from '@mantine/core';
import { GroupList, ProjectBar } from './component-common.jsx';
import { DelegationBreakdownModal } from './delegation-breakdown-modal.jsx';
import { useProjectConfig } from './projects.jsx';
import { formatDate, formatRelativeDate } from './util-project.jsx';

export function DelegationCard({ delegation, onEdit, onDelete, knownDelegations }) {
    const projectConfig = useProjectConfig();
    const [showBreakdown, setShowBreakdown] = useState(false);
    if (!projectConfig) return null;

    const createdDate = formatDate(delegation.created_at);
    const expiresText = delegation.end_date
        ? ` Expires ${formatRelativeDate(delegation.end_date)}.`
        : 'No expiration.';
    const isAllowance = delegation.delegation_strategy === 'allowance';
    const strategyLabel = isAllowance ? 'Allowance (Auto)' : 'Shared Pool';
    const hasUsage = Object.keys(delegation?.quota?.usage_by_status ?? {}).length > 0;

    const delegationText = delegation.can_delegate
        ? (<Badge color="dark" variant="outline" leftSection={<Shield size="12" />}>Delegation allowed</Badge>)
        : (<Badge color="gray" variant="outline">No further delegation</Badge>);

    const usageByStatus = delegation?.quota?.usage_by_status;

    return (
        <>
        <Card withBorder shadow="sm" radius="md">

            {/* ---------------------------------------- */}
            {/* Delegation Name, Strategy, and Description */}
            {/* ---------------------------------------- */}
            <Group justify="space-between" mb="md">
                <Text fw={700} size="lg">{delegation.name}</Text>
                <Group gap="xs">
                    <Badge color="gray" variant="outline">Delegation Strategy: {strategyLabel}</Badge>
                    {delegationText}
                </Group>
            </Group>

            {/* ---------------------------------------- */}
            {/* Admin Scope */}
            {/* ---------------------------------------- */}
            <Stack gap="sm" mb="md">
                <Text size="xs" fw={600} c="dimmed" tt="uppercase">Admin Scope</Text>
                <GroupList items={delegation.admin_scope} color="violet" emptyMessage="No admins configured"/>
            </Stack>

            <Divider mb="md" />

            <Stack gap="sm" mb="md">

            {/* ---------------------------------------- */}
            {/* Resource Usage or Per-User Limits */}
            {/* ---------------------------------------- */}
                <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                    {isAllowance ? 'Per-User Limits' : 'Resource Usage'}
                </Text>

                {(projectConfig?.projects || []).map(r => (
                    <ProjectBar key={r.id} resource={r}
                        limit={delegation?.quota?.limit?.[r.id] ?? 0}
                        approved={usageByStatus?.approved?.quota?.[r.id] ?? 0}
                        changePending={usageByStatus?.change_pending?.quota?.[r.id] ?? 0}
                    />
                ))}

                <Divider mb="md" />

            {/* ---------------------------------------- */}
            {/* Creation Info and Action Buttons */}
            {/* ---------------------------------------- */}

                <Text size="xs" c="dimmed" mb={onEdit ? 'md' : '0'}>
                    Created by {delegation.created_by} on {createdDate}.{expiresText}
                </Text>

                <Group grow>
                    <Button size="sm" variant="light" color="blue"
                        disabled={!hasUsage}
                        onClick={() => setShowBreakdown(true)}
                    >
                        View Breakdown
                    </Button>

                    {onEdit && <Button size="sm" variant="light" onClick={onEdit}>Edit</Button>}
                    {onDelete && <Button size="sm" variant="light" color="red" onClick={onDelete}>Delete</Button>}
                </Group>
            </Stack>

        </Card>

        <DelegationBreakdownModal
            delegation={delegation}
            opened={showBreakdown}
            onClose={() => setShowBreakdown(false)}
            knownDelegations={knownDelegations}
        />
        </>
    );
}
