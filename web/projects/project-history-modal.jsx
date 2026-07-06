import { AlertCircle, ArrowRight, Check, FileText, LogOut, X } from 'lucide-react';
import { Badge, Group, Modal, Paper, Text, Timeline } from '@mantine/core';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { ProjectChangesDiff, ProjectDisplay } from './component-common.jsx';

dayjs.extend(relativeTime);

export function RequestHistoryModal({ opened, onClose, request, config }) {
    const getEventLabel = (event) => {
        const labels = {
            created: 'Request Created',
            change_requested: 'Change Requested',
            approved: 'Approved',
            rejected: 'Rejected',
            change_rejected: 'Change Rejected',
            released: 'Released',
        };
        return labels[event] || event;
    };

    const getEventIcon = (event) => {
        switch (event) {
            case 'created': return FileText;
            case 'approved': return Check;
            case 'rejected':
            case 'change_rejected':
                return X;
            case 'released': return LogOut;
            case 'change_requested': return ArrowRight;
            default: return FileText;
        }
    };

    return (
        <Modal opened={opened} onClose={onClose} title={`History: ${request.reason}`} size="lg">
            {!request.history || request.history.length === 0 ? (
                <Paper p="md" withBorder>
                    <Group gap="xs">
                        <AlertCircle size="18" />
                        <Text>No history available for this request.</Text>
                    </Group>
                </Paper>
            ) : (
                <Timeline active={request.history.length} bulletSize="24" lineWidth="2">
                    {request.history.slice().reverse().map((h, i) => {
        const IconComponent = getEventIcon(h.event);
        return (
                            <Timeline.Item key={i} bullet={<IconComponent size="16" />}>
                                <Group justify="space-between" mb="xs">
                                    <Text fw={600}>{getEventLabel(h.event)}</Text>
                                    <Text size="xs" c="dimmed">{new Date(h.timestamp).toLocaleString()}</Text>
                                </Group>

                                <Text size="sm">Actor: {h.actor}</Text>
                                {h.group && <Text size="sm">Group: {h.group}</Text>}

                                {h.status_from !== undefined && h.status_to && (
                                    <div style={{ marginTop: '8px' }}>
                                        <Text size="xs" fw={600} mb="xs">Status:</Text>
                                        <Group gap="xs">
                                            <Badge variant="outline" size="sm">{h.status_from || 'new'}</Badge>
                                            <Text size="xs" c="dimmed">-></Text>
                                            <Badge variant="outline" size="sm">{h.status_to}</Badge>
                                        </Group>
                                    </div>
                                )}

                                <ProjectChangesDiff
                                    config={config}
                                    quotaFrom={h.quota_from}
                                    quotaTo={h.quota_to}
                                    dateFrom={h.termination_date_from}
                                    dateTo={h.termination_date_to}
                                    usersFrom={h.authorized_users_from}
                                    usersTo={h.authorized_users_to}
                                    label="Changes"
                                />

                                {h.quota_to && !h.quota_from && (
                                    <ProjectDisplay projectConfig={config} quota={h.quota_to} label="Initial Quota" />
                                )}

                                {h.termination_date && !h.termination_date_from && (
                                    <div style={{ marginTop: '8px' }}>
                                        <Text size="xs" fw={600} c="dimmed">Termination Date:</Text>
                                        <Text size="sm">{new Date(h.termination_date).toLocaleDateString()} ({dayjs(h.termination_date).fromNow()})</Text>
                                    </div>
                                )}

                                {h.reason && (
                                    <div style={{ marginTop: '8px' }}>
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
