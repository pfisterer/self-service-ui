import { useState } from 'react';
import { AlertCircle, ArrowRight, ArrowRightLeft, CalendarMinus, Check, FileText, FolderInput, LogOut, Pencil, Rocket, X } from 'lucide-react';
import { Badge, Button, Divider, Group, Modal, Paper, Stack, Table, Tabs, Text, Timeline } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { NodeChangesDiff, NodeStatusBadge, QuotaBadges, TokenBadgeList, UserRoleBadgeList } from './component-common.jsx';
import { autoApproveFacts, formatRelativeDate, isBudget, nodeTitle, ownerEmail, statusLabel } from './util-project.jsx';
import { formatDateTime } from '../format-date.js';

dayjs.extend(relativeTime);

// NodeInspectModal is the read-only view of a node: what it is now (Details)
// and how it got there (History). These used to be two modals over the same
// node, so looking at both meant closing one to open the other.

export const TAB_DETAILS = 'details';
export const TAB_HISTORY = 'history';

// The icon for each lifecycle event the backend records. The words live in the
// translations under projects.inspect.events.<event>; an event we have no icon
// for is one we have no words for either, and both fall back below.
const EVENT_ICON = {
    created: FileText,
    approved: Check,
    rejected: X,
    change_requested: ArrowRight,
    change_rejected: X,
    amended: Pencil,
    updated: Pencil,
    released: LogOut,
    reparented: FolderInput,
    owner_transferred: ArrowRightLeft,
    promote_requested: Rocket,
    end_shortened: CalendarMinus,
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
    const { t } = useTranslation();
    const budget = isBudget(node);
    const autoApprove = autoApproveFacts(t, resources, node);

    return (
        <Stack>
            <Table withRowBorders={false} verticalSpacing="4">
                <Table.Tbody>
                    <Row label={t('projects.inspect.status')}><NodeStatusBadge status={node.status} /></Row>
                    {node.reason && <Row label={t('projects.inspect.purpose')}>{node.reason}</Row>}
                    {!budget && ownerEmail(node) && <Row label={t('projects.fact.owner')}>{ownerEmail(node)}</Row>}
                    <Row label={budget ? t('projects.inspect.resourceCap') : t('projects.fact.resources')}>
                        <QuotaBadges resources={resources} quota={node.limit} size="xs" />
                    </Row>
                    {node.termination_date && <Row label={t('projects.endDate.label')}>{formatRelativeDate(node.termination_date)}</Row>}
                    {node.created_by && <Row label={t('projects.fact.createdBy')}>{node.created_by}</Row>}
                    {node.created_at && <Row label={t('projects.inspect.created')}>{formatRelativeDate(node.created_at)}</Row>}
                    <Row label={t('projects.inspect.id')}><Text size="xs" ff="monospace">{node.id}</Text></Row>
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
                    <Divider label={t('projects.inspect.access')} labelPosition="left" />
                    <div>
                        <Text size="xs" fw={600} c="dimmed" mb="4">{t('projects.fact.managedBy')}</Text>
                        <TokenBadgeList tokens={node.admin_scope}
                            emptyMessage={t('projects.inspect.managedByEmpty')} />
                    </div>
                    <div>
                        <Text size="xs" fw={600} c="dimmed" mb="4">{t('projects.forms.whoCanRequest')}</Text>
                        {/* The sub-budget rule restricts exactly these people, so it
                            reads as a line about them rather than as a separate fact.
                            With nobody listed there is nothing to restrict, and stating
                            the rule anyway contradicts the line above it. */}
                        <TokenBadgeList tokens={node.eligible_requesters}
                            emptyMessage={t('projects.fact.canRequestEmpty')} />
                        {node.eligible_requesters?.length > 0 && (
                            <Text size="xs" c="dimmed" mt="6">
                                {node.allow_sub_budget_requests === false
                                    ? t('projects.inspect.mayRequestProjects')
                                    : t('projects.inspect.mayRequestProjectsAndBudgets')}
                            </Text>
                        )}
                    </div>
                    {autoApprove && (
                        <>
                            <div>
                                <Text size="xs" fw={600} c="dimmed" mb="4">{t('projects.fact.grantedAtOnce')}</Text>
                                <Text size="xs" c="green.7">{autoApprove.grants}</Text>
                            </div>
                            <div>
                                <Text size="xs" fw={600} c="dimmed" mb="4">{t('projects.fact.beyondThat')}</Text>
                                <Text size="xs">{autoApprove.beyond}</Text>
                            </div>
                        </>
                    )}
                </>
            )}

            {!budget && (
                <>
                    <Divider label={t('projects.fact.members')} labelPosition="left" />
                    <UserRoleBadgeList users={node.authorized_users} />
                    {(!node.authorized_users || node.authorized_users.length === 0) && (
                        <Text size="xs" c="dimmed">{t('projects.inspect.ownerOnly')}</Text>
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
    const { t } = useTranslation();
    const history = node.history || [];

    if (history.length === 0) {
        return (
            <Paper p="md" withBorder>
                <Group gap="xs">
                    <AlertCircle size="18" />
                    <Text>{t('projects.inspect.noHistory')}</Text>
                </Group>
            </Paper>
        );
    }

    return (
        <Timeline active={history.length} bulletSize="24" lineWidth="2">
            {history.slice().reverse().map((h, i) => {
                const Icon = EVENT_ICON[h.event] ?? FileText;
                // An event the backend adds before this UI knows it shows its own
                // name rather than a blank line.
                const label = EVENT_ICON[h.event] ? t(`projects.inspect.events.${h.event}`) : h.event;
                return (
                    <Timeline.Item key={i} bullet={<Icon size="16" />}>
                        <Group justify="space-between" mb="xs">
                            <Text fw={600}>{label}</Text>
                            <Text size="xs" c="dimmed">{formatDateTime(h.timestamp)}</Text>
                        </Group>

                        <Text size="sm">{t('projects.inspect.actor', { actor: h.actor })}</Text>

                        {h.status_from !== undefined && h.status_to && h.status_from !== h.status_to && (
                            <Group gap="xs" mt="xs">
                                <Badge variant="outline" size="sm">
                                    {h.status_from ? statusLabel(t, h.status_from) : t('projects.inspect.statusNew')}
                                </Badge>
                                <Text size="xs" c="dimmed">→</Text>
                                <Badge variant="outline" size="sm">{statusLabel(t, h.status_to)}</Badge>
                            </Group>
                        )}

                        {(h.parent_from || h.parent_to) && h.parent_from !== h.parent_to && (
                            <Text size="sm" mt="xs">
                                {t('projects.inspect.budgetChange', { from: h.parent_from ?? '—', to: h.parent_to ?? '—' })}
                            </Text>
                        )}

                        {(h.owner_from || h.owner_to) && h.owner_from !== h.owner_to && (
                            <Text size="sm" mt="xs">
                                {t('projects.inspect.ownerChange', { from: h.owner_from ?? '—', to: h.owner_to ?? '—' })}
                            </Text>
                        )}

                        <NodeChangesDiff
                            resources={resources}
                            limitFrom={h.limit_from}
                            limitTo={h.limit_to}
                            dateFrom={h.termination_date_from}
                            dateTo={h.termination_date_to}
                            label={t('projects.inspect.changes')}
                        />

                        {h.limit_to && !h.limit_from && (
                            <div style={{ marginTop: 8 }}>
                                <Text size="xs" fw={600} c="dimmed" mb="xs">{t('projects.inspect.grantedResources')}</Text>
                                <QuotaBadges resources={resources} quota={h.limit_to} size="xs" />
                            </div>
                        )}

                        {h.reason && (
                            <div style={{ marginTop: 8 }}>
                                <Text size="xs" fw={600} c="dimmed">{t('projects.inspect.reason')}</Text>
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
    const { t } = useTranslation();
    // Opening again — for another node, or via the other trigger — must land on
    // the requested tab, not on whatever was open the last time. The call sites
    // key this modal on (action, node), so a fresh open is a fresh mount and
    // `initialTab` is simply the initial state.
    const [tab, setTab] = useState(initialTab);

    if (!node) return null;
    const hasHistory = (node.history || []).length > 0;

    return (
        <Modal opened={opened} onClose={onClose} size="lg"
            title={t(isBudget(node) ? 'projects.inspect.titleBudget' : 'projects.inspect.titleProject',
                { name: nodeTitle(node) })}>
            <Stack>
                <Tabs value={tab} onChange={setTab}>
                    <Tabs.List mb="md">
                        <Tabs.Tab value={TAB_DETAILS}>{t('projects.actions.details')}</Tabs.Tab>
                        {/* Nothing to show yet on a node that was just created —
                            the tab says so instead of opening an empty timeline. */}
                        <Tabs.Tab value={TAB_HISTORY} disabled={!hasHistory}>{t('projects.inspect.tabHistory')}</Tabs.Tab>
                    </Tabs.List>

                    <Tabs.Panel value={TAB_DETAILS}>
                        <NodeDetailsPanel node={node} resources={resources} />
                    </Tabs.Panel>
                    <Tabs.Panel value={TAB_HISTORY}>
                        <NodeHistoryPanel node={node} resources={resources} />
                    </Tabs.Panel>
                </Tabs>

                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>{t('projects.actions.close')}</Button>
                </Group>
            </Stack>
        </Modal>
    );
}
