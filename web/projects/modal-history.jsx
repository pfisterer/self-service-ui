import { AlertCircle, ArrowRight, ArrowRightLeft, Check, FileText, FolderInput, LogOut, Pencil, Rocket, X } from 'lucide-react';
import { Badge, Group, Modal, Paper, Text, Timeline } from '@mantine/core';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { NodeChangesDiff, QuotaBadges } from './component-common.jsx';
import { nodeTitle, statusLabel } from './util-project.jsx';

dayjs.extend(relativeTime);

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

// NodeHistoryModal shows a node's lifecycle as a timeline, newest first.
export function NodeHistoryModal({ opened, onClose, node, resources }) {
    if (!node) return null;
    const history = node.history || [];

    return (
        <Modal opened={opened} onClose={onClose} title={`History: ${nodeTitle(node)}`} size="lg">
            {history.length === 0 ? (
                <Paper p="md" withBorder>
                    <Group gap="xs">
                        <AlertCircle size="18" />
                        <Text>No history available.</Text>
                    </Group>
                </Paper>
            ) : (
                <Timeline active={history.length} bulletSize="24" lineWidth="2">
                    {history.slice().reverse().map((h, i) => {
                        const meta = EVENT_META[h.event] ?? { label: h.event, icon: FileText };
                        const Icon = meta.icon;
                        return (
                            <Timeline.Item key={i} bullet={<Icon size="16" />}>
                                <Group justify="space-between" mb="xs">
                                    <Text fw={600}>{meta.label}</Text>
                                    <Text size="xs" c="dimmed">{new Date(h.timestamp).toLocaleString()}</Text>
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
            )}
        </Modal>
    );
}
