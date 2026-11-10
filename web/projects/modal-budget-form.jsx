import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { Alert, Box, Checkbox, Fieldset, Indicator, Stack, Switch, Tabs, Text, TextInput } from '@mantine/core';
import { Trans, useTranslation } from 'react-i18next';
import { useNodesApi } from './api-nodes.jsx';
import { useForm } from '@mantine/form';
import { MaxTermInput, TerminationDatePicker } from './component-common.jsx';
import { formatDate } from '../format-date.js';
import { DIALOG_SIZE, FormModal, FormTabs, tabHasError as tabFlag, tabWithError } from './component-form-modal.jsx';
import { defaultQuota, QuotaInputs, validateQuota } from './component-quota-inputs.jsx';
import { TokenListEditor } from './component-token-list-editor.jsx';
import { formatError } from '/helper/api-error.js';
import { COLOR, catalogKinds, freeAmount, isAvailability, isPoolAutoApprove, kindOfResource, PROJECT_KINDS, UNLIMITED_QUOTA, visibleResources, endDate, endDay } from './util-project.jsx';
import { BudgetSelect, withCurrentParent } from './component-budget-select.jsx';
import { ReasonField, reasonError } from './component-reason-field.jsx';
import { useNodeMutation } from './use-node-mutation.jsx';
import { AttributesEditor, useAttributesTab } from './component-node-attributes.jsx';
import { nodeExtraTabs } from './modal-inspect.jsx';
import { ReleaseMaxInputs } from './component-release-max.jsx';
import { effectiveRelease, isEmptyRelease, normalizeRelease, releaseErrors, sameRelease } from './util-release-max.js';
import { WorkspaceScratchInput } from './component-workspace-scratch.jsx';
import { effectiveScratch, normalizeScratch, scratchErrors } from './util-workspace-scratch.js';
import { BatchPriorityInput } from './component-batch-priority.jsx';
import { batchPriorityErrors, effectiveBatchPriority, normalizeBatchPriority } from './util-batch-priority.js';
import { availableBatchJobs, BatchJobsInput } from './component-batch-jobs.jsx';
import { batchJobsErrors, effectiveBatchJobs, normalizeBatchJobs, sameBatchJobs } from './util-batch-jobs.js';
import { useGpuApi } from '/gpu/api-gpu.jsx';
import { gpuKeys } from '/gpu/query-keys.js';
import { llmEnabled } from '/features.js';

// Same three-step split as the project dialog: what it is → how much → who.
const TAB_DETAILS = 'details';
const TAB_RESOURCES = 'resources';
const TAB_ACCESS = 'access';
const TAB_AUTO_APPROVE = 'auto-approve';
const TAB_ATTRIBUTES = 'attributes';

