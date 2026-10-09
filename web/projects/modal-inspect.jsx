import { useState } from 'react';
import { AlertCircle, Archive, ArrowRight, ArrowRightLeft, CalendarMinus, Check, FileText, FolderInput, Gift, LogOut, Pencil, Rocket, Tags, Trash2, Users, X } from 'lucide-react';
import { Badge, Button, Group, Modal, Paper, Stack, Table, Text, Timeline } from '@mantine/core';
import { FormTabs } from './component-form-modal.jsx';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { NodeChangesDiff, NodeStatusBadge, QuotaBadges, TokenBadgeList, UserRoleBadgeList } from './component-common.jsx';
import { autoApproveFacts, formatRelativeDate, isBudget, nodeTitle, ownerEmail, statusLabel } from './util-project.jsx';
import { formatDateTime } from '../format-date.js';
import { UsagePanel } from './component-usage.jsx';
import { AttributesView, hasAttributes } from './component-node-attributes.jsx';
import { ExternalGroups } from './component-external-groups.jsx';

dayjs.extend(relativeTime);

// NodeInspectModal is the read-only form of the one dialog a node has: whoever
// may change a node gets its edit dialog, everyone else this, with the same
// tabs in the same order — the edit dialog's own with a summary in place of
// the fields, then History and Usage (nodeExtraTabs), which both share.

export const TAB_DETAILS = 'details';
export const TAB_HISTORY = 'history';
export const TAB_USAGE = 'usage';
export const TAB_ATTRIBUTES = 'attributes';
const TAB_RESOURCES = 'resources';
const TAB_ACCESS = 'access';
const TAB_AUTO_APPROVE = 'auto-approve';

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
    term_shortened: CalendarMinus,
    allocation_set: Gift,
    allocation_removed: Gift,
    attributes_changed: Tags,
    external_group_removed: Users,
    archived: Archive,
    deletion_requested: Trash2,
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

// The read-only tabs mirror the edit dialogs' tabs — same names, same order —
// so the one dialog reads the same whether or not the viewer may change it.

// Section is one labelled block of a read-only tab.
function Section({ label, children }) {
    return (
        <div>
            <Text size="xs" fw={600} c="dimmed" mb="4">{label}</Text>
            {children}
        </div>
    );
}

// DetailsTab: what it is for, whose it is, until when — and, while a change
// waits, what it would change.
function DetailsTab({ node, resources }) {
    const { t } = useTranslation();
    return (
        <Stack>
            <Table withRowBorders={false} verticalSpacing="4">
                <Table.Tbody>
                    <Row label={t('projects.inspect.name')}>{nodeTitle(node)}</Row>
                    {node.reason && <Row label={t('projects.inspect.purpose')}>{node.reason}</Row>}
                    {!isBudget(node) && ownerEmail(node) && <Row label={t('projects.fact.owner')}>{ownerEmail(node)}</Row>}
                    <Row label={t('projects.endDate.label')}>{node.termination_date ? formatRelativeDate(node.termination_date) : '—'}</Row>
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
        </Stack>
    );
}

function ResourcesTab({ node, resources }) {
    const { t } = useTranslation();
    return (
        <Section label={isBudget(node) ? t('projects.inspect.resourceCap') : t('projects.fact.resources')}>
            <QuotaBadges resources={resources} quota={node.limit} size="xs" />
        </Section>
    );
}

// AccessTab: on a budget who runs it and who may ask; on a project who works
// in it.
function AccessTab({ node }) {
    const { t } = useTranslation();
    if (!isBudget(node)) {
        return (
            <Stack>
                {(node.admin_scope || []).length > 0 && (
                    <Section label={t('projects.fact.admins')}><TokenBadgeList tokens={node.admin_scope} /></Section>
                )}
                <Section label={t('projects.fact.members')}>
                    <UserRoleBadgeList users={node.authorized_users} />
                    {(!node.authorized_users || node.authorized_users.length === 0) && (
                        <Text size="xs" c="dimmed">{t('projects.inspect.ownerOnly')}</Text>
                    )}
                </Section>
                <ExternalGroups node={node} />
            </Stack>
        );
    }
    return (
        <Stack>
            <Section label={t('projects.fact.managedBy')}>
                <TokenBadgeList tokens={node.admin_scope} emptyMessage={t('projects.inspect.managedByEmpty')} />
            </Section>
            <Section label={t('projects.forms.whoCanRequest')}>
                {/* The sub-budget rule restricts exactly these people, so it
                    reads as a line about them rather than as a separate fact.
                    With nobody listed there is nothing to restrict, and stating
                    the rule anyway contradicts the line above it. */}
                <TokenBadgeList tokens={node.eligible_requesters} emptyMessage={t('projects.fact.canRequestEmpty')} />
                {node.eligible_requesters?.length > 0 && (
                    <Text size="xs" c="dimmed" mt="6">
                        {node.allow_sub_budget_requests === false
                            ? t('projects.inspect.mayRequestProjects')
                            : t('projects.inspect.mayRequestProjectsAndBudgets')}
                    </Text>
                )}
            </Section>
        </Stack>
    );
}

