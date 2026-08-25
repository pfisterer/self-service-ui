import { useState } from 'react';
import { AlertCircle, ArrowRight, ArrowRightLeft, Check, FileText, FolderInput, LogOut, Pencil, Rocket, X } from 'lucide-react';
import { Badge, Button, Divider, Group, Modal, Paper, Stack, Table, Tabs, Text, Timeline } from '@mantine/core';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { NodeChangesDiff, NodeStatusBadge, QuotaBadges, TokenBadgeList, UserRoleBadgeList } from './component-common.jsx';
import { formatRelativeDate, isBudget, nodeTitle, ownerEmail, resourceSummaryText, statusLabel } from './util-project.jsx';

dayjs.extend(relativeTime);

// NodeInspectModal is the read-only view of a node: what it is now (Details)
// and how it got there (History). These used to be two modals over the same
// node, so looking at both meant closing one to open the other.

export const TAB_DETAILS = 'details';
export const TAB_HISTORY = 'history';

// Human-readable labels and icons for the lifecycle events the backend records.
const EVENT_META = {
    created: { label: 'Created', icon: FileText },
    approved: { label: 'Approved', icon: Check },
    rejected: { label: 'Rejected', icon: X },
    change_requested: { label: 'Change requested', icon: ArrowRight },
    change_rejected: { label: 'Change declined (kept as before)', icon: X },
    amended: { label: 'Request updated', icon: Pencil },
    updated: { label: 'Edited by a manager', icon: Pencil },
    released: { label: 'Released', icon: LogOut },
    reparented: { label: 'Moved to another budget', icon: FolderInput },
    owner_transferred: { label: 'Ownership transferred', icon: ArrowRightLeft },
    promote_requested: { label: 'Adoption queued', icon: Rocket },
};

// One label/value row of the details table.
function Row({ label, children }) {
    return (
        <Table.Tr>
            <Table.Td w={160}><Text size="xs" c="dimmed">{label}</Text></Table.Td>
            <Table.Td>{typeof children === 'string' ? <Text size="sm">{children}</Text> : children}</Table.Td>
        </Table.Tr>
    );
}

// NodeDetailsPanel is the "everything about this node" view for budgets and projects.
function NodeDetailsPanel({ node, resources }) {
    const budget = isBudget(node);

    return (
        <Stack>
            <Table withRowBorders={false} verticalSpacing="4">
                <Table.Tbody>
                    <Row label="Status"><NodeStatusBadge status={node.status} /></Row>
                    {node.reason && <Row label="Purpose">{node.reason}</Row>}
                    {!budget && ownerEmail(node) && <Row label="Owner">{ownerEmail(node)}</Row>}
                    <Row label={budget ? 'Resource cap' : 'Resources'}>
                        <QuotaBadges resources={resources} quota={node.limit} size="xs" />
                    </Row>
                    {node.termination_date && <Row label="End date">{formatRelativeDate(node.termination_date)}</Row>}
                    {node.created_by && <Row label="Created by">{node.created_by}</Row>}
                    {node.created_at && <Row label="Created">{formatRelativeDate(node.created_at)}</Row>}
                    <Row label="ID"><Text size="xs" ff="monospace">{node.id}</Text></Row>
                </Table.Tbody>
            </Table>

            {/* Full before/after diff while a change awaits approval. */}
            <NodeChangesDiff
                resources={resources}
                limitFrom={node.limit}
                limitTo={node.pending?.limit}
                dateFrom={node.termination_date}
                dateTo={node.pending?.termination_date}
                usersFrom={node.authorized_users}
                usersTo={node.pending?.authorized_users}
            />

            {budget && (
                <>
                    <Divider label="Access" labelPosition="left" />
                    <div>
                        <Text size="xs" fw={600} c="dimmed" mb="4">Managed by</Text>
                        <TokenBadgeList tokens={node.admin_scope}
                            emptyMessage="Managers of the parent budgets only" />
                    </div>
                    <div>
                        <Text size="xs" fw={600} c="dimmed" mb="4">Who can request here</Text>
                        {/* The sub-budget rule restricts exactly these people, so it
                            reads as a line about them rather than as a separate fact.
                            With nobody listed there is nothing to restrict, and stating
                            the rule anyway contradicts the line above it. */}
                        <TokenBadgeList tokens={node.eligible_requesters}
                            emptyMessage="Nobody — only its managers can put anything here" />
                        {node.eligible_requesters?.length > 0 && (
                            <Text size="xs" c="dimmed" mt="6">
                                {node.allow_sub_budget_requests === false
                                    ? 'May request projects only'
                                    : 'May request projects and sub-budgets'}
                            </Text>
                        )}
                        {/* Same as on the card: the auto-approve amount is a
                            statement about these people, not a topic of its own. */}
                        {node.auto_approve?.per_requester_limit && (
                            <Text size="xs" c="green.7" mt="4">
                                Up to {resourceSummaryText(resources, node.auto_approve.per_requester_limit)} per
                                {' '}person are approved automatically
                            </Text>
                        )}
                    </div>
                </>
            )}

            {!budget && (
                <>
                    <Divider label="Members" labelPosition="left" />
                    <UserRoleBadgeList users={node.authorized_users} />
                    {(!node.authorized_users || node.authorized_users.length === 0) && (
                        <Text size="xs" c="dimmed">Only the owner has access.</Text>
                    )}
                </>
            )}

            {(node.os_project_id || node.os_project_name) && (
                <>
                    <Divider label="OpenStack" labelPosition="left" />
                    <Group gap="xs">
                        {node.os_project_name && <Badge variant="light" color="gray" style={{ textTransform: 'none' }}>{node.os_project_name}</Badge>}
                        {node.os_project_id && <Text size="xs" ff="monospace" c="dimmed">{node.os_project_id}</Text>}
                    </Group>
                </>
            )}
        </Stack>
    );
}

