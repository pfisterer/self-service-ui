import { Check, Eye, FolderInput, FolderOpen, Pencil, Plus, Trash2, X, Zap } from 'lucide-react';
import { Badge, Button, Card, Divider, Group, Stack, Text } from '@mantine/core';
import { FactRow, NodeChangesDiff, NodeStatusBadge, NodeUsageBars, PersonBadge, TokenBadgeList } from './component-common.jsx';
import { useTranslation } from 'react-i18next';
import { autoApproveFacts, COLOR, expiryTone, expiryValue, hasAutoApprove } from './util-project.jsx';

// BudgetCard renders one budget (inner tree node): who manages it, who may
// request under it, and how full it is. Like ProjectCard it is presentational —
// actions are reported to the owning view via onAction(actionId, node).
//
// Props:
//   onOpen          when set, an "Open" button drills into the budget's children
//   manageable      the viewer manages this budget → edit/delegate/delete actions
export function BudgetCard({ node, resources, onOpen, onAction, manageable = false }) {
    const { t } = useTranslation();
    const act = (action) => onAction?.(action, node);

    const isApproved = node.status === 'approved';
    // A budget can wait for a decision just like a project does: someone asked
    // for a sub-budget, or proposed a change to an existing one.
    const isPending = node.status === 'pending';
    const isChangePending = node.status === 'change_pending';
    const autoApprove = hasAutoApprove(node);
    const autoApproveInfo = autoApproveFacts(t, resources, node);
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
                            {t('projects.budgetCard.autoApproveBadge')}
                        </Badge>
                    )}
                </Group>
            </Group>

            {node.reason && <Text size="xs" c="dimmed" mb="xs">{node.reason}</Text>}

            {/* ── Usage ──────────────────────────────────────────────────── */}
            <Stack gap="xs" mb="md" style={{ flex: 1 }}>
                <Text size="xs" fw={600} c="dimmed" tt="uppercase">{t('projects.budgetCard.resourceUsage')}</Text>
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
                        <FactRow label={isPending || isChangePending ? t('projects.fact.requestedBy') : t('projects.fact.createdBy')}>
                            <PersonBadge email={node.created_by} size="xs" />
                        </FactRow>
                    )}

                    <FactRow label={t('projects.fact.managedBy')} hint={t('projects.budgetCard.managedByHint')}>
                        <TokenBadgeList size="xs" tokens={node.admin_scope}
                            emptyMessage={t('projects.fact.managedByEmpty')} />
                    </FactRow>

                    <FactRow label={t('projects.fact.canRequest')}>
                        <TokenBadgeList size="xs" tokens={node.eligible_requesters}
                            emptyMessage={t('projects.fact.canRequestEmpty')} />
                    </FactRow>

                    {hasRequesters && (
                        <FactRow label={t('projects.fact.mayAskFor')}>
                            {node.allow_sub_budget_requests === false
                                ? t('projects.fact.mayAskProjects')
                                : t('projects.fact.mayAskProjectsAndBudgets')}
                        </FactRow>
                    )}

                    {autoApproveInfo && (
                        <>
                            <FactRow label={t('projects.fact.grantedAtOnce')}>
                                <Text size="xs">
                                    <Zap size="11" style={{ verticalAlign: '-1px', marginRight: 4, color: 'var(--mantine-color-green-7)' }} />
                                    {autoApproveInfo.grants}
                                </Text>
                            </FactRow>
                            <FactRow label={t('projects.fact.beyondThat')}>{autoApproveInfo.beyond}</FactRow>
                        </>
                    )}

                    {node.termination_date && (
                        <FactRow label={t('projects.fact.validUntil')}>
                            <Text size="xs" c={expiryTone(node.termination_date) === 'gray'
                                ? undefined
                                : `${expiryTone(node.termination_date)}.7`}>
                                {expiryValue(t, node.termination_date)}
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
                            <FolderOpen size="13" style={{ marginRight: 4 }} />{t('projects.actions.open')}
                        </Button>
                    )}
                    <Button variant="light" size="xs" onClick={() => act('details')}>
                        <Eye size="13" style={{ marginRight: 4 }} />{t('projects.actions.details')}
                    </Button>
                    {/* On a budget shown read-only, requesting is the one thing
                        the viewer CAN do here — offered only when the budget
                        takes sub-budget requests at all. */}
                    {!manageable && isApproved && node.allow_sub_budget_requests !== false && (
                        <Button variant="light" size="xs" onClick={() => act('request-here')}>
                            <Plus size="13" style={{ marginRight: 4 }} />{t('projects.actions.requestBudget')}
                        </Button>
                    )}
                    {manageable && (isPending || isChangePending) && (
                        <>
                            <Button color={COLOR.positive} variant="light" size="xs" onClick={() => act('approve')}>
                                <Check size="13" style={{ marginRight: 4 }} />{t('projects.actions.approve')}
                            </Button>
                            <Button color={COLOR.negative} variant="light" size="xs" onClick={() => act('reject')}>
                                <X size="13" style={{ marginRight: 4 }} />{t('projects.actions.reject')}
                            </Button>
                        </>
                    )}
                    {manageable && isApproved && (
                        <>
                            <Button variant="light" size="xs" onClick={() => act('sub-budget')}>
                                <Plus size="13" style={{ marginRight: 4 }} />{t('projects.actions.subBudget')}
                            </Button>
                            <Button variant="light" size="xs" onClick={() => act('edit')}>
                                <Pencil size="13" style={{ marginRight: 4 }} />{t('projects.actions.edit')}
                            </Button>
                            <Button variant="light" size="xs" onClick={() => act('move')}>
                                <FolderInput size="13" style={{ marginRight: 4 }} />{t('projects.actions.move')}
                            </Button>
                            <Button color={COLOR.negative} variant="light" size="xs" onClick={() => act('delete')}>
                                <Trash2 size="13" style={{ marginRight: 4 }} />{t('projects.actions.delete')}
                            </Button>
                        </>
                    )}
                </Group>
            </Card.Section>
        </Card>
    );
}
