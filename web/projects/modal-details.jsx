import { Badge, Button, Divider, Group, Modal, Stack, Table, Text } from '@mantine/core';
import { NodeChangesDiff, NodeStatusBadge, QuotaBadges, TokenBadgeList, UserRoleBadgeList } from './component-common.jsx';
import { formatRelativeDate, isBudget, nodeTitle, ownerEmail, resourceSummaryText } from './util-project.jsx';

// One label/value row of the details table.
function Row({ label, children }) {
    return (
        <Table.Tr>
            <Table.Td w={160}><Text size="xs" c="dimmed">{label}</Text></Table.Td>
            <Table.Td>{typeof children === 'string' ? <Text size="sm">{children}</Text> : children}</Table.Td>
        </Table.Tr>
    );
}

// NodeDetailsModal is the read-only "everything about this node" view for both
// budgets and projects.
export function NodeDetailsModal({ opened, onClose, node, resources }) {
    if (!node) return null;
    const budget = isBudget(node);

    return (
        <Modal opened={opened} onClose={onClose} size="lg"
            title={`${budget ? 'Budget' : 'Project'}: ${nodeTitle(node)}`}>
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
                            <TokenBadgeList tokens={node.admin_scope} color="violet"
                                emptyMessage="Managers of the parent budgets only" />
                        </div>
                        <div>
                            <Text size="xs" fw={600} c="dimmed" mb="4">Who can request here</Text>
                            <TokenBadgeList tokens={node.eligible_requesters}
                                emptyMessage="Nobody — requests are not enabled" />
                        </div>
                        {node.auto_approve?.per_requester_limit && (
                            <div>
                                <Text size="xs" fw={600} c="dimmed" mb="4">Self-service limit (per person)</Text>
                                <Text size="sm">{resourceSummaryText(resources, node.auto_approve.per_requester_limit)}</Text>
                            </div>
                        )}
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

                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>Close</Button>
                </Group>
            </Stack>
        </Modal>
    );
}