// NodeHistoryPanel shows a node's lifecycle as a timeline, newest first.
function NodeHistoryPanel({ node, resources }) {
    const history = node.history || [];

    if (history.length === 0) {
        return (
            <Paper p="md" withBorder>
                <Group gap="xs">
                    <AlertCircle size="18" />
                    <Text>No history available.</Text>
                </Group>
            </Paper>
        );
    }

    return (
        <Timeline active={history.length} bulletSize="24" lineWidth="2">
            {history.slice().reverse().map((h, i) => {
                const meta = EVENT_META[h.event] ?? { label: h.event, icon: FileText };
                const Icon = meta.icon;
                return (
                    <Timeline.Item key={i} bullet={<Icon size="16" />}>
                        <Group justify="space-between" mb="xs">
                            <Text fw={600}>{meta.label}</Text>
                            <Text size="xs" c="dimmed">{formatDateTime(h.timestamp)}</Text>
                        </Group>

                        <Text size="sm">By: {h.actor}</Text>

                        {h.status_from !== undefined && h.status_to && h.status_from !== h.status_to && (
                            <Group gap="xs" mt="xs">
                                <Badge variant="outline" size="sm">{h.status_from ? statusLabel(h.status_from) : 'new'}</Badge>
                                <Text size="xs" c="dimmed">→</Text>
                                <Badge variant="outline" size="sm">{statusLabel(h.status_to)}</Badge>
                            </Group>
                        )}

                        {(h.parent_from || h.parent_to) && h.parent_from !== h.parent_to && (
                            <Text size="sm" mt="xs">Budget: {h.parent_from ?? '—'} → {h.parent_to ?? '—'}</Text>
                        )}

                        {(h.owner_from || h.owner_to) && h.owner_from !== h.owner_to && (
                            <Text size="sm" mt="xs">Owner: {h.owner_from ?? '—'} → {h.owner_to ?? '—'}</Text>
                        )}

                        <NodeChangesDiff
                            resources={resources}
                            limitFrom={h.limit_from}
                            limitTo={h.limit_to}
                            dateFrom={h.termination_date_from}
                            dateTo={h.termination_date_to}
                            label="Changes"
                        />

                        {h.limit_to && !h.limit_from && (
                            <div style={{ marginTop: 8 }}>
                                <Text size="xs" fw={600} c="dimmed" mb="xs">Granted resources:</Text>
                                <QuotaBadges resources={resources} quota={h.limit_to} size="xs" />
                            </div>
                        )}

                        {h.reason && (
                            <div style={{ marginTop: 8 }}>
                                <Text size="xs" fw={600} c="dimmed">Reason:</Text>
                                <Text size="sm">{h.reason}</Text>
                            </div>
                        )}
                    </Timeline.Item>
                );
            })}
        </Timeline>
    );
}

/**
 * NodeInspectModal shows one node in two tabs.
 *
 * initialTab decides which one opens, so the "History" trigger still lands
 * directly on the timeline instead of making the user switch tabs.
 */
export function NodeInspectModal({ opened, onClose, node, resources, initialTab = TAB_DETAILS }) {
    // Opening again — for another node, or via the other trigger — must land on
    // the requested tab, not on whatever was open the last time. The call sites
    // key this modal on (action, node), so a fresh open is a fresh mount and
    // `initialTab` is simply the initial state.
    const [tab, setTab] = useState(initialTab);

    if (!node) return null;
    const hasHistory = (node.history || []).length > 0;

    return (
        <Modal opened={opened} onClose={onClose} size="lg"
            title={`${isBudget(node) ? 'Budget' : 'Project'}: ${nodeTitle(node)}`}>
            <Stack>
                <Tabs value={tab} onChange={setTab}>
                    <Tabs.List mb="md">
                        <Tabs.Tab value={TAB_DETAILS}>Details</Tabs.Tab>
                        {/* Nothing to show yet on a node that was just created —
                            the tab says so instead of opening an empty timeline. */}
                        <Tabs.Tab value={TAB_HISTORY} disabled={!hasHistory}>History</Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value={TAB_DETAILS}>
                        <NodeDetailsPanel node={node} resources={resources} />
                    </Tabs.Panel>
                    <Tabs.Panel value={TAB_HISTORY}>
                        <NodeHistoryPanel node={node} resources={resources} />
                    </Tabs.Panel>
                </Tabs>

                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>Close</Button>
                </Group>
            </Stack>
        </Modal>
    );
}
