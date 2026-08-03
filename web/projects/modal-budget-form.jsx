import { useEffect, useState } from 'react';
import { Box, Checkbox, Select, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useNodesApi } from './api-nodes.jsx';
import { TerminationDatePicker } from './component-common.jsx';
import { FormModal, FormTabs, useFormErrors } from './component-form-modal.jsx';
import { defaultQuota, QuotaInputs, validateQuota } from './component-quota-inputs.jsx';
import { TokenListEditor } from './component-token-list-editor.jsx';
import { formatError } from './util-project.jsx';

// Same three-step split as the project dialog: what it is → how much → who.
const TAB_DETAILS = 'details';
const TAB_RESOURCES = 'resources';
const TAB_ACCESS = 'access';

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

    const [activeTab, setActiveTab] = useState(TAB_DETAILS);
    const [parentId, setParentId] = useState(null);
    const [name, setName] = useState('');
    const [reason, setReason] = useState('');
    const [quota, setQuota] = useState({});
    const [adminScope, setAdminScope] = useState([]);
    const [eligibleRequesters, setEligibleRequesters] = useState([]);
    const [allowSubBudgetRequests, setAllowSubBudgetRequests] = useState(false);
    const [autoApproveEnabled, setAutoApproveEnabled] = useState(false);
    const [autoApproveQuota, setAutoApproveQuota] = useState({});
    const [terminationDate, setTerminationDate] = useState(null);
    const { errors, setErrors, clear, clearPrefixed } = useFormErrors();
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState(null);

    useEffect(() => {
        if (!opened) return;
        setActiveTab(TAB_DETAILS);
        setErrors({});
        setSubmitError(null);
        if (isEdit && node) {
            setName(node.name || '');
            setReason(node.reason || '');
            setQuota({ ...node.limit });
            setAdminScope(node.admin_scope || []);
            setEligibleRequesters(node.eligible_requesters || []);
            setAllowSubBudgetRequests(node.allow_sub_budget_requests !== false);
            setAutoApproveEnabled(!!node.auto_approve);
            setAutoApproveQuota({ ...(node.auto_approve?.per_requester_limit || defaultQuota(resources)) });
            setTerminationDate(node.termination_date ? new Date(node.termination_date) : null);
        } else {
            setParentId(parent?.id ?? eligibleBudgets[0]?.id ?? null);
            setName('');
            setReason('');
            setQuota(defaultQuota(resources));
            // Start with the creator: a requester manages the budget they ask
            // for, and a manager carving out a sub-budget manages it until they
            // hand it over. Leaving this empty is almost always a slip — the
            // budget would then appear in nobody's "My Budgets" — so the common
            // case is pre-filled instead of demanded (it stays required below).
            setAdminScope(currentUserEmail ? [`user:${currentUserEmail}`] : []);
            setEligibleRequesters([]);
            // Off for a NEW budget: delegating further is a deliberate act, and a
            // budget that accepts sub-budget requests hands its structure to its
            // requesters. Existing budgets are untouched — the API still treats an
            // unset flag as "allowed".
            setAllowSubBudgetRequests(false);
            setAutoApproveEnabled(false);
            setAutoApproveQuota(defaultQuota(resources));
            setTerminationDate(null);
        }
    }, [opened, node?.id, parent?.id]);

    const validate = () => {
        const next = validateQuota(resources, quota, { allowUnlimited: true });
        if (!name || name.trim().length < 3) next.name = 'Please give the budget a name (at least 3 characters)';
        if (!isEdit && (!reason || reason.trim().length < 5)) next.reason = 'Please describe what this budget is for (at least 5 characters)';
        if (isRequest && !parentId) next.parentId = 'Please choose the budget to request from';
        if (!adminScope.length) next.adminScope = 'Name at least one person or group — a budget nobody manages appears in nobody\'s "My Budgets", and requests under it land with the budget above instead';
        if (autoApproveEnabled) {
            Object.entries(validateQuota(resources, autoApproveQuota)).forEach(([k, v]) => { next[`auto_${k}`] = v; });
        }
        setErrors(next);
        return Object.keys(next).length === 0;
    };

    // Which tab to flag: a field the user cannot see must not fail silently.
    const tabHasError = (tab) => {
        if (tab === TAB_DETAILS) return ['name', 'reason', 'parentId'].some(k => errors[k]);
        if (tab === TAB_RESOURCES) return (resources || []).some(r => errors[r.id]);
        if (tab === TAB_ACCESS) return !!errors.adminScope || Object.keys(errors).some(k => k.startsWith('auto_'));
        return false;
    };

    const buildEditBody = () => {
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
        if (autoApproveEnabled) {
            const prev = JSON.stringify(node.auto_approve?.per_requester_limit || {});
            if (!node.auto_approve || prev !== JSON.stringify(autoApproveQuota)) {
                body.auto_approve = { per_requester_limit: autoApproveQuota };
            }
        } else if (node.auto_approve) {
            body.clear_auto_approve = true;
        }
        const limitChanged = (resources || []).some(r => (quota[r.id] ?? 0) !== (node.limit?.[r.id] ?? 0));
        if (limitChanged) body.limit = quota;
        const prevDate = node.termination_date ? new Date(node.termination_date).getTime() : null;
        const nextDate = terminationDate ? terminationDate.getTime() : null;
        if (prevDate !== nextDate && nextDate) body.termination_date = terminationDate.toISOString();
        return body;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validate()) return;
        setSubmitting(true);
        setSubmitError(null);
        try {
            let result;
            if (isEdit) {
                const body = buildEditBody();
                result = Object.keys(body).length ? await api.updateNode(node.id, body) : node;
            } else {
                result = await api.createNode({
                    parent_id: parentId,
                    kind: 'budget',
                    name,
                    reason,
                    limit: quota,
                    admin_scope: adminScope,
                    eligible_requesters: eligibleRequesters,
                    allow_sub_budget_requests: allowSubBudgetRequests,
                    auto_approve: autoApproveEnabled ? { per_requester_limit: autoApproveQuota } : null,
                    termination_date: terminationDate ? terminationDate.toISOString() : null,
                });
            }
            onDone?.(result);
            onClose();
        } catch (err) {
            setSubmitError(formatError(err));
        } finally {
            setSubmitting(false);
        }
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
                    value={parentId}
                    onChange={(v) => { setParentId(v); clear('parentId'); }}
                    error={errors.parentId}
                />
            )}

            <TextInput
                label="Name"
                description="A short, recognizable name, e.g. “CS Department” or “AI Lab WS26”."
                required
                value={name}
                onChange={e => { setName(e.target.value); clear('name'); }}
                error={errors.name}
            />

            {!isEdit && (
                <Textarea
                    label="Purpose"
                    description="What is this budget for?"
                    required
                    rows={2}
                    value={reason}
                    onChange={e => { setReason(e.target.value); clear('reason'); }}
                    error={errors.reason}
                />
            )}

            <TerminationDatePicker
                label="Valid until (optional)"
                value={terminationDate}
                onChange={setTerminationDate}
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
                resources={resources}
                value={quota}
                errors={errors}
                allowUnlimited
                onChange={(id, v) => { setQuota(q => ({ ...q, [id]: v })); clear(id); }}
            />
        </div>
    );

    // Managing, requesting and auto-approval belong together: they answer "who
    // may take from this budget, and how much goes through without me".
    const accessTab = (
        <Stack>
            <TokenListEditor
                label="Managed by"
                description="These people or groups approve requests under this budget and can delegate further. This is how you hand resources to someone."
                tokens={adminScope}
                onChange={(t) => { setAdminScope(t); clear('adminScope'); }}
                error={errors.adminScope}
            />

            <TokenListEditor
                label="Who can request here"
                description="These people or groups may submit project or budget requests under this budget. Leave empty to disable requests."
                tokens={eligibleRequesters}
                onChange={setEligibleRequesters}
            />

            <Checkbox
                label="Allow sub-budget requests"
                description="Requesters may ask for a sub-budget of their own here, not just for projects. Turn this off for a course budget that should only ever hold projects. Managers can always create sub-budgets directly."
                checked={allowSubBudgetRequests}
                onChange={e => setAllowSubBudgetRequests(e.currentTarget.checked)}
            />

            <Stack gap="xs">
                <Checkbox
                    label="Enable self-service (auto-approval)"
                    description="Small requests are approved instantly without a manager, as long as the person stays under the per-person limit and the budget has capacity."
                    checked={autoApproveEnabled}
                    onChange={e => { setAutoApproveEnabled(e.currentTarget.checked); clearPrefixed('auto_'); }}
                />
                {/* Indented under the checkbox, and shown disabled rather than
                    hidden while self-service is off: the per-person limit is what
                    the checkbox actually does, so it must read as belonging to it
                    instead of looking like a second, unrelated resource block. */}
                <Box
                    pl="xl"
                    ml="xs"
                    style={{
                        borderLeft: '2px solid var(--mantine-color-default-border)',
                        // Mantine only greys the inputs themselves; the labels,
                        // ranges and the bracket line would stay fully black and
                        // make the block read as active. Fading the whole group
                        // is what makes "off" obvious at a glance.
                        opacity: autoApproveEnabled ? 1 : 0.45,
                        transition: 'opacity 150ms ease',
                    }}
                >
                    <Text size="xs" c="dimmed" mb="xs">
                        Per-person limit — how much one requester may take without approval.
                    </Text>
                    <QuotaInputs
                        resources={resources}
                        value={autoApproveQuota}
                        disabled={!autoApproveEnabled}
                        errors={Object.fromEntries(Object.entries(errors)
                            .filter(([k]) => k.startsWith('auto_'))
                            .map(([k, v]) => [k.slice(5), v]))}
                        onChange={(id, v) => { setAutoApproveQuota(q => ({ ...q, [id]: v })); clear(`auto_${id}`); }}
                    />
                </Box>
            </Stack>
        </Stack>
    );

    return (
        <FormModal
            opened={opened}
            onClose={onClose}
            title={title}
            onSubmit={handleSubmit}
            submitting={submitting}
            submitError={submitError}
            submitLabel={isEdit ? 'Save changes' : isRequest ? 'Submit request' : 'Create budget'}
        >
            <FormTabs
                value={activeTab}
                onChange={setActiveTab}
                tabs={[
                    { value: TAB_DETAILS, label: 'Details', hasError: tabHasError(TAB_DETAILS), content: detailsTab },
                    { value: TAB_RESOURCES, label: 'Resources', hasError: tabHasError(TAB_RESOURCES), content: resourcesTab },
                    { value: TAB_ACCESS, label: 'Access', hasError: tabHasError(TAB_ACCESS), content: accessTab },
                ]}
            />
        </FormModal>
    );
}