function AutoApproveTab({ node, resources }) {
    const { t } = useTranslation();
    const autoApprove = autoApproveFacts(t, resources, node);
    if (!autoApprove) return <Text size="sm" c="dimmed">{t('projects.inspect.noAutoApprove')}</Text>;
    return (
        <Stack>
            <Section label={t('projects.fact.grantedAtOnce')}><Text size="xs" c="green.7">{autoApprove.grants}</Text></Section>
            <Section label={t('projects.fact.beyondThat')}><Text size="xs">{autoApprove.beyond}</Text></Section>
        </Stack>
    );
}

// NodeFacts is what the edit dialogs do not show as fields: status, who
// created it and when, its ID and the OpenStack project. It heads their
// History tab.
function NodeFacts({ node }) {
    const { t } = useTranslation();
    return (
        <Table withRowBorders={false} verticalSpacing="4">
            <Table.Tbody>
                <Row label={t('projects.inspect.status')}><NodeStatusBadge status={node.status} /></Row>
                {node.created_by && <Row label={t('projects.fact.createdBy')}>{node.created_by}</Row>}
                {node.created_at && <Row label={t('projects.inspect.created')}>{formatRelativeDate(node.created_at)}</Row>}
                <Row label={t('projects.inspect.id')}><Text size="xs" ff="monospace">{node.id}</Text></Row>
                {(node.os_project_id || node.os_project_name) && (
                    <Row label="OpenStack">
                        <Text size="xs" ff="monospace">{[node.os_project_name, node.os_project_id].filter(Boolean).join(' · ')}</Text>
                    </Row>
                )}
            </Table.Tbody>
        </Table>
    );
}

// showsUsage: a budget's consumption is its managers' business; a budget
// someone may only request from does not show it. A project shows it to
// everyone who sees the project — once it exists in OpenStack.
const showsUsage = (node) => (isBudget(node) ? !node.request_only : !!node.os_project_id);

// nodeExtraTabs are the read-only tabs the edit dialogs add after their own,
// in FormTabs' shape. The usage panel fetches, so it renders only while its
// tab is the active one.
export function nodeExtraTabs(t, node, resources, activeTab) {
    if (!node) return [];
    return [
        {
            value: TAB_HISTORY, label: t('projects.inspect.tabHistory'),
            content: <Stack><NodeFacts node={node} /><NodeHistoryPanel node={node} resources={resources} /></Stack>,
        },
        ...(showsUsage(node) ? [{
            value: TAB_USAGE, label: t('projects.consumption.tab'),
            content: activeTab === TAB_USAGE ? <UsagePanel node={node} /> : null,
        }] : []),
    ];
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

// initialTab decides which tab opens.
export function NodeInspectModal({ opened, onClose, node, resources, initialTab = TAB_DETAILS }) {
    const { t } = useTranslation();
    // Opening again — for another node, or via the other trigger — must land on
    // the requested tab, not on whatever was open the last time. The call sites
    // key this modal on (action, node), so a fresh open is a fresh mount and
    // `initialTab` is simply the initial state.
    const [tab, setTab] = useState(initialTab);

    if (!node) return null;
    const budget = isBudget(node);
    const tabs = [
        { value: TAB_DETAILS, label: t('projects.actions.details'), content: <DetailsTab node={node} resources={resources} /> },
        { value: TAB_RESOURCES, label: t('projects.fact.resources'), content: <ResourcesTab node={node} resources={resources} /> },
        {
            value: TAB_ACCESS, label: budget ? t('projects.budgetForm.tabAccess') : t('projects.fact.members'),
            content: <AccessTab node={node} />,
        },
        ...(budget ? [{ value: TAB_AUTO_APPROVE, label: t('projects.budgetForm.tabAutoApprove'), content: <AutoApproveTab node={node} resources={resources} /> }] : []),
        // Sent only to those who look after the node; read-only here.
        ...(hasAttributes(node) ? [{ value: TAB_ATTRIBUTES, label: t('projects.attributes.tab'), content: <AttributesView node={node} /> }] : []),
        ...nodeExtraTabs(t, node, resources, tab),
    ];

    return (
        <Modal opened={opened} onClose={onClose} size="xl"
            title={t(budget ? 'projects.inspect.titleBudget' : 'projects.inspect.titleProject', { name: nodeTitle(node) })}>
            <Stack>
                {/* The same tab strip as the edit dialogs, so the two forms of
                    the one dialog cannot drift apart. */}
                <FormTabs value={tab} onChange={setTab} tabs={tabs} />

                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>{t('projects.actions.close')}</Button>
                </Group>
            </Stack>
        </Modal>
    );
}
