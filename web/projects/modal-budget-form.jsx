import { useEffect, useState } from 'react';
import { Button, Checkbox, Group, Modal, Select, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useNodesApi } from './api-nodes.jsx';
import { TerminationDatePicker } from './component-common.jsx';
import { defaultQuota, QuotaInputs, validateQuota } from './component-quota-inputs.jsx';
import { TokenListEditor } from './component-token-list-editor.jsx';
import { formatError } from './util-project.jsx';

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

    const [parentId, setParentId] = useState(null);
    const [name, setName] = useState('');
    const [reason, setReason] = useState('');
    const [quota, setQuota] = useState({});
    const [adminScope, setAdminScope] = useState([]);
    const [eligibleRequesters, setEligibleRequesters] = useState([]);
    const [autoApproveEnabled, setAutoApproveEnabled] = useState(false);
    const [autoApproveQuota, setAutoApproveQuota] = useState({});
    const [terminationDate, setTerminationDate] = useState(null);
    const [errors, setErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState(null);

    useEffect(() => {
        if (!opened) return;
        setErrors({});
        setSubmitError(null);
        if (isEdit && node) {
            setName(node.name || '');
            setReason(node.reason || '');
            setQuota({ ...node.limit });
            setAdminScope(node.admin_scope || []);
            setEligibleRequesters(node.eligible_requesters || []);
            setAutoApproveEnabled(!!node.auto_approve);
            setAutoApproveQuota({ ...(node.auto_approve?.per_requester_limit || defaultQuota(resources)) });
            setTerminationDate(node.termination_date ? new Date(node.termination_date) : null);
        } else {
            setParentId(parent?.id ?? eligibleBudgets[0]?.id ?? null);
            setName('');
            setReason('');
            setQuota(defaultQuota(resources));
            // A requester manages the budget they ask for; a delegating manager
            // names the people they delegate to.
            setAdminScope(isRequest && currentUserEmail ? [`user:${currentUserEmail}`] : []);
            setEligibleRequesters([]);
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
        if (autoApproveEnabled) {
            Object.entries(validateQuota(resources, autoApproveQuota)).forEach(([k, v]) => { next[`auto_${k}`] = v; });
        }
        setErrors(next);
        return Object.keys(next).length === 0;
    };

    const buildEditBody = () => {
        // Diff against the current node: only send what changed (see note above).
        const body = {};
        if (name !== (node.name || '')) body.name = name;
        const scopeChanged = JSON.stringify(adminScope) !== JSON.stringify(node.admin_scope || []);
        if (scopeChanged) body.admin_scope = adminScope;
        const eligibleChanged = JSON.stringify(eligibleRequesters) !== JSON.stringify(node.eligible_requesters || []);
        if (eligibleChanged) body.eligible_requesters = eligibleRequesters;
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

    return (
        <Modal opened={opened} onClose={onClose} size="lg" title={title}>
            <form onSubmit={handleSubmit}>
                <Stack>
                    {isRequest && (
                        <Select
                            label="Request from"
                            description="The budget that will provide the resources — its managers approve your request."
                            required
                            searchable
                            data={eligibleBudgets.map(b => ({ value: b.id, label: b.name || b.id }))}
                            value={parentId}
                            onChange={(v) => { setParentId(v); setErrors(er => ({ ...er, parentId: null })); }}
                            error={errors.parentId}
                        />
                    )}

                    <TextInput
                        label="Name"
                        description="A short, recognizable name, e.g. “CS Department” or “AI Lab WS26”."
                        required
                        value={name}
                        onChange={e => { setName(e.target.value); setErrors(er => ({ ...er, name: null })); }}
                        error={errors.name}
                    />

                    {!isEdit && (
                        <Textarea
                            label="Purpose"
                            description="What is this budget for?"
                            required
                            rows={2}
                            value={reason}
                            onChange={e => { setReason(e.target.value); setErrors(er => ({ ...er, reason: null })); }}
                            error={errors.reason}
                        />
                    )}

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
                            onChange={(id, v) => { setQuota(q => ({ ...q, [id]: v })); setErrors(er => ({ ...er, [id]: null })); }}
                        />
                    </div>

                    <TokenListEditor
                        label="Managed by"
                        description="These people or groups approve requests under this budget and can delegate further. This is how you hand resources to someone."
                        tokens={adminScope}
                        onChange={setAdminScope}
                    />

                    <TokenListEditor
                        label="Who can request here"
                        description="These people or groups may submit project or budget requests under this budget. Leave empty to disable requests."
                        tokens={eligibleRequesters}
                        onChange={setEligibleRequesters}
                    />

                    <Stack gap="xs">
                        <Checkbox
                            label="Enable self-service (auto-approval)"
                            description="Small requests are approved instantly without a manager, as long as the person stays under the per-person limit and the budget has capacity."
                            checked={autoApproveEnabled}
                            onChange={e => setAutoApproveEnabled(e.currentTarget.checked)}
                        />
                        {autoApproveEnabled && (
                            <QuotaInputs
                                resources={resources}
                                value={autoApproveQuota}
                                errors={Object.fromEntries(Object.entries(errors)
                                    .filter(([k]) => k.startsWith('auto_'))
                                    .map(([k, v]) => [k.slice(5), v]))}
                                onChange={(id, v) => { setAutoApproveQuota(q => ({ ...q, [id]: v })); setErrors(er => ({ ...er, [`auto_${id}`]: null })); }}
                            />
                        )}
                    </Stack>

                    <TerminationDatePicker
                        label="Valid until (optional)"
                        value={terminationDate}
                        onChange={setTerminationDate}
                    />

                    {submitError && <Text c="red" size="sm">{submitError}</Text>}

                    <Group justify="flex-end" mt="md">
                        <Button variant="default" type="button" onClick={onClose}>Cancel</Button>
                        <Button type="submit" loading={submitting}>
                            {isEdit ? 'Save changes' : isRequest ? 'Submit request' : 'Create budget'}
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
}