// BudgetFormModal covers the three ways a budget comes to life or changes:
//
//   mode 'create'   a manager delegates: a sub-budget under `parent` is created
//                   active immediately. Putting someone else into "Managed by"
//                   IS the act of delegating resources to them.
//   mode 'request'  an eligible user asks for a budget of their own under one
//                   of `eligibleBudgets`; a manager must approve it.
//   mode 'edit'     a manager adjusts an existing budget (`node`) directly.
//                   Only fields that actually changed are sent, because
//                   raising the budget's own cap needs a parent-chain manager
//                   while policy fields only need a manager of the budget.
//
// moveTargets: in edit mode, the budgets it may be moved under — a field of the
// Details tab that acts at once when saved, like in a project's dialog.
export function BudgetFormModal({ opened, onClose, onDone, resources, mode, parent = null, node = null, eligibleBudgets = [], currentUserEmail = '', moveTargets = [] }) {
    const { t } = useTranslation();
    const api = useNodesApi();
    const isEdit = mode === 'edit';
    const [newParent, setNewParent] = useState(node?.parent_id ?? null);
    // The root has no parent to change.
    const canMove = isEdit && !!node?.parent_id;
    const parentChanged = canMove && newParent && newParent !== node.parent_id;
    const isRequest = mode === 'request';

    // A budget can only hold what the budget above it holds, so the parent is
    // what decides which resources this form may offer at all. When requesting,
    // that is the budget picked under "Request from" — the dialog opened from
    // the page header has no parent in hand, and falling back to the whole
    // catalogue offered availabilities the chosen budget does not carry.
    //
    // Editing without a parent in hand falls back to the node's own scope. That
    // is narrower than the truth — it shows what the budget HAS rather than what
    // it could be given — but the alternative is offering the whole catalogue
    // and letting the server refuse, which teaches the user nothing.
    const scopeFor = (parentId) => isRequest
        ? (eligibleBudgets.find(b => b.id === parentId) || null)
        : (parent || node);

    // The budget this one draws from, when it is in hand: its end is the latest
    // this one may run. Editing opened without the parent leaves the check to
    // the server.
    const boundFor = (parentId) => isRequest
        ? (eligibleBudgets.find(b => b.id === parentId) || null)
        : parent;
    const endOf = (parentId) => {
        const end = boundFor(parentId)?.termination_date;
        return endDate(end);
    };
    // Its maximum project term likewise: this one may only be shorter.
    const termOf = (parentId) => boundFor(parentId)?.max_project_term_days ?? null;
    // The release maximums the budgets above allow: the server sends them with the node being edited; for a new one they are what applies at the budget it draws from. A budget may only tighten them.
    const releaseAbove = (parentId) => isEdit ? (node?.inherited_release_max ?? null) : effectiveRelease(boundFor(parentId));
    // The same for the local storage per workspace: what the budgets above allow, which this one may only lower.
    const scratchAbove = (parentId) => isEdit ? normalizeScratch(node?.inherited_workspace_scratch_gb) : effectiveScratch(boundFor(parentId));
    // And for the batch jobs: what the budgets above decide, which this one may only tighten.
    const batchAbove = (parentId) => isEdit ? normalizeBatchPriority(node?.inherited_batch_priority) : effectiveBatchPriority(boundFor(parentId));
    // Batch jobs are there or not, like a resource: what the budget above has of them is the most this one may have; the root has nothing above.
    const jobsAbove = (parentId) => isEdit ? normalizeBatchJobs(node?.inherited_batch_jobs) : effectiveBatchJobs(boundFor(parentId));
    const isRoot = isEdit && !!node && !node.parent_id;
    // Which resources tab holds the release maximums: the workspaces one, or the only one when the catalogue does not split by kind; undefined where the budget offers nothing of the workspaces (then they would decide nothing).
    const releaseTabKind = (parentId) => {
        const scoped = visibleResources(resources, scopeFor(parentId));
        if (!scoped.some(r => kindOfResource(r) === 'workspaces')) return undefined;
        if (catalogKinds(resources).length < 2) return null;
        return PROJECT_KINDS.filter(k => scoped.some(r => kindOfResource(r) === k)).length > 1 ? 'workspaces' : null;
    };

    const [activeTab, setActiveTab] = useState(TAB_DETAILS);
    // Only when editing: a budget being created or requested has none yet.
    const attrs = useAttributesTab(node);

    // Initialised here rather than by an effect writing a dozen setStates on
    // open: the dialog is remounted per (mode, node, parent) — see the `key` at
    // the call sites — so "initial" is exactly "for what is being edited now".
    const form = useForm({
        initialValues: (isEdit && node)
            ? {
                parentId: null,
                name: node.name || '',
                reason: node.reason || '',
                quota: { ...node.limit },
                adminScope: node.admin_scope || [],
                eligibleRequesters: node.eligible_requesters || [],
                allowSubBudgetRequests: node.allow_sub_budget_requests !== false,
                allowRequestsBeyond: node.allow_requests_beyond_auto_approve !== false,
                autoApproveExtensions: node.auto_approve_extensions !== false,
                autoApproveEnabled: !!node.auto_approve,
                autoApproveIndividual: !!node.auto_approve && !isPoolAutoApprove(node),
                autoApproveQuota: { ...(node.auto_approve?.per_requester_limit || defaultQuota(resources)) },
                terminationDate: endDate(node.termination_date),
                maxTermDays: node.max_project_term_days ?? null,
                inheritsLimit: !!node.inherits_limit,
                releaseMax: normalizeRelease(node.release_max),
                workspaceScratchGb: normalizeScratch(node.workspace_scratch_gb),
                batchPriority: normalizeBatchPriority(node.batch_priority),
                batchJobs: normalizeBatchJobs(node.batch_jobs),
            }
            : {
                parentId: parent?.id ?? eligibleBudgets[0]?.id ?? null,
                name: '',
                reason: '',
                quota: defaultQuota(resources),
                // Start with the creator: a requester manages the budget they ask
                // for, and a manager carving out a sub-budget manages it until they
                // hand it over. Leaving this empty is almost always a slip — the
                // budget would then appear in nobody's "My Budgets" — so the common
                // case is pre-filled instead of demanded (it stays required below).
                adminScope: currentUserEmail ? [`user:${currentUserEmail}`] : [],
                eligibleRequesters: [],
                // Off for a NEW budget: delegating further is a deliberate act, and a
                // budget that accepts sub-budget requests hands its structure to its
                // requesters. Existing budgets are untouched — the API still treats an
                // unset flag as "allowed".
                allowSubBudgetRequests: false,
                // As before the switch existed: beyond auto-approve, a manager decides.
                allowRequestsBeyond: true,
                autoApproveExtensions: true,
                autoApproveEnabled: false,
                // A pool unless said otherwise: the budget's own cap already
                // bounds it, and a per-person limit only matters once several
                // people share it.
                autoApproveIndividual: false,
                autoApproveQuota: defaultQuota(resources),
                // A budget under one that ends ends with it, unless told sooner.
                terminationDate: endOf(parent?.id ?? eligibleBudgets[0]?.id ?? null),
                // Under a budget that limits its projects, so does this one.
                maxTermDays: termOf(parent?.id ?? eligibleBudgets[0]?.id ?? null),
                inheritsLimit: false,
                // Nothing of its own: the budgets above decide until somebody tightens them here.
                releaseMax: normalizeRelease(null),
                workspaceScratchGb: null,
                batchPriority: null,
                batchJobs: null,
            },
        validate: (values) => ({
            name: (values.name || '').trim().length < 3
                ? t('projects.budgetForm.nameRequired') : null,
            reason: isEdit ? null : reasonError(values.reason, t('projects.budgetForm.purposeRequired')),
            parentId: (isRequest && !values.parentId)
                ? t('projects.budgetForm.requestFromRequired') : null,
            terminationDate: (() => {
                const bound = endOf(values.parentId);
                if (!bound) return null;
                if (!values.terminationDate) return t('projects.budgetForm.endDateNeeded', { date: formatDate(bound) });
                return values.terminationDate > bound
                    ? t('projects.budgetForm.endDateAfterParent', { date: formatDate(bound) }) : null;
            })(),
            adminScope: !values.adminScope.length
                ? t('projects.budgetForm.adminScopeRequired')
                : null,
            ...(values.inheritsLimit ? {} : Object.fromEntries(
                Object.entries(validateQuota(t, visibleResources(resources, scopeFor(values.parentId)), values.quota, { allowUnlimited: true, emptyIsZero: true }))
                    .map(([id, msg]) => [`quota.${id}`, msg]))),
            ...(values.autoApproveEnabled && values.autoApproveIndividual
                ? Object.fromEntries(
                    Object.entries(validateQuota(t, visibleResources(resources, scopeFor(values.parentId)), values.autoApproveQuota, { emptyIsZero: true }))
                        .map(([id, msg]) => [`autoApproveQuota.${id}`, msg]))
                : {}),
            ...(releaseTabKind(values.parentId) === undefined ? {} : releaseErrors(t, values.releaseMax, releaseAbove(values.parentId))),
            ...(releaseTabKind(values.parentId) === undefined ? {} : scratchErrors(t, values.workspaceScratchGb, scratchAbove(values.parentId))),
            ...(releaseTabKind(values.parentId) === undefined ? {} : batchPriorityErrors(t, values.batchPriority, batchAbove(values.parentId))),
            ...(releaseTabKind(values.parentId) === undefined || values.inheritsLimit ? {} : batchJobsErrors(t, values.batchJobs, jobsAbove(values.parentId), isRoot)),
        }),
    });

    const { quota, adminScope, eligibleRequesters, autoApproveEnabled, autoApproveIndividual, autoApproveQuota, allowRequestsBeyond, autoApproveExtensions, inheritsLimit } = form.values;
    // The budget whose limit one that inherits passes on, by name where known.
    const inheritedFrom = isEdit ? node?.parent_name : parent?.name;
    const offered = visibleResources(resources, scopeFor(form.values.parentId));
    // One resources tab per kind where the budget offers several (Cloud, Workspaces, LLM), as in the project dialog.
    const resourceKinds = (() => {
        const ks = catalogKinds(resources).length < 2 ? [] : PROJECT_KINDS.filter(k => offered.some(r => kindOfResource(r) === k));
        return ks.length > 1 ? ks : [null];
    })();
    const resourceTabValue = (kind) => (kind ? `${TAB_RESOURCES}-${kind}` : TAB_RESOURCES);
    const ofKind = (kind) => (kind ? offered.filter(r => kindOfResource(r) === kind) : offered);
    const resourceById = Object.fromEntries((resources || []).map(r => [r.id, r]));
    const releaseKind = releaseTabKind(form.values.parentId);
    // The AI service's release times where no budget sets any, for the placeholders of the release maximums: its catalogue, only where the budget holds workspaces. Without access to it (no workspace project of one's own) the placeholders say only "default".
    const gpuApi = useGpuApi();
    const catalog = useQuery({ queryKey: gpuKeys.catalog(), queryFn: () => gpuApi.catalog(), staleTime: 10 * 60 * 1000, retry: false, enabled: llmEnabled && releaseKind !== undefined });

    // The budget the new one would draw from: the picked one when requesting,
    // the parent when a manager carves out a sub-budget directly. Editing shows
    // no shares — the node's own cap already counts against the parent there,
    // so "free" would undercount what a manager may set.
    const sourceBudget = isEdit ? null : scopeFor(form.values.parentId);
    const headroom = sourceBudget
        ? Object.fromEntries(offered.filter(r => !isAvailability(r))
            .map(r => [r.id, freeAmount(sourceBudget, r.id)]))
        : null;
    // "296/300 Cores · 1584/1600 GB RAM (GB)" — free of total, capped resources
    // only: a share of an uncapped budget says nothing.
    const freeSummary = sourceBudget
        ? offered
            .filter(r => !isAvailability(r))
            .map(r => {
                const cap = sourceBudget.limit?.[r.id];
                if (cap === UNLIMITED_QUOTA || cap === undefined || cap === null) return null;
                const free = freeAmount(sourceBudget, r.id);
                return r.unit ? `${free}/${cap} ${r.unit} ${r.name}` : `${free}/${cap} ${r.name}`;
            })
            .filter(Boolean)
            .join(' · ')
        : '';

    // The auto-approve policy as the API takes it: none, a pool (no per-person
    // limit — the budget's own room is the bound), or individual limits.
    const autoApprovePolicy = (values) => {
        if (!values.autoApproveEnabled) return null;
        return values.autoApproveIndividual ? { per_requester_limit: values.autoApproveQuota } : {};
    };
    // A budget with individual limits takes no sub-budget requests (the API refuses the combination), whatever the checkbox held before.
    const hasPerPersonLimit = (values) => values.autoApproveEnabled && values.autoApproveIndividual;
    const subBudgetRequestsAllowed = (values) => values.allowSubBudgetRequests && !hasPerPersonLimit(values);

    // Which tab to flag: a field the user cannot see must not fail silently.
    const fieldsByTab = {
        [TAB_DETAILS]: (k) => ['name', 'reason', 'parentId', 'terminationDate', 'maxTermDays'].includes(k),
        ...Object.fromEntries(resourceKinds.map(kind => [resourceTabValue(kind),
            (k) => (k.startsWith('quota.') && (!kind || kindOfResource(resourceById[k.slice(6)]) === kind)) || ((k.startsWith('releaseMax.') || k === 'workspaceScratchGb' || k === 'batchPriority' || k === 'batchJobs') && kind === releaseKind)])),
        [TAB_ACCESS]: (k) => k === 'adminScope' || k === 'eligibleRequesters',
        [TAB_AUTO_APPROVE]: (k) => k.startsWith('autoApproveQuota.'),
    };
    const tabHasError = (tab) => tabFlag(fieldsByTab, tab, form.errors);

    // Ending earlier — or at all, where the budget had no end — carries down to
    // whatever below it runs longer, so say so before it happens.
    const shortensSubtree = isEdit && node?.child_count > 0 && !!form.values.terminationDate
        && (!node.termination_date || form.values.terminationDate < endDate(node.termination_date));

    const buildEditBody = (values) => {
        const {
            name, quota, adminScope, eligibleRequesters, terminationDate,
        } = values;
        const allowSubBudgetRequests = subBudgetRequestsAllowed(values);
        // Diff against the current node: only send what changed (see note above).
        const body = {};
        if (name !== (node.name || '')) body.name = name;
        const scopeChanged = JSON.stringify(adminScope) !== JSON.stringify(node.admin_scope || []);
        if (scopeChanged) body.admin_scope = adminScope;
        const eligibleChanged = JSON.stringify(eligibleRequesters) !== JSON.stringify(node.eligible_requesters || []);
        if (eligibleChanged) body.eligible_requesters = eligibleRequesters;
        if (allowSubBudgetRequests !== (node.allow_sub_budget_requests !== false)) {
            body.allow_sub_budget_requests = allowSubBudgetRequests;
        }
        if (values.allowRequestsBeyond !== (node.allow_requests_beyond_auto_approve !== false)) {
            body.allow_requests_beyond_auto_approve = values.allowRequestsBeyond;
        }
        if (values.autoApproveExtensions !== (node.auto_approve_extensions !== false)) {
            body.auto_approve_extensions = values.autoApproveExtensions;
        }
        // Sent whole when changed; an empty object removes the budget's own.
        if (!sameRelease(values.releaseMax, node.release_max)) body.release_max = normalizeRelease(values.releaseMax);
        const scratch = normalizeScratch(values.workspaceScratchGb);
        if (scratch !== normalizeScratch(node.workspace_scratch_gb)) {
            if (scratch === null) body.workspace_scratch_gb = null;
            else body.workspace_scratch_gb = scratch;
        }
        const batch = normalizeBatchPriority(values.batchPriority);
        if (batch !== normalizeBatchPriority(node.batch_priority)) {
            if (batch === null) body.batch_priority = null;
            else body.batch_priority = batch;
        }
        // A budget that inherits its limit passes on the batch jobs above; switching that on drops its own on the server.
        if (!values.inheritsLimit && !sameBatchJobs(values.batchJobs, node.batch_jobs)) {
            const jobs = normalizeBatchJobs(values.batchJobs);
            if (jobs === null) body.batch_jobs = null;
            else body.batch_jobs = jobs;
        }
        if (values.maxTermDays !== (node.max_project_term_days ?? null)) {
            if (values.maxTermDays) body.max_project_term_days = values.maxTermDays;
            else body.max_project_term_days = null;
        }
        const policy = autoApprovePolicy(values);
        if (policy) {
            const prev = JSON.stringify(node.auto_approve?.per_requester_limit || {});
            if (!node.auto_approve || prev !== JSON.stringify(policy.per_requester_limit || {})) {
                body.auto_approve = policy;
            }
        } else if (node.auto_approve) {
            body.auto_approve = null;
        }
        // Inheriting, the limit is the parent's and not sent; switching it off
        // keeps the inherited values unless they were changed here.
        if (values.inheritsLimit !== !!node.inherits_limit) body.inherits_limit = values.inheritsLimit;
        const limitChanged = (resources || []).some(r => (quota[r.id] ?? 0) !== (node.limit?.[r.id] ?? 0));
        if (limitChanged && !values.inheritsLimit) body.limit = quota;
        const prevDate = node.termination_date ? endDate(node.termination_date).getTime() : null;
        const nextDate = terminationDate ? terminationDate.getTime() : null;
        if (prevDate !== nextDate && nextDate) body.termination_date = endDay(terminationDate);
        // Absent means "leave as is"; null removes the end date (and the other fields above), since 10.11.2026 instead of clear_* flags.
        else if (prevDate && !nextDate) body.termination_date = null;
        return body;
    };

    const save = useNodeMutation({
        onDone,
        onClose,
        mutationFn: async (values) => {
            if (isEdit) {
                const body = buildEditBody(values);
                let result = Object.keys(body).length ? await api.updateNode(node.id, body) : node;
                if (parentChanged) result = await api.move(node.id, newParent);
                const attributes = attrs.changed();
                if (attributes) result = await api.setAttributes(node.id, attributes);
                return result;
            }
            return api.createNode({
                parent_id: values.parentId,
                kind: 'budget',
                name: values.name,
                reason: values.reason,
                limit: values.inheritsLimit ? {} : values.quota,
                inherits_limit: values.inheritsLimit,
                admin_scope: values.adminScope,
                eligible_requesters: values.eligibleRequesters,
                allow_sub_budget_requests: subBudgetRequestsAllowed(values),
                allow_requests_beyond_auto_approve: values.allowRequestsBeyond,
                auto_approve_extensions: values.autoApproveExtensions,
                auto_approve: autoApprovePolicy(values),
                max_project_term_days: values.maxTermDays,
                ...(isEmptyRelease(values.releaseMax) ? {} : { release_max: normalizeRelease(values.releaseMax) }),
                ...(normalizeScratch(values.workspaceScratchGb) === null ? {} : { workspace_scratch_gb: normalizeScratch(values.workspaceScratchGb) }),
                ...(normalizeBatchPriority(values.batchPriority) === null ? {} : { batch_priority: normalizeBatchPriority(values.batchPriority) }),
                ...(values.inheritsLimit || normalizeBatchJobs(values.batchJobs) === null ? {} : { batch_jobs: normalizeBatchJobs(values.batchJobs) }),
                termination_date: endDay(values.terminationDate),
            });
        },
    });

    // Jump to the problem instead of leaving the button looking broken: the
    // offending field is usually on a tab the user is not looking at.
    const handleInvalid = (errs) => {
        const bad = tabWithError(fieldsByTab, errs);
        if (bad) setActiveTab(bad);
    };

    // Editing is also where a manager looks at the budget: it carries the
    // history and usage tabs of the read-only dialog.
    const title = isEdit ? t('projects.inspect.titleBudget', { name: node?.name || node?.id })
        : isRequest ? t('projects.budgetForm.titleRequest')
            : t('projects.budgetForm.titleNew', { name: parent?.name || parent?.id });

    const detailsTab = (
        <Stack>
            {canMove && (
                <BudgetSelect
                    label={t('projects.budgetForm.parent')}
                    description={t('projects.budgetForm.moveHint')}
                    budgets={withCurrentParent(node, moveTargets)}
                    value={newParent}
                    onChange={setNewParent}
                />
            )}
            {isRequest && (
                <BudgetSelect
                    label={t('projects.budgetForm.requestFrom')}
                    description={t('projects.budgetForm.requestFromHint')}
                    budgets={eligibleBudgets}
                    value={form.values.parentId}
                    error={form.errors.parentId}
                    onChange={(id) => {
                        form.setFieldValue('parentId', id);
                        form.clearFieldError('parentId');
                        // Another budget may end sooner: pull the date in with it.
                        const bound = endOf(id);
                        const date = form.values.terminationDate;
                        if (bound && (!date || date > bound)) form.setFieldValue('terminationDate', bound);
                        // And it may limit its projects more tightly.
                        const term = termOf(id);
                        const days = form.values.maxTermDays;
                        if (term && (!days || days > term)) form.setFieldValue('maxTermDays', term);
                    }}
                />
            )}
            {isRequest && freeSummary && (
                <Text size="xs" c="dimmed" mt={-8}>
                    {t('projects.budgetForm.stillFree', { summary: freeSummary })}
                </Text>
            )}

            <TextInput
                label={t('projects.budgetForm.name')}
                description={t('projects.budgetForm.nameHint')}
                required
                // A new budget starts with its name; an existing one is looked at.
                data-autofocus={!isEdit || undefined}
                {...form.getInputProps('name')}
            />

            {/* The purpose is the request's; an existing budget shows it but
                keeps it (the API changes no reason in place). */}
            <ReasonField
                label={t('projects.budgetForm.purpose')}
                description={isEdit ? undefined : t('projects.budgetForm.purposeHint')}
                required={!isEdit}
                disabled={isEdit}
                {...form.getInputProps('reason')}
            />

            <TerminationDatePicker
                optional
                maxDate={endOf(form.values.parentId)}
                {...form.getInputProps('terminationDate')}
            />
            {shortensSubtree && (
                <Alert variant="light" color={COLOR.attention} icon={<Info size="16" />} p="xs">
                    <Text size="xs">
                        {t('projects.budgetForm.shortensSubtree', { date: formatDate(form.values.terminationDate) })}
                    </Text>
                </Alert>
            )}

            <MaxTermInput
                value={form.values.maxTermDays}
                bound={termOf(form.values.parentId)}
                onChange={(d) => form.setFieldValue('maxTermDays', d)}
            />
        </Stack>
    );

    // Passing on the whole limit above is for managers only — a requester
    // asks for an amount.
    const resourcesTab = (kind, first) => {
        const quotaPart = (
            <Stack>
                {first && !isRequest && (
                    <Switch
                        label={t('projects.budgetForm.inheritsLimit')}
                        description={t('projects.budgetForm.inheritsLimitHint')}
                        {...form.getInputProps('inheritsLimit', { type: 'checkbox' })}
                    />
                )}
                {inheritsLimit ? (
                    <Alert variant="light" color={COLOR.info} icon={<Info size="16" />} p="xs">
                        <Text size="xs">
                            {inheritedFrom
                                ? t('projects.budgetForm.inheritsLimitFrom', { name: inheritedFrom })
                                : t('projects.budgetForm.inheritsLimitFromAbove')}
                        </Text>
                    </Alert>
                ) : (
                    <div>
                        <Text fw={600} size="sm">{t('projects.budgetForm.resourceCap')}</Text>
                        <Text size="xs" c="dimmed" mb="xs">
                            {t('projects.budgetForm.resourceCapHint')}
                        </Text>
                        <QuotaInputs
                            emptyIsZero
                            resources={ofKind(kind)}
                            value={quota}
                            errors={Object.fromEntries(ofKind(kind).map(r => [r.id, form.errors[`quota.${r.id}`]]))}
                            allowUnlimited
                            headroom={headroom}
                            onChange={(id, v) => { form.setFieldValue(`quota.${id}`, v); form.clearFieldError(`quota.${id}`); }}
                        />
                    </div>
                )}
            </Stack>
        );
        if (releaseKind === undefined || kind !== releaseKind) return quotaPart;
        // Workspaces: the quantities and three rules that are no quantities (release times, local storage, batch jobs), each in a sub-tab of its own instead of one long page; a sub-tab with an error is marked, as the dialog's tabs are.
        const hasError = (test) => Object.keys(form.errors).some(test);
        const sub = (value, label, test) => (
            <Tabs.Tab value={value}>
                <Indicator color="red" size={7} offset={-2} disabled={!hasError(test)}>{label}</Indicator>
            </Tabs.Tab>
        );
        return (
            <Tabs defaultValue="quota" variant="pills" radius="md">
                <Tabs.List mb="md">
                    {sub('quota', t('projects.budgetForm.sub.quota'), k => k.startsWith('quota.'))}
                    {sub('release', t('projects.budgetForm.sub.release'), k => k.startsWith('releaseMax.'))}
                    {sub('storage', t('projects.budgetForm.sub.storage'), k => k === 'workspaceScratchGb')}
                    {sub('jobs', t('projects.budgetForm.sub.jobs'), k => k === 'batchPriority' || k === 'batchJobs')}
                </Tabs.List>
                <Tabs.Panel value="quota">{quotaPart}</Tabs.Panel>
                {/* Not quantities, so not part of the limit: shown also while the limit is inherited. */}
                <Tabs.Panel value="release">
                    <ReleaseMaxInputs
                        value={form.values.releaseMax}
                        inherited={releaseAbove(form.values.parentId)}
                        defaults={catalog.data?.releaseDefaults}
                        errors={form.errors}
                        onChange={(k, field, v) => {
                            const path = `releaseMax.${k}.${field}`;
                            form.setFieldValue(path, v);
                            form.clearFieldError(path);
                        }}
                    />
                </Tabs.Panel>
                <Tabs.Panel value="storage">
                    <WorkspaceScratchInput
                        value={form.values.workspaceScratchGb}
                        inherited={scratchAbove(form.values.parentId)}
                        error={form.errors.workspaceScratchGb}
                        onChange={(v) => {
                            form.setFieldValue('workspaceScratchGb', v);
                            form.clearFieldError('workspaceScratchGb');
                        }}
                    />
                </Tabs.Panel>
                <Tabs.Panel value="jobs">
                    <Stack gap="lg">
                        {(inheritsLimit || availableBatchJobs(form.values.batchJobs, jobsAbove(form.values.parentId), isRoot)) && <BatchJobsInput
                            value={form.values.batchJobs}
                            inherited={jobsAbove(form.values.parentId)}
                            isRoot={isRoot}
                            inheritsLimit={inheritsLimit}
                            error={form.errors.batchJobs}
                            onChange={(v) => {
                                form.setFieldValue('batchJobs', v);
                                form.clearFieldError('batchJobs');
                            }}
                        />}
                        <BatchPriorityInput
                            value={form.values.batchPriority}
                            inherited={batchAbove(form.values.parentId)}
                            error={form.errors.batchPriority}
                            onChange={(v) => {
                                form.setFieldValue('batchPriority', v);
                                form.clearFieldError('batchPriority');
                            }}
                        />
                    </Stack>
                </Tabs.Panel>
            </Tabs>
        );
    };

    // Two questions, two boxes: who runs this budget, and who may ask it for
    // something. Flat in one column they read as equally important switches
    // instead of two groups. (What goes through without being asked is its own
    // tab — see autoApproveTab.)
    const hasRequesters = eligibleRequesters.length > 0;
    const perPersonLimit = hasPerPersonLimit(form.values);
    // Everything below the requester list only matters once somebody may request
    // at all — shown faded rather than hidden, so the setting stays discoverable.
    const fadedWithoutRequesters = { opacity: hasRequesters ? 1 : 0.45, transition: 'opacity 150ms ease' };
    const accessTab = (
        <Stack>
            {/* The group legend IS the field label — printing "Managed by" again
                inside a box called "Management" says the same thing twice. */}
            <Fieldset legend={t('projects.fact.managedBy')}>
                <TokenListEditor
                    description={t('projects.budgetForm.managedByHint')}
                    tokens={adminScope}
                    onChange={(t) => { form.setFieldValue('adminScope', t); form.clearFieldError('adminScope'); }}
                    error={form.errors.adminScope}
                />
            </Fieldset>

            <Fieldset legend={t('projects.forms.whoCanRequest')}>
                <Stack>
                    {/* The description deliberately says "project requests" only:
                        whether budgets may be requested too is the checkbox at the
                        end of this group, which would otherwise contradict it. */}
                    <TokenListEditor
                        description={t('projects.budgetForm.requestersHint')}
                        tokens={eligibleRequesters}
                        onChange={(t) => form.setFieldValue('eligibleRequesters', t)}
                    />

                    <Checkbox
                        label={t('projects.budgetForm.allowBudgetRequests')}
                        description={!hasRequesters
                            ? t('projects.budgetForm.allowBudgetRequestsInactive')
                            : perPersonLimit
                                ? t('projects.budgetForm.allowBudgetRequestsPerPerson')
                                : t('projects.budgetForm.allowBudgetRequestsHint')}
                        disabled={!hasRequesters || perPersonLimit}
                        {...form.getInputProps('allowSubBudgetRequests', { type: 'checkbox' })}
                        checked={subBudgetRequestsAllowed(form.values)}
                        style={fadedWithoutRequesters}
                    />
                </Stack>
            </Fieldset>

        </Stack>
    );


    // Auto-approve is its own tab, not a third box under Access: it is the one
    // setting here that decides what happens WITHOUT a human, and next to the
    // access lists it drowned — the per-person limit alone is taller than both.
    const autoApproveTab = (
        <Stack>
            {!hasRequesters && (
                <Alert color={COLOR.info} variant="light" icon={<Info size="18" />}>
                    <Trans i18nKey="projects.budgetForm.autoApproveNoRequesters" components={{ 1: <b /> }} />
                </Alert>
            )}

            <Stack gap="md">
                <Switch
                    label={t('projects.budgetForm.autoApprove')}
                    description={t('projects.budgetForm.autoApproveHint')}
                    disabled={!hasRequesters}
                    {...form.getInputProps('autoApproveEnabled', { type: 'checkbox' })}
                    style={fadedWithoutRequesters}
                />
                {/* Indented under the main switch, and shown disabled rather than
                    hidden while auto-approve is off: it refines what that switch
                    does, so it must read as belonging to it. */}
                <Box
                    pl="xl"
                    ml="xs"
                    style={{
                        // Mantine only greys the inputs themselves; the labels and
                        // ranges would stay fully black and make the block read as
                        // active. Fading the whole group is what makes "off"
                        // obvious at a glance.
                        opacity: autoApproveEnabled && hasRequesters ? 1 : 0.45,
                        transition: 'opacity 150ms ease',
                    }}
                >
                    <Stack gap="sm">
                        {/* What happens to everything the policy does not
                            cover: a manager decides, or it is refused. */}
                        <Switch
                            label={t('projects.budgetForm.allowBeyond')}
                            description={allowRequestsBeyond
                                ? t('projects.budgetForm.allowBeyondOn')
                                : t('projects.budgetForm.allowBeyondOff')}
                            disabled={!autoApproveEnabled || !hasRequesters}
                            {...form.getInputProps('allowRequestsBeyond', { type: 'checkbox' })}
                        />
                        <Switch
                            label={t('projects.budgetForm.autoApproveExtensions')}
                            description={autoApproveExtensions
                                ? t('projects.budgetForm.autoApproveExtensionsOn')
                                : t('projects.budgetForm.autoApproveExtensionsOff')}
                            disabled={!autoApproveEnabled || !hasRequesters}
                            {...form.getInputProps('autoApproveExtensions', { type: 'checkbox' })}
                        />
                        <Switch
                            label={t('projects.budgetForm.individual')}
                            description={autoApproveIndividual
                                ? t('projects.budgetForm.individualOn')
                                : t('projects.budgetForm.individualOff')}
                            disabled={!autoApproveEnabled || !hasRequesters}
                            {...form.getInputProps('autoApproveIndividual', { type: 'checkbox' })}
                        />
                        {/* Split by provider like the resources tabs, each part under its name. */}
                        {autoApproveIndividual && resourceKinds.map(kind => (
                            <Stack key={kind ?? 'all'} gap="xs">
                                {kind && <Text fw={600} size="sm">{t(`projects.kind.${kind}`)}</Text>}
                                <QuotaInputs
                                    emptyIsZero
                                    resources={ofKind(kind)}
                                    value={autoApproveQuota}
                                    disabled={!autoApproveEnabled || !hasRequesters}
                                    errors={Object.fromEntries(ofKind(kind).map(r => [r.id, form.errors[`autoApproveQuota.${r.id}`]]))}
                                    onChange={(id, v) => {
                                        form.setFieldValue(`autoApproveQuota.${id}`, v);
                                        form.clearFieldError(`autoApproveQuota.${id}`);
                                    }}
                                />
                            </Stack>
                        ))}
                    </Stack>
                </Box>
                <Text size="xs" c="dimmed">
                    {t('projects.budgetForm.neverNeedApproval')}
                </Text>
            </Stack>
        </Stack>
    );

    return (
        <FormModal
            opened={opened}
            // Wider when it holds history and usage too, so the tabs fit on one line.
            // Every tabbed form is as wide: the tabs and member rows fit.
            size={DIALOG_SIZE}
            onClose={onClose}
            title={title}
            onSubmit={form.onSubmit(values => {
                if (isEdit && !attrs.validate()) return setActiveTab(TAB_ATTRIBUTES);
                save.mutate(values);
            }, handleInvalid)}
            submitting={save.isPending}
            submitError={attrs.error || (save.error && formatError(save.error))}
            submitLabel={isEdit ? t('projects.forms.saveChanges')
                : isRequest ? t('projects.forms.submitRequest')
                    : t('projects.budgetForm.submitCreate')}
        >
            <FormTabs
                value={activeTab}
                onChange={setActiveTab}
                tabs={[
                    { value: TAB_DETAILS, label: t('projects.actions.details'), hasError: tabHasError(TAB_DETAILS), content: detailsTab },
                    ...resourceKinds.map((kind, i) => ({
                        value: resourceTabValue(kind),
                        label: kind ? t(`projects.kind.${kind}`) : t('projects.fact.resources'),
                        hasError: tabHasError(resourceTabValue(kind)),
                        content: resourcesTab(kind, i === 0),
                    })),
                    { value: TAB_ACCESS, label: t('projects.budgetForm.tabAccess'), hasError: tabHasError(TAB_ACCESS), content: accessTab },
                    { value: TAB_AUTO_APPROVE, label: t('projects.budgetForm.tabAutoApprove'), hasError: tabHasError(TAB_AUTO_APPROVE), content: autoApproveTab },
                    ...(isEdit ? [{ value: TAB_ATTRIBUTES, label: t('projects.attributes.tab'), hasError: !!attrs.error,
                        content: <AttributesEditor node={node} groups={attrs.groups} onChange={attrs.onChange} /> }] : []),
                    ...(isEdit ? nodeExtraTabs(t, node, resources, activeTab) : []),
                ]}
            />
        </FormModal>
    );
}
