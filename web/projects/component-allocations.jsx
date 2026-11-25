import { ActionIcon, Anchor, Badge, Box, Group, Stack, Text, Tooltip } from '@mantine/core';
import { CalendarX, Clock, LogOut, Pencil, Plus, Scale } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useConfirm } from '/providers/confirm.jsx';
import { useErrorModal } from '/providers/error-modal.jsx';
import { formatError } from '/helper/api-error.js';
import { useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { budgetPathText } from './component-budget-path.jsx';
import { formatDate } from '../format-date.js';
import { COLOR, LIVE_ALLOCATION_STATUSES, allocationActions, liveAllocations, managesAllocation, resourceSummaryText, statusLabel } from './util-project.jsx';

// The allocations of a project (allocation_leaves, 25.11.2026): which budget pays for what, until when, and in which state. A project is made of one or more of them; each is a leaf under the one budget that pays it and follows that budget's rules. The project card, the project dialog and a budget's table all show them the same way.

// allocationNode turns one entry of project.allocations into the node shape the decision dialog and the end confirmation read: an allocation under its budget, carrying the project's name and owner for the request's "who and what for".
export function allocationNode(allocation, project) {
    return {
        kind: 'allocation',
        id: allocation.id,
        parent_id: allocation.budget_id,
        parent_name: allocation.budget_name,
        parent_path: allocation.budget_path,
        budget_id: allocation.budget_id,
        budget_name: allocation.budget_name,
        budget_path: allocation.budget_path,
        project_id: project?.id,
        name: project?.name,
        owner: project?.owner,
        status: allocation.status,
        limit: allocation.limit,
        pending: allocation.pending,
        termination_date: allocation.termination_date,
        reason: allocation.reason || project?.reason,
        revision: allocation.revision,
        ends_alone: allocation.ends_alone,
        attributes: allocation.attributes,
        project,
    };
}

// AllocationStatusBadge marks an allocation that is not simply paying: one asked for, a change waiting, one ended or refused. A paying one needs no mark — the list is about what pays.
export function AllocationStatusBadge({ status, size = 'xs' }) {
    const { t } = useTranslation();
    if (status === 'approved') return null;
    const waiting = status === 'pending' || status === 'change_pending';
    return (
        <Badge size={size} variant="light" color={waiting ? COLOR.attention : COLOR.identity} tt="none"
            leftSection={waiting ? <Clock size="10" /> : null} style={{ flexShrink: 0 }}>
            {waiting ? t(`projects.allocation.status.${status}`) : statusLabel(t, status)}
        </Badge>
    );
}

// EndsAloneNote says that the project was extended without an allocation: it ends at its own date and the project goes on with the others.
export function EndsAloneNote({ allocation, size = 'xs' }) {
    const { t } = useTranslation();
    if (!allocation?.ends_alone || !allocation.termination_date) return null;
    return (
        <Group gap={4} wrap="nowrap" align="flex-start">
            <CalendarX size="12" color="var(--mantine-color-dimmed)" style={{ flexShrink: 0, marginTop: 2 }} />
            <Text size={size} c="dimmed">{t('projects.allocation.endsAlone', { date: formatDate(allocation.termination_date) })}</Text>
        </Group>
    );
}

// AllocationList lists a project's allocations: the budget (its path on hover), what it pays, until when, its state, a waiting change and one the project goes on without. With onAction, every row offers what the viewer may do with it (allocationActions):
//   onAction('allocations', project, allocationId)    change it (the allocation dialog)
//   onAction('allocation-end', allocationNode)         give it back / withdraw it
//   onAction('allocation-end-alone', allocationNode)   extend the project without it: it runs out at its own end (its end is earlier than the others', its budget did not agree to the project's new end)
//   onAction('decide', allocationNode)                 approve or reject it
// and below them a way to more: from another budget (the project's holders) or from the viewer's own (a budget's managers), onAction('allocations', project, 'add').
//
// decide: whether the place offers deciding (a dialog without the decision dialog leaves it out).
// holder: the viewer answers for the project (holdsProject). managedIds/isRoot: the budgets the viewer manages, for managesAllocation. focusId: the allocation the view is about (a budget's row, a decision), drawn highlighted. all: also the allocations that no longer count (ended, rejected), dimmed — the project's history of who paid.
export function AllocationList({ project, resources, holder = false, managedIds = null, isRoot = false, focusId = null, onAction, all = false, decide = true }) {
    const { t } = useTranslation();
    const shown = all ? (project?.allocations || []) : liveAllocations(project);
    if (!project || shown.length === 0) return null;
    const managesAny = isRoot || (managedIds instanceof Set ? managedIds.size > 0 : (managedIds || []).length > 0);
    // Only a project that is asked for or running gets another allocation (the API refuses the others).
    const canAdd = !!onAction && (project.status === 'pending' || project.status === 'approved') && (holder || managesAny);

    return (
        <Stack gap={6}>
            {shown.map(a => {
                const manager = managesAllocation(a, managedIds, isRoot);
                const can = onAction ? { ...allocationActions(a, { holder, manager, project }), ...(decide ? {} : { decide: false }) } : {};
                const node = allocationNode(a, project);
                const live = LIVE_ALLOCATION_STATUSES.includes(a.status);
                return (
                    <Box key={a.id} pl={focusId === a.id ? 6 : 0}
                        style={focusId === a.id ? { borderLeft: `3px solid var(--mantine-color-${COLOR.attention}-5)` } : undefined}
                        data-testid={`allocation-${a.id}`}>
                        <Group gap={6} wrap="nowrap" justify="space-between" align="flex-start">
                            <Box style={{ minWidth: 0 }}>
                                <Group gap={6} wrap="wrap" rowGap={2}>
                                    <Tooltip label={budgetPathText(a.budget_path, a.budget_name || a.budget_id)} openDelay={300} withinPortal>
                                        <Text size="xs" fw={600} c={live ? undefined : 'dimmed'}>{a.budget_name || a.budget_id}</Text>
                                    </Tooltip>
                                    <Text size="xs" c={live ? undefined : 'dimmed'}>{resourceSummaryText(t, resources, a.limit) || '—'}</Text>
                                    {a.termination_date && (
                                        <Text size="xs" c="dimmed">{t('projects.allocation.until', { date: formatDate(a.termination_date) })}</Text>
                                    )}
                                    <AllocationStatusBadge status={a.status} />
                                </Group>
                                {/* A change waiting for the budget's managers: what it would hold, and until when. */}
                                {a.pending && (a.pending.limit || a.pending.termination_date) && (
                                    <Text size="xs" c={`${COLOR.attention}.8`}>
                                        {t('projects.allocation.changeWaiting', {
                                            what: [
                                                a.pending.limit ? resourceSummaryText(t, resources, a.pending.limit) || '—' : null,
                                                a.pending.termination_date ? t('projects.allocation.until', { date: formatDate(a.pending.termination_date) }) : null,
                                            ].filter(Boolean).join(' · '),
                                        })}
                                    </Text>
                                )}
                                <EndsAloneNote allocation={a} />
                                {/* Its budget has not agreed to run as long as the others: the project's end waits for it, unless the project goes on without it. */}
                                {can.endAlone && (
                                    <Tooltip label={t('projects.allocation.endAloneHint', { date: formatDate(a.termination_date) })} multiline w={300} withinPortal>
                                        <Anchor component="button" type="button" size="xs" c={COLOR.attention}
                                            onClick={(e) => { e.stopPropagation(); onAction('allocation-end-alone', node); }}
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                            <CalendarX size="12" />{t('projects.allocation.endAlone')}
                                        </Anchor>
                                    </Tooltip>
                                )}
                            </Box>
                            {(can.change || can.end || can.decide) && (
                                <Group gap={2} wrap="nowrap" style={{ flexShrink: 0 }}>
                                    {can.decide && (
                                        <AllocationAction label={t('projects.actions.decide')} color={COLOR.attention} onClick={() => onAction('decide', node)}>
                                            <Scale size="13" />
                                        </AllocationAction>
                                    )}
                                    {can.change && (
                                        <AllocationAction label={t('projects.allocation.change')} onClick={() => onAction('allocations', project, a.id)}>
                                            <Pencil size="13" />
                                        </AllocationAction>
                                    )}
                                    {can.end && (
                                        <AllocationAction label={endLabel(t, a, holder)} color={COLOR.negative} onClick={() => onAction('allocation-end', node)}>
                                            <LogOut size="13" />
                                        </AllocationAction>
                                    )}
                                </Group>
                            )}
                        </Group>
                    </Box>
                );
            })}
            {canAdd && (
                <Anchor component="button" type="button" size="xs" onClick={() => onAction('allocations', project, 'add')}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}>
                    <Plus size="12" />{holder ? t('projects.allocation.addOther') : t('projects.allocation.addMine')}
                </Anchor>
            )}
        </Stack>
    );
}

