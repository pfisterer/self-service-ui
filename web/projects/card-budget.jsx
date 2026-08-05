import { Check, Eye, FolderInput, FolderOpen, History, Pencil, Plus, Trash2, X, Zap } from 'lucide-react';
import { Badge, Button, Card, Divider, Group, Stack, Text } from '@mantine/core';
import { FactRow, NodeChangesDiff, NodeStatusBadge, NodeUsageBars, PersonBadge, TokenBadgeList } from './component-common.jsx';
import { COLOR, expiryTone, expiryValue, resourceSummaryText } from './util-project.jsx';

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
    // A budget can wait for a decision just like a project does: someone asked
    // for a sub-budget, or proposed a change to an existing one.
    const isPending = node.status === 'pending';
    const isChangePending = node.status === 'change_pending';
    const hasHistory = (node.history || []).length > 0;
    const autoApprove = node.auto_approve?.per_requester_limit;
    const hasRequesters = (node.eligible_requesters || []).length > 0;

    return (
        <Card withBorder shadow="sm" radius="md" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

            {/* ── Header: name + status ──────────────────────────────────── */}
            <Group justify="space-between" mb="xs" wrap="nowrap">
                <Text fw={700} size="md" truncate>{node.name || node.id}</Text>
                <Group gap="xs" wrap="nowrap">
                    {!isApproved && <NodeStatusBadge status={node.status} />}
                    {/* Scan marker only — the amount is spelled out below. */}
                    {autoApprove && (
                        <Badge size="sm" variant="light" color={COLOR.positive} leftSection={<Zap size="11" />} style={{ cursor: 'default' }}>
                            Auto-approve
                        </Badge>
                    )}
                </Group>
            </Group>

            {node.reason && <Text size="xs" c="dimmed" mb="xs">{node.reason}</Text>}

            {/* ── Usage ──────────────────────────────────────────────────── */}
            <Stack gap="xs" mb="md" style={{ flex: 1 }}>
                <Text size="xs" fw={600} c="dimmed" tt="uppercase">Resource usage</Text>
                <NodeUsageBars resources={resources} node={node} />

                <Divider my="xs" />

                {/* Three questions, in the order somebody new to this asks them:
                    who runs this pot, who may take from it, and what happens to
                    a request. Each answer carries the sentence that says what it
                    means — a name alone tells a first-time reader nothing. */}
                <Stack gap="6">
                    {/* A budget has no owner — responsibility is the admin scope
                        below, which may well be a group. This is the person to
                        talk to: while it is a request the one asking, afterwards
                        the one who set it up. */}
                    {node.created_by && (
                        <FactRow label={isPending || isChangePending ? 'Requested by' : 'Created by'}>
                            <PersonBadge email={node.created_by} size="xs" />
                        </FactRow>
                    )}

                    <FactRow label="Managed by" hint="They approve requests and can pass parts of this budget on.">
                        <TokenBadgeList size="xs" tokens={node.admin_scope}
                            emptyMessage="Whoever manages the budget above" />
                    </FactRow>

                    <FactRow label="Can request"
                        hint={hasRequesters
                            ? `They may ask for ${node.allow_sub_budget_requests === false ? 'projects' : 'projects and sub-budgets'} out of this budget.`
                            : undefined}>
                        <TokenBadgeList size="xs" tokens={node.eligible_requesters}
                            emptyMessage="Nobody — only its managers can put anything here" />
                    </FactRow>

                    {autoApprove && (
                        <FactRow label="Auto-approve"
                            hint="Requests up to this size are granted without asking; anything bigger needs a manager's decision.">
                            <Text size="xs">
                                <Zap size="11" style={{ verticalAlign: '-1px', marginRight: 4, color: 'var(--mantine-color-green-7)' }} />
                                Up to {resourceSummaryText(resources, autoApprove) || 'the configured amount'} per person
                            </Text>
                        </FactRow>
                    )}

                    {node.termination_date && (
                        <FactRow label="Valid until">
                            <Text size="xs" c={expiryTone(node.termination_date) === 'gray'
                                ? undefined
                                : `${expiryTone(node.termination_date)}.7`}>
                                {expiryValue(node.termination_date)}
                            </Text>
                        </FactRow>
                    )}
                </Stack>

                {/* What the proposed change would do — the decision below is
                    otherwise made blind. */}
                <NodeChangesDiff
                    resources={resources}
                    limitFrom={node.limit}
                    limitTo={node.pending?.limit}
                    dateFrom={node.termination_date}
                    dateTo={node.pending?.termination_date}
                />
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
                    {manageable && (isPending || isChangePending) && (
                        <>
                            <Button color={COLOR.positive} variant="light" size="xs" onClick={() => act('approve')}>
                                <Check size="13" style={{ marginRight: 4 }} />Approve
                            </Button>
                            <Button color={COLOR.negative} variant="light" size="xs" onClick={() => act('reject')}>
                                <X size="13" style={{ marginRight: 4 }} />Reject
                            </Button>
                        </>
                    )}
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
                            <Button color={COLOR.negative} variant="light" size="xs" onClick={() => act('delete')}>
                                <Trash2 size="13" style={{ marginRight: 4 }} />Delete
                            </Button>
                        </>
                    )}
                </Group>
            </Card.Section>
        </Card>
    );
}
