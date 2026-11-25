import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Group, Select, Stack, Text } from '@mantine/core';
import { Clock, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { formatError } from '/helper/api-error.js';
import { formatDate } from '../format-date.js';
import { FormModal } from './component-form-modal.jsx';
import { QuotaInputs } from './component-quota-inputs.jsx';
import { NodeChangesDiff, TerminationDatePicker, formatTerm } from './component-common.jsx';
import { BudgetSelect } from './component-budget-select.jsx';
import { ReasonField, reasonError } from './component-reason-field.jsx';
import { useNodeMutation } from './use-node-mutation.jsx';
import { ExpiredNote, endLabel, useEndAllocation, allocationNode } from './component-allocations.jsx';
import { budgetPathText } from './component-budget-path.jsx';
import {
    COLOR, allocationActions, availabilityElsewhere, changeOutcome, endDate, endDay, fundedBy, holdsProject, isAvailability,
    latestProjectEnd, liveAllocations, managesAllocation, managesChainOf, mostSpecificFirst, nodeTitle, requestOutcome, resourceLabel,
    resourceSummaryText, roomIn, visibleResources,
} from './util-project.jsx';

const ADD = 'add';
const DEFAULT_TERM_DAYS = 90;

// AllocationModal changes what one budget pays for a project, or adds another budget to it (allocation_leaves, 25.11.2026). The person picks the allocation first — the one clicked is preselected — and then:
//   - an allocation: its new amounts and end (POST request-change on the allocation): giving back and ending sooner apply at once, so does whatever the budget's auto-approve covers or its managers set; the rest waits as a change for the budget's managers. "Give back" / "Withdraw" ends it after a confirmation.
//   - "more from another budget": a new allocation of the project under a budget (POST /v1/nodes, kind allocation): the project's holders ask a budget they may request from, a budget's managers grant from their own, with a reason (the former extra allocation from above).
// Only what the viewer may do is offered (allocationActions): the holders manage every allocation, a budget's managers only those paid from their budgets.
//
// initial: the allocation id to open on, or 'add'. myBudgets: the budgets the viewer manages (my-budgets), eligibleBudgets: those they may request from; isRoot: a root admin, who manages every budget. myProjects: the viewer's own projects, for what an auto-approve still grants them.
export function AllocationModal({ opened, onClose, onDone, project, resources, initial = null, myBudgets = [], eligibleBudgets = [], myProjects = [], isRoot = false, userEmail = '' }) {
    const { t } = useTranslation();
    const api = useNodesApi();
    const endAllocation = useEndAllocation();
    const holder = holdsProject(project, userEmail);
    const managedIds = useMemo(() => new Set((myBudgets || []).map(b => b.id)), [myBudgets]);

    // The allocations the viewer may change or end, and the budgets they may add one from.
    const allocations = liveAllocations(project).filter(a => {
        const can = allocationActions(a, { holder, manager: managesAllocation(a, managedIds, isRoot) });
        return can.change || can.end;
    });
    const addFrom = {
        managed: (myBudgets || []).filter(b => b.status === 'approved' || !b.status),
        requestable: holder ? mostSpecificFirst(eligibleBudgets || []).filter(b => !managedIds.has(b.id)) : [],
    };
    const canAdd = !!project && (project.status === 'pending' || project.status === 'approved')
        && [...addFrom.managed, ...addFrom.requestable].some(b => !fundedBy(project, b.id));

    const first = allocations.find(a => a.id === initial)?.id ?? (initial === ADD && canAdd ? ADD : allocations[0]?.id ?? (canAdd ? ADD : null));
    const [selection, setSelection] = useState(first);
    const allocation = selection === ADD ? null : allocations.find(a => a.id === selection) ?? null;
    const adding = selection === ADD;

    // Per selection what was entered; picking another one starts from what that one holds.
    const [defaultEnd] = useState(() => new Date(Date.now() + DEFAULT_TERM_DAYS * 24 * 60 * 60 * 1000));
    const draftFor = (sel) => {
        const a = allocations.find(x => x.id === sel);
        if (a) {
            return {
                budgetId: a.budget_id,
                quota: { ...(a.pending?.limit || a.limit || {}) },
                end: endDate(a.pending?.termination_date || a.termination_date),
                reason: '',
            };
        }
        return { budgetId: null, quota: {}, end: project?.termination_date ? endDate(project.termination_date) : defaultEnd, reason: '' };
    };
    const [draft, setDraft] = useState(() => draftFor(first));
    const [checked, setChecked] = useState(false);
    const set = (patch) => setDraft(d => ({ ...d, ...patch }));
    const select = (sel) => { setSelection(sel); setDraft(draftFor(sel)); setChecked(false); };

    // The budget the allocation is (or would be) paid from: from the lists in hand, else loaded — a manager above it may read it, a holder of a project may not always.
    const known = [...(myBudgets || []), ...(eligibleBudgets || [])].find(b => b.id === draft.budgetId) ?? null;
    const budgetQuery = useQuery({
        queryKey: projectKeys.node(draft.budgetId),
        queryFn: () => api.getNode(draft.budgetId),
        enabled: !!api && opened && !!draft.budgetId && !known,
        retry: false,
    });
    const budget = known ?? (budgetQuery.data?.kind === 'budget' ? budgetQuery.data : null);
    const manager = adding
        ? !!draft.budgetId && managesChainOf(budget ?? { id: draft.budgetId }, managedIds, isRoot)
        : managesAllocation(allocation, managedIds, isRoot);

    // What may be asked for from that budget: what it holds, without an availability another allocation of the project gives already (it comes from one place).
    const offered = (budget ? visibleResources(resources, budget) : resources || [])
        .filter(r => !isAvailability(r) || !availabilityElsewhere(project, r.id, allocation?.id ?? null));
    // What is free for it: the budget's room plus what this allocation holds already.
    const held = allocation && (allocation.status === 'approved' || allocation.status === 'change_pending') ? (allocation.limit || {}) : {};
    const room = budget ? roomIn(budget, offered) : null;
    const headroom = room ? Object.fromEntries(Object.entries(room).map(([id, free]) => [id, free + (held[id] ?? 0)])) : null;
    const latest = latestProjectEnd(budget);

    const asked = Object.fromEntries(Object.entries(draft.quota).filter(([, v]) => (v ?? 0) !== 0));
    const quantityErrors = Object.fromEntries(offered
        .filter(r => !isAvailability(r) && ((draft.quota[r.id] ?? 0) < 0 || (typeof r.max === 'number' && r.max > 0 && (draft.quota[r.id] ?? 0) > r.max)))
        .map(r => [r.id, t('projects.quotaInputs.range', { min: 0, max: r.max })]));
    const reasonNeeded = adding && manager;
    const problems = {
        budget: adding && !draft.budgetId ? t('projects.allocation.budgetRequired') : null,
        quota: adding && Object.keys(asked).length === 0 ? t('projects.allocation.nothingAsked') : null,
        reason: reasonNeeded ? reasonError(draft.reason, t('projects.allocation.reasonRequired')) : null,
        end: draft.end && latest && draft.end > latest.date
            ? (latest.term ? t('projects.projectForm.endDateAfterTerm', { date: formatDate(latest.date), duration: formatTerm(t, latest.term) }) : t('projects.projectForm.endDateAfterBudget', { date: formatDate(latest.date) }))
            : null,
    };
    const valid = !Object.values(problems).some(Boolean) && Object.keys(quantityErrors).length === 0;

    // What the button will do — the API's decision, made early.
    const outcome = !budget ? null : adding
        ? requestOutcome({ budget, manages: manager, quota: draft.quota, resources: offered, myProjects })
        : changeOutcome({ node: allocation, budget, quota: draft.quota, terminationDate: draft.end, resources: offered, myProjects, manages: manager });

    const save = useNodeMutation({
        onDone,
        onClose,
        mutationFn: () => {
            const termination = endDay(draft.end);
            if (adding) {
                return api.addAllocation({
                    projectId: project.id, budgetId: draft.budgetId, limit: asked, reason: draft.reason.trim(), terminationDate: termination,
                });
            }
            return api.requestChange(allocation.id, {
                limit: draft.quota,
                ...(termination ? { termination_date: termination } : {}),
                ...(draft.reason.trim() ? { reason: draft.reason.trim() } : {}),
            });
        },
    });

    if (!project) return null;

    const allocationLabel = (a) => `${budgetPathText(a.budget_path, a.budget_name || a.budget_id)} · ${resourceSummaryText(t, resources, a.limit) || '—'}`;
    const options = [
        ...allocations.map(a => ({ value: a.id, label: allocationLabel(a) })),
        ...(canAdd ? [{ value: ADD, label: holder ? t('projects.allocation.addOther') : t('projects.allocation.addMine') }] : []),
    ];
    const addBudgets = (list) => list.filter(b => !fundedBy(project, b.id));

    const submit = (e) => {
        e?.preventDefault?.();
        setChecked(true);
        if (valid) save.mutate();
    };
    const end = async () => {
        if (await endAllocation(allocationNode(allocation, project), { holder, resources })) {
            onDone?.();
            onClose?.();
        }
    };

    return (
        <FormModal
            opened={opened}
            onClose={onClose}
            size="lg"
            title={t('projects.allocation.dialogTitle', { name: nodeTitle(project) })}
            onSubmit={submit}
            submitting={save.isPending}
            submitDisabled={!selection || outcome === 'blocked'}
            submitError={save.error && formatError(save.error)}
            submitLabel={adding
                ? (manager ? t('projects.allocation.grant') : t('projects.allocation.ask'))
                : (outcome === 'approval' ? t('projects.projectForm.submitChangeRequest') : t('projects.forms.saveChanges'))}
            secondary={allocation && allocationActions(allocation, { holder, manager }).end ? {
                label: endLabel(t, allocation, holder),
                color: COLOR.negative,
                onClick: end,
                disabled: save.isPending,
            } : null}
            note={<AllocationOutcome outcome={outcome} adding={adding} />}
        >
            <Text size="sm" c="dimmed">{t('projects.allocation.dialogHint')}</Text>
            {options.length === 0 ? (
                <Alert color={COLOR.info} variant="light" p="xs">{t('projects.allocation.nothingToDo')}</Alert>
            ) : (
                <Select
                    label={t('projects.allocation.which')}
                    data={options}
                    value={selection}
                    onChange={(v) => v && select(v)}
                    allowDeselect={false}
                />
            )}

            {allocation && <ExpiredNote allocation={allocation} size="sm" />}

            {adding && (
                <BudgetSelect
                    label={t('projects.allocation.from')}
                    description={holder ? t('projects.allocation.fromHintHolder') : t('projects.allocation.fromHintManager')}
                    placeholder={t('projects.projectForm.budgetPlaceholder')}
                    groups={[
                        { label: t('projects.projectForm.budgetsManaged'), budgets: addBudgets(addFrom.managed) },
                        { label: t('projects.projectForm.budgetsRequestable'), budgets: addBudgets(addFrom.requestable) },
                    ]}
                    markInstant
                    value={draft.budgetId}
                    onChange={(id) => set({ budgetId: id })}
                    error={checked ? problems.budget : null}
                />
            )}

            {selection && (
                <>
                    <QuotaInputs
                        extra
                        providerDefaults
                        resources={offered}
                        value={draft.quota}
                        headroom={headroom}
                        errors={quantityErrors}
                        onChange={(id, v) => set({ quota: { ...draft.quota, [id]: v } })}
                    />
                    {checked && problems.quota && <Text size="xs" c={COLOR.negative}>{problems.quota}</Text>}
                    <TerminationDatePicker
                        label={t('projects.allocation.end')}
                        value={draft.end}
                        maxDate={latest?.date ?? null}
                        maxHint={latest?.term ? t('projects.endDate.atMostTerm', { date: formatDate(latest.date), duration: formatTerm(t, latest.term) }) : undefined}
                        optional={!latest && !(allocation?.termination_date)}
                        optionalHint={t('projects.endDate.setEndDateHintProject')}
                        error={checked ? problems.end : null}
                        onChange={(d) => set({ end: d })}
                    />
                    <ReasonField
                        label={t('projects.allocation.reason')}
                        description={reasonNeeded ? t('projects.allocation.reasonHintGrant') : t('projects.allocation.reasonHint')}
                        required={reasonNeeded}
                        value={draft.reason}
                        error={checked ? problems.reason : null}
                        onChange={(e) => set({ reason: e.currentTarget.value })}
                    />
                    {allocation && (
                        <NodeChangesDiff
                            resources={offered}
                            limitFrom={allocation.limit}
                            limitTo={draft.quota}
                            dateFrom={allocation.termination_date}
                            dateTo={draft.end}
                            label={t('projects.changes.proposed')}
                            separated
                        />
                    )}
                    {!budget && budgetQuery.isError && (
                        <Text size="xs" c="dimmed">{t('projects.allocation.budgetUnknown')}</Text>
                    )}
                    {outcome === 'refused' && (
                        <Text size="xs" c={COLOR.negative}>
                            {t('projects.allocation.refused', {
                                list: offered.filter(r => !isAvailability(r) && (draft.quota[r.id] ?? 0) > (headroom?.[r.id] ?? Infinity))
                                    .map(r => resourceLabel(t, r)).join(', ') || '—',
                            })}
                        </Text>
                    )}
                </>
            )}
        </FormModal>
    );
}

// AllocationOutcome says beside the button what it will do: at once, or a request for the budget's managers, or nothing at all because the budget refuses what its auto-approve does not cover.
function AllocationOutcome({ outcome, adding }) {
    const { t } = useTranslation();
    if (!outcome) return null;
    if (outcome === 'blocked') return <Text size="sm" c={COLOR.negative}>{t('projects.projectForm.outcomeBlocked')}</Text>;
    if (outcome === 'approval') {
        return (
            <Group gap={6} wrap="nowrap">
                <Clock size="14" color="var(--mantine-color-orange-7)" style={{ flexShrink: 0 }} />
                <Text size="sm" c="orange.8">{t(adding ? 'projects.allocation.outcomeWaiting' : 'projects.allocation.outcomeWaitingChange')}</Text>
            </Group>
        );
    }
    if (outcome === 'refused') return null;
    return (
        <Group gap={6} wrap="nowrap">
            <Zap size="14" color="var(--mantine-color-green-7)" style={{ flexShrink: 0 }} />
            <Text size="sm" c="green.8">{t(adding ? 'projects.allocation.outcomeInstant' : 'projects.allocation.outcomeInstantChange')}</Text>
        </Group>
    );
}