function AllocationAction({ label, color = 'gray', onClick, children }) {
    return (
        <Tooltip label={label} withinPortal>
            <ActionIcon variant="subtle" color={color} size="sm" aria-label={label} onClick={(e) => { e.stopPropagation(); onClick(); }}>
                {children}
            </ActionIcon>
        </Tooltip>
    );
}

// endLabel is what ending an allocation means for the viewer: taking back a request still waiting, giving one back (the project's holders), or withdrawing it (its budget's managers).
export function endLabel(t, allocation, holder) {
    if (allocation?.status === 'pending') return t('projects.allocation.withdrawRequest');
    return holder ? t('projects.allocation.giveBack') : t('projects.allocation.withdraw');
}

// useEndAllocation ends an allocation after a confirmation: given back by the project's holders, withdrawn by its budget's managers, a waiting request taken back. Resolves to true once it ended. The project goes on with its other allocations; ending its last one is releasing the project, which has its own dialog.
// With atEnd it does not end now: the project goes on without it after its own end (release with at_end), the other allocations carry the project's end from then on.
export function useEndAllocation() {
    const { t } = useTranslation();
    const api = useNodesApi();
    const confirm = useConfirm();
    const queryClient = useQueryClient();
    const { showError } = useErrorModal();
    return async (allocation, { holder = false, resources = [], atEnd = false } = {}) => {
        const name = allocation.budget_name || allocation.parent_name || allocation.budget_id || allocation.parent_id;
        const waiting = allocation.status === 'pending';
        const key = atEnd ? 'endAlone' : waiting ? 'withdrawRequest' : holder ? 'giveBack' : 'withdraw';
        const summary = resourceSummaryText(t, resources, allocation.limit) || '—';
        const ok = await confirm({
            title: t(`projects.allocation.${key}Title`, { name }),
            message: t(`projects.allocation.${key}Text`, {
                summary, project: allocation.name || allocation.project?.name || '',
                date: allocation.termination_date ? formatDate(allocation.termination_date) : '—',
            }),
            severity: atEnd || waiting ? 'warning' : 'danger',
            confirmLabel: atEnd ? t('projects.allocation.endAlone') : endLabel(t, allocation, holder),
        });
        if (!ok) return false;
        try {
            await (atEnd ? api.endAllocationAtEnd(allocation.id) : api.endAllocation(allocation.id));
            await queryClient.invalidateQueries({ queryKey: projectKeys.tree() });
            return true;
        } catch (e) {
            showError(formatError(e));
            return false;
        }
    };
}
