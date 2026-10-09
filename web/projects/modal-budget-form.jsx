import { useState } from 'react';
import { Info } from 'lucide-react';
import { Alert, Box, Checkbox, Fieldset, Stack, Switch, Text, TextInput } from '@mantine/core';
import { Trans, useTranslation } from 'react-i18next';
import { useNodesApi } from './api-nodes.jsx';
import { useForm } from '@mantine/form';
import { MaxTermInput, TerminationDatePicker } from './component-common.jsx';
import { formatDate } from '../format-date.js';
import { FormModal, FormTabs, tabHasError as tabFlag, tabWithError } from './component-form-modal.jsx';
import { defaultQuota, QuotaInputs, validateQuota } from './component-quota-inputs.jsx';
import { TokenListEditor } from './component-token-list-editor.jsx';
import { formatError } from '/helper/api-error.js';
import { COLOR, freeAmount, isAvailability, isPoolAutoApprove, UNLIMITED_QUOTA, visibleResources } from './util-project.jsx';
import { BudgetSelect, withCurrentParent } from './component-budget-select.jsx';
import { ReasonField, reasonError } from './component-reason-field.jsx';
import { useNodeMutation } from './use-node-mutation.jsx';
import { AttributesEditor, useAttributesTab } from './component-node-attributes.jsx';
import { nodeExtraTabs } from './modal-inspect.jsx';

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
        return end ? new Date(end) : null;
    };
    // Its maximum project term likewise: this one may only be shorter.
    const termOf = (parentId) => boundFor(parentId)?.max_project_term_days ?? null;

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
                terminationDate: node.termination_date ? new Date(node.termination_date) : null,
                maxTermDays: node.max_project_term_days ?? null,
                inheritsLimit: !!node.inherits_limit,
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
                Object.entries(validateQuota(t, visibleResources(resources, scopeFor(values.parentId)), values.quota, { allowUnlimited: true }))
                    .map(([id, msg]) => [`quota.${id}`, msg]))),
            ...(values.autoApproveEnabled && values.autoApproveIndividual
                ? Object.fromEntries(
                    Object.entries(validateQuota(t, visibleResources(resources, scopeFor(values.parentId)), values.autoApproveQuota))
                        .map(([id, msg]) => [`autoApproveQuota.${id}`, msg]))
                : {}),
        }),
    });

    const { quota, adminScope, eligibleRequesters, autoApproveEnabled, autoApproveIndividual, autoApproveQuota, allowRequestsBeyond, autoApproveExtensions, inheritsLimit } = form.values;
    // The budget whose limit one that inherits passes on, by name where known.
    const inheritedFrom = isEdit ? node?.parent_name : parent?.name;
    const offered = visibleResources(resources, scopeFor(form.values.parentId));

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

    // Which tab to flag: a field the user cannot see must not fail silently.
    const fieldsByTab = {
        [TAB_DETAILS]: (k) => ['name', 'reason', 'parentId', 'terminationDate', 'maxTermDays'].includes(k),
        [TAB_RESOURCES]: (k) => k.startsWith('quota.'),
        [TAB_ACCESS]: (k) => k === 'adminScope' || k === 'eligibleRequesters',
        [TAB_AUTO_APPROVE]: (k) => k.startsWith('autoApproveQuota.'),
    };
    const tabHasError = (tab) => tabFlag(fieldsByTab, tab, form.errors);

    // Ending earlier — or at all, where the budget had no end — carries down to
    // whatever below it runs longer, so say so before it happens.
    const shortensSubtree = isEdit && node?.child_count > 0 && !!form.values.terminationDate
        && (!node.termination_date || form.values.terminationDate < new Date(node.termination_date));

    const buildEditBody = (values) => {
        const {
            name, quota, adminScope, eligibleRequesters,
            allowSubBudgetRequests, terminationDate,
        } = values;
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
        if (values.maxTermDays !== (node.max_project_term_days ?? null)) {
            if (values.maxTermDays) body.max_project_term_days = values.maxTermDays;
            else body.clear_max_project_term_days = true;
        }
        const policy = autoApprovePolicy(values);
        if (policy) {
            const prev = JSON.stringify(node.auto_approve?.per_requester_limit || {});
            if (!node.auto_approve || prev !== JSON.stringify(policy.per_requester_limit || {})) {
                body.auto_approve = policy;
            }
        } else if (node.auto_approve) {
            body.clear_auto_approve = true;
        }
        // Inheriting, the limit is the parent's and not sent; switching it off
        // keeps the inherited values unless they were changed here.
        if (values.inheritsLimit !== !!node.inherits_limit) body.inherits_limit = values.inheritsLimit;
        const limitChanged = (resources || []).some(r => (quota[r.id] ?? 0) !== (node.limit?.[r.id] ?? 0));
        if (limitChanged && !values.inheritsLimit) body.limit = quota;
        const prevDate = node.termination_date ? new Date(node.termination_date).getTime() : null;
        const nextDate = terminationDate ? terminationDate.getTime() : null;
        if (prevDate !== nextDate && nextDate) body.termination_date = terminationDate.toISOString();
        // Removing a date needs its own flag: an absent termination_date means
        // "leave as is", so switching the end date off would otherwise be a no-op.
        else if (prevDate && !nextDate) body.clear_termination_date = true;
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
                allow_sub_budget_requests: values.allowSubBudgetRequests,
                allow_requests_beyond_auto_approve: values.allowRequestsBeyond,
                auto_approve_extensions: values.autoApproveExtensions,
                auto_approve: autoApprovePolicy(values),
                max_project_term_days: values.maxTermDays,
                termination_date: values.terminationDate ? values.terminationDate.toISOString() : null,
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
    const resourcesTab = (
        <Stack>
            {!isRequest && (
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
                        resources={offered}
                        value={quota}
                        errors={Object.fromEntries(offered.map(r => [r.id, form.errors[`quota.${r.id}`]]))}
                        allowUnlimited
                        headroom={headroom}
                        onChange={(id, v) => { form.setFieldValue(`quota.${id}`, v); form.clearFieldError(`quota.${id}`); }}
                    />
                </div>
            )}
        </Stack>
    );

    // Two questions, two boxes: who runs this budget, and who may ask it for
    // something. Flat in one column they read as equally important switches
    // instead of two groups. (What goes through without being asked is its own
    // tab — see autoApproveTab.)
    const hasRequesters = eligibleRequesters.length > 0;
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
                        description={hasRequesters
                            ? t('projects.budgetForm.allowBudgetRequestsHint')
                            : t('projects.budgetForm.allowBudgetRequestsInactive')}
                        disabled={!hasRequesters}
                        {...form.getInputProps('allowSubBudgetRequests', { type: 'checkbox' })}
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
                        {autoApproveIndividual && (
                            <QuotaInputs
                                resources={offered}
                                value={autoApproveQuota}
                                disabled={!autoApproveEnabled || !hasRequesters}
                                errors={Object.fromEntries(offered.map(r => [r.id, form.errors[`autoApproveQuota.${r.id}`]]))}
                                onChange={(id, v) => {
                                    form.setFieldValue(`autoApproveQuota.${id}`, v);
                                    form.clearFieldError(`autoApproveQuota.${id}`);
                                }}
                            />
                        )}
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
            size={isEdit ? 'xl' : 'lg'}
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
                    { value: TAB_RESOURCES, label: t('projects.fact.resources'), hasError: tabHasError(TAB_RESOURCES), content: resourcesTab },
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
