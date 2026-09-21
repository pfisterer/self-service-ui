import { useState } from 'react';
import { Info } from 'lucide-react';
import { Alert, Box, Checkbox, Fieldset, Select, Stack, Switch, Text, Textarea, TextInput } from '@mantine/core';
import { useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { useApiMutation } from '/helper/query-state.jsx';
import { useForm } from '@mantine/form';
import { TerminationDatePicker } from './component-common.jsx';
import { FormModal, FormTabs } from './component-form-modal.jsx';
import { defaultQuota, QuotaInputs, validateQuota } from './component-quota-inputs.jsx';
import { TokenListEditor } from './component-token-list-editor.jsx';
import { COLOR, formatError, freeAmount, isAvailability, isPoolAutoApprove, UNLIMITED_QUOTA, visibleResources } from './util-project.jsx';

// Same three-step split as the project dialog: what it is → how much → who.
const TAB_DETAILS = 'details';
const TAB_RESOURCES = 'resources';
const TAB_ACCESS = 'access';
const TAB_AUTO_APPROVE = 'auto-approve';

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
export function BudgetFormModal({ opened, onClose, onDone, resources, mode, parent = null, node = null, eligibleBudgets = [], currentUserEmail = '' }) {
    const api = useNodesApi();
    const isEdit = mode === 'edit';
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

    const [activeTab, setActiveTab] = useState(TAB_DETAILS);

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
                autoApproveEnabled: !!node.auto_approve,
                autoApproveIndividual: !!node.auto_approve && !isPoolAutoApprove(node),
                autoApproveQuota: { ...(node.auto_approve?.per_requester_limit || defaultQuota(resources)) },
                terminationDate: node.termination_date ? new Date(node.termination_date) : null,
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
                autoApproveEnabled: false,
                // A pool unless said otherwise: the budget's own cap already
                // bounds it, and a per-person limit only matters once several
                // people share it.
                autoApproveIndividual: false,
                autoApproveQuota: defaultQuota(resources),
                terminationDate: null,
            },
        validate: (values) => ({
            name: (values.name || '').trim().length < 3
                ? 'Please give the budget a name (at least 3 characters)' : null,
            reason: (!isEdit && (values.reason || '').trim().length < 5)
                ? 'Please describe what this budget is for (at least 5 characters)' : null,
            parentId: (isRequest && !values.parentId)
                ? 'Please choose the budget to request from' : null,
            adminScope: !values.adminScope.length
                ? 'Name at least one person or group — a budget nobody manages appears in nobody\'s "My Budgets", and requests under it land with the budget above instead'
                : null,
            ...Object.fromEntries(
                Object.entries(validateQuota(visibleResources(resources, scopeFor(values.parentId)), values.quota, { allowUnlimited: true }))
                    .map(([id, msg]) => [`quota.${id}`, msg])),
            ...(values.autoApproveEnabled && values.autoApproveIndividual
                ? Object.fromEntries(
                    Object.entries(validateQuota(visibleResources(resources, scopeFor(values.parentId)), values.autoApproveQuota))
                        .map(([id, msg]) => [`autoApproveQuota.${id}`, msg]))
                : {}),
        }),
    });

    const { quota, adminScope, eligibleRequesters, autoApproveEnabled, autoApproveIndividual, autoApproveQuota } = form.values;
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
    const errorsInTab = (tab, errs) => {
        if (tab === TAB_DETAILS) return ['name', 'reason', 'parentId'].some(k => errs[k]);
        if (tab === TAB_RESOURCES) return (resources || []).some(r => errs[`quota.${r.id}`]);
        if (tab === TAB_ACCESS) return !!errs.adminScope;
        if (tab === TAB_AUTO_APPROVE) return Object.keys(errs).some(k => k.startsWith('autoApproveQuota.'));
        return false;
    };
    const tabHasError = (tab) => errorsInTab(tab, form.errors);

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
        const policy = autoApprovePolicy(values);
        if (policy) {
            const prev = JSON.stringify(node.auto_approve?.per_requester_limit || {});
            if (!node.auto_approve || prev !== JSON.stringify(policy.per_requester_limit || {})) {
                body.auto_approve = policy;
            }
        } else if (node.auto_approve) {
            body.clear_auto_approve = true;
        }
        const limitChanged = (resources || []).some(r => (quota[r.id] ?? 0) !== (node.limit?.[r.id] ?? 0));
        if (limitChanged) body.limit = quota;
        const prevDate = node.termination_date ? new Date(node.termination_date).getTime() : null;
        const nextDate = terminationDate ? terminationDate.getTime() : null;
        if (prevDate !== nextDate && nextDate) body.termination_date = terminationDate.toISOString();
        // Removing a date needs its own flag: an absent termination_date means
        // "leave as is", so switching the end date off would otherwise be a no-op.
        else if (prevDate && !nextDate) body.clear_termination_date = true;
        return body;
    };

    const save = useApiMutation({
        mutationFn: async (values) => {
            if (isEdit) {
                const body = buildEditBody(values);
                return Object.keys(body).length ? api.updateNode(node.id, body) : node;
            }
            return api.createNode({
                parent_id: values.parentId,
                kind: 'budget',
                name: values.name,
                reason: values.reason,
                limit: values.quota,
                admin_scope: values.adminScope,
                eligible_requesters: values.eligibleRequesters,
                allow_sub_budget_requests: values.allowSubBudgetRequests,
                allow_requests_beyond_auto_approve: values.allowRequestsBeyond,
                auto_approve: autoApprovePolicy(values),
                termination_date: values.terminationDate ? values.terminationDate.toISOString() : null,
            });
        },
        invalidates: [projectKeys.tree()],
        reportErrors: 'inline',
        onSuccess: (result) => { onDone?.(result); onClose(); },
        // A 409 means this dialog was acting on a node that has moved on; there
        // is nothing here to correct, so close it and let the refreshed view speak.
        onConflict: () => { onDone?.(); onClose(); },
    });

    // Jump to the problem instead of leaving the button looking broken: the
    // offending field is usually on a tab the user is not looking at.
    const handleInvalid = (errs) => {
        const bad = [TAB_DETAILS, TAB_RESOURCES, TAB_ACCESS, TAB_AUTO_APPROVE]
            .find(t => errorsInTab(t, errs));
        if (bad) setActiveTab(bad);
    };

    const title = isEdit ? `Edit budget: ${node?.name || node?.id}`
        : isRequest ? 'Request a budget'
            : `New sub-budget under “${parent?.name || parent?.id}”`;

    const detailsTab = (
        <Stack>
            {isRequest && (
                <Select
                    label="Request from"
                    description="The budget that will provide the resources — its managers approve your request."
                    required
                    searchable
                    data={eligibleBudgets.map(b => ({ value: b.id, label: b.name || b.id }))}
                    {...form.getInputProps('parentId')}
                />
            )}
            {isRequest && freeSummary && (
                <Text size="xs" c="dimmed" mt={-8}>
                    Still free there: {freeSummary}
                </Text>
            )}

            <TextInput
                label="Name"
                description="A short, recognizable name, e.g. “CS Department” or “AI Lab WS26”."
                required
                {...form.getInputProps('name')}
            />

            {!isEdit && (
                <Textarea
                    label="Purpose"
                    description="What is this budget for?"
                    required
                    rows={2}
                    {...form.getInputProps('reason')}
                />
            )}

            <TerminationDatePicker
                label="Valid until"
                optional
                {...form.getInputProps('terminationDate')}
            />
        </Stack>
    );

    const resourcesTab = (
        <div>
            <Text fw={600} size="sm">Resource cap</Text>
            <Text size="xs" c="dimmed" mb="xs">
                The maximum everything under this budget may use in total.
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
            {/* The two lists below and the auto-approve tab combine into a
                handful of setups that people actually want. Naming those is
                quicker than making everybody derive them from the switches. */}
            <Alert color={COLOR.info} variant="light" icon={<Info size="18" />} p="xs">
                <Text size="xs" fw={600} mb={4}>Typical setups</Text>
                <Text size="xs">
                    <b>Hand over a budget</b> someone runs themselves (a lecturer, a department): put
                    them under <i>Managed by</i>.
                </Text>
                <Text size="xs">
                    <b>A pool</b> for one person or a team: put them under <i>Who can request here</i> and
                    switch on <i>Auto-approve</i> without individual limits — they create projects on
                    their own until the budget is used up.
                </Text>
                <Text size="xs">
                    <b>A course</b>: put the course group under <i>Who can request here</i> and switch on
                    {' '}<i>Auto-approve</i> with individual limits — every student gets the same share.
                </Text>
            </Alert>

            {/* The group legend IS the field label — printing "Managed by" again
                inside a box called "Management" says the same thing twice. */}
            <Fieldset legend="Managed by">
                <TokenListEditor
                    description="These people or groups run this budget: they approve requests, change its settings and can pass parts of it on as sub-budgets. Their own projects here are created without approval."
                    tokens={adminScope}
                    onChange={(t) => { form.setFieldValue('adminScope', t); form.clearFieldError('adminScope'); }}
                    error={form.errors.adminScope}
                />
            </Fieldset>

            <Fieldset legend="Who can request here">
                <Stack>
                    {/* The description deliberately says "project requests" only:
                        whether budgets may be requested too is the checkbox at the
                        end of this group, which would otherwise contradict it. */}
                    <TokenListEditor
                        description="These people or groups may create projects from this budget, without any say over it. Their projects wait for a manager's approval unless auto-approve covers them. Leave empty to disable requests."
                        tokens={eligibleRequesters}
                        onChange={(t) => form.setFieldValue('eligibleRequesters', t)}
                    />

                    <Checkbox
                        label="Also allow budget requests in addition to projects"
                        description={hasRequesters
                            ? 'A requester can then ask for a budget of their own here and delegate further. Turn this off for a course budget that should only ever hold projects — managers can always create sub-budgets directly.'
                            : 'Only relevant once somebody may request here.'}
                        disabled={!hasRequesters}
                        {...form.getInputProps('allowSubBudgetRequests', { type: 'checkbox' })}
                        style={fadedWithoutRequesters}
                    />

                    {/* Belongs to the requesters, not to auto-approve: it says what
                        they may ask for. It only has something to limit once
                        auto-approve is on, so it is faded until then. */}
                    <Checkbox
                        label="Also allow requests beyond auto-approve"
                        description={!hasRequesters
                            ? 'Only relevant once somebody may request here.'
                            : !autoApproveEnabled
                                ? 'Only relevant with auto-approve (next tab) — without it every request waits for a manager anyway.'
                                : form.values.allowRequestsBeyond
                                    ? 'What auto-approve does not cover waits for a manager. Turn this off to make it a hard limit.'
                                    : 'Off: what auto-approve does not cover is refused right away — nothing waits for a manager. Managers themselves are not limited.'}
                        disabled={!hasRequesters || !autoApproveEnabled}
                        {...form.getInputProps('allowRequestsBeyond', { type: 'checkbox' })}
                        style={{ opacity: hasRequesters && autoApproveEnabled ? 1 : 0.45, transition: 'opacity 150ms ease' }}
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
                    Nobody may request from this budget yet, so there is nothing to approve
                    automatically. Add people or groups under <b>Access → “Who can request here”</b>
                    {' '}first; this tab becomes editable as soon as somebody is listed.
                </Alert>
            )}

            <Stack gap="md">
                <Switch
                    label="Auto-approve requests"
                    description="Projects from the people under “Who can request here” are created immediately, without a manager, as long as this budget has room — and so are later changes to them that stay within it. Anything beyond waits for a manager."
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
                        <Switch
                            label="Apply individual limits"
                            description={autoApproveIndividual
                                ? 'Each person gets at most the amounts below, summed over all their projects here — the setup for a course. Beyond that, a manager decides.'
                                : 'Off: everybody draws from the whole budget until it is used up — the setup for a personal or team pool. Switch on to give each person a fixed share.'}
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
                    Whatever is set here: giving resources back, ending a project sooner and changing
                    its members never need an approval.
                </Text>
            </Stack>
        </Stack>
    );

    return (
        <FormModal
            opened={opened}
            onClose={onClose}
            title={title}
            onSubmit={form.onSubmit(values => save.mutate(values), handleInvalid)}
            submitting={save.isPending}
            submitError={save.error && formatError(save.error)}
            submitLabel={isEdit ? 'Save changes' : isRequest ? 'Submit request' : 'Create budget'}
        >
            <FormTabs
                value={activeTab}
                onChange={setActiveTab}
                tabs={[
                    { value: TAB_DETAILS, label: 'Details', hasError: tabHasError(TAB_DETAILS), content: detailsTab },
                    { value: TAB_RESOURCES, label: 'Resources', hasError: tabHasError(TAB_RESOURCES), content: resourcesTab },
                    { value: TAB_ACCESS, label: 'Access', hasError: tabHasError(TAB_ACCESS), content: accessTab },
                    { value: TAB_AUTO_APPROVE, label: 'Auto-approve', hasError: tabHasError(TAB_AUTO_APPROVE), content: autoApproveTab },
                ]}
            />
        </FormModal>
    );
}
