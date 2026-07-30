import { Eye, FolderInput, FolderOpen, History, Pencil, Plus, Trash2, Zap } from 'lucide-react';
import { Badge, Button, Card, Divider, Group, Stack, Text, Tooltip } from '@mantine/core';
import { NodeStatusBadge, NodeUsageBars, TokenBadgeList } from './component-common.jsx';
import { resourceSummaryText } from './util-project.jsx';

// BudgetCard renders one budget (inner tree node): who manages it, who may
// request under it, and how full it is. Like ProjectCard it is presentational —
// actions are reported to the owning view via onAction(actionId, node).
//
// Props:
//   onOpen          when set, an "Open" button drills into the budget's children
//   manageable      the viewer manages this budget → edit/delegate/delete actions
export function BudgetCard({ node, resources, onOpen, onAction, manageable = false }) {
    const act = (action) => onAction?.(action, node);

    const isApproved = node.status === 'approved';
    const hasHistory = (node.history || []).length > 0;
    const autoApprove = node.auto_approve?.per_requester_limit;

    return (
        <Card withBorder shadow="sm" radius="md" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

            {/* ── Header: name + status ──────────────────────────────────── */}
            <Group justify="space-between" mb="xs" wrap="nowrap">
                <Text fw={700} size="md" truncate>{node.name || node.id}</Text>
                <Group gap="xs" wrap="nowrap">
                    {!isApproved && <NodeStatusBadge status={node.status} />}
                    {autoApprove && (
                        <Tooltip label={`Requests up to ${resourceSummaryText(resources, autoApprove) || 'the configured amount'} per person are approved automatically.`}>
                            <Badge size="sm" variant="light" color="teal" leftSection={<Zap size="11" />} style={{ cursor: 'default' }}>
                                Self-service
                            </Badge>
                        </Tooltip>
                    )}
                </Group>
            </Group>

            {node.reason && <Text size="xs" c="dimmed" mb="xs">{node.reason}</Text>}

            {/* ── Usage ──────────────────────────────────────────────────── */}
            <Stack gap="xs" mb="md" style={{ flex: 1 }}>
                <Text size="xs" fw={600} c="dimmed" tt="uppercase">Resource usage</Text>
                <NodeUsageBars resources={resources} node={node} />

                <Divider my="xs" />

                <Text size="xs" fw={600} c="dimmed" tt="uppercase">Managed by</Text>
                <TokenBadgeList tokens={node.admin_scope} color="violet"
                    emptyMessage="Managers of the parent budgets only" />

                <Text size="xs" fw={600} c="dimmed" tt="uppercase">Who can request here</Text>
                <TokenBadgeList tokens={node.eligible_requesters}
                    emptyMessage="Nobody — requests are not enabled on this budget" />

                {node.termination_date && (
                    <Text size="xs" c="dimmed">
                        Valid until {new Date(node.termination_date).toLocaleDateString()}
                    </Text>
                )}
            </Stack>

            {/* ── Actions ────────────────────────────────────────────────── */}
            <Card.Section withBorder inheritPadding py="xs" mt="auto">
                <Group grow>
                    {onOpen && (
                        <Button variant="filled" size="xs" onClick={() => onOpen(node)}>
                            <FolderOpen size="13" style={{ marginRight: 4 }} />Open
                        </Button>
                    )}
                    <Button variant="light" size="xs" onClick={() => act('details')}>
                        <Eye size="13" style={{ marginRight: 4 }} />Details
                    </Button>
                    <Button variant="light" size="xs" disabled={!hasHistory} onClick={() => act('history')}>
                        <History size="13" style={{ marginRight: 4 }} />History
                    </Button>
                    {manageable && isApproved && (
                        <>
                            <Button variant="light" size="xs" onClick={() => act('sub-budget')}>
                                <Plus size="13" style={{ marginRight: 4 }} />Sub-budget
                            </Button>
                            <Button variant="light" size="xs" onClick={() => act('edit')}>
                                <Pencil size="13" style={{ marginRight: 4 }} />Edit
                            </Button>
                            <Button variant="light" size="xs" onClick={() => act('move')}>
                                <FolderInput size="13" style={{ marginRight: 4 }} />Move
                            </Button>
                            <Button color="red" variant="light" size="xs" onClick={() => act('delete')}>
                                <Trash2 size="13" style={{ marginRight: 4 }} />Delete
                            </Button>
                        </>
                    )}
                </Group>
            </Card.Section>
        </Card>
    );
}
