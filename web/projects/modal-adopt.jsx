import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Group, Modal, Select, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useNodesApi } from './api-nodes.jsx';
import { TerminationDatePicker } from './component-common.jsx';
import { QuotaInputs, validateQuota } from './component-quota-inputs.jsx';
import { COLOR, formatError, nodeTitle } from './util-project.jsx';

// AdoptModal brings an imported OpenStack project under management: pick the
// responsible owner and the budget that will fund it. On the next
// synchronization run the project enters the normal approval flow.
export function AdoptModal({ opened, onClose, onDone, resources, node, myBudgets = [] }) {
    const api = useNodesApi();
    const [ownerEmail, setOwnerEmail] = useState('');
    const [targetId, setTargetId] = useState(null);
    const [ownerBudgets, setOwnerBudgets] = useState([]);
    const [reason, setReason] = useState('');
    const [quota, setQuota] = useState({});
    const [terminationDate, setTerminationDate] = useState(new Date(Date.now() + 180 * 24 * 60 * 60 * 1000));
    const [errors, setErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState(null);

    useEffect(() => {
        if (!opened || !node) return;
        // Best guess for the owner: the first personal account among the
        // project's current OpenStack members.
        const firstUser = (node.authorized_users || []).find(u => u.token?.startsWith('user:'));
        setOwnerEmail(firstUser ? firstUser.token.slice(5) : '');
        setTargetId(null);
        setReason(node.os_project_name ? `Adopted OpenStack project “${node.os_project_name}”` : '');
        setQuota({ ...(node.limit || {}) });
        setErrors({});
        setSubmitError(null);
    }, [opened, node?.id]);

    // Budgets the chosen owner could also request under (root-only endpoint;
    // failures are fine — the admin's own budgets remain available).
    useEffect(() => {
        const email = ownerEmail.trim();
        if (!opened || !email.includes('@')) { setOwnerBudgets([]); return; }
        let cancelled = false;
        api.listEligibleForOwner([`user:${email}`])
            .then(list => { if (!cancelled) setOwnerBudgets(list); })
            .catch(() => { if (!cancelled) setOwnerBudgets([]); });
        return () => { cancelled = true; };
    }, [opened, ownerEmail]);

    const targetData = useMemo(() => {
        const mine = (myBudgets || []).map(b => ({ value: b.id, label: b.name || b.id }));
        const mineIds = new Set(mine.map(m => m.value));
        const owners = ownerBudgets.filter(b => !mineIds.has(b.id)).map(b => ({ value: b.id, label: b.name || b.id }));
        const groups = [];
        if (mine.length) groups.push({ group: 'Budgets you manage', items: mine });
        if (owners.length) groups.push({ group: 'Budgets the owner can request under', items: owners });
        return groups;
    }, [myBudgets, ownerBudgets]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const next = validateQuota(resources, quota);
        if (!ownerEmail.trim().includes('@')) next.owner = 'Please enter the owner’s email address';
        if (!targetId) next.target = 'Please choose the funding budget';
        if (!reason || reason.trim().length < 5) next.reason = 'Please describe the purpose (at least 5 characters)';
        setErrors(next);
        if (Object.keys(next).length) return;

        setSubmitting(true);
        setSubmitError(null);
        try {
            const result = await api.adopt(node.id, {
                new_parent_id: targetId,
                owner: ownerEmail.trim(),
                reason,
                limit: quota,
                termination_date: terminationDate ? terminationDate.toISOString() : null,
                authorized_users: node.authorized_users || [],
            });
            onDone?.(result);
            onClose();
        } catch (err) {
            setSubmitError(formatError(err));
        } finally {
            setSubmitting(false);
        }
    };

    if (!node) return null;

    return (
        <Modal opened={opened} onClose={onClose} size="lg" title={`Adopt project: ${nodeTitle(node)}`}>
            <form onSubmit={handleSubmit}>
                <Stack>
                    <Alert color={COLOR.outside} variant="light" p="xs">
                        This OpenStack project ({node.os_project_id || 'unknown ID'}) is not managed
                        here yet. Adopting places it under a budget; the next synchronization run
                        then sends it through the normal approval flow. Its current members are kept.
                    </Alert>

                    <TextInput
                        label="Owner"
                        description="The person who will be responsible for this project."
                        placeholder="someone@dhbw.de"
                        required
                        value={ownerEmail}
                        onChange={e => { setOwnerEmail(e.target.value); setErrors(er => ({ ...er, owner: null })); }}
                        error={errors.owner}
                    />

                    <Select
                        label="Fund from budget"
                        required
                        searchable
                        data={targetData}
                        value={targetId}
                        onChange={(v) => { setTargetId(v); setErrors(er => ({ ...er, target: null })); }}
                        error={errors.target}
                        placeholder="Choose the budget that provides the resources"
                    />

                    <Textarea
                        label="Purpose"
                        required
                        rows={2}
                        value={reason}
                        onChange={e => { setReason(e.target.value); setErrors(er => ({ ...er, reason: null })); }}
                        error={errors.reason}
                    />

                    <div>
                        <Text fw={600} size="sm" mb="xs">Granted resources</Text>
                        <QuotaInputs
                            resources={resources}
                            value={quota}
                            errors={errors}
                            onChange={(id, v) => { setQuota(q => ({ ...q, [id]: v })); setErrors(er => ({ ...er, [id]: null })); }}
                        />
                    </div>

                    <TerminationDatePicker
                        value={terminationDate}
                        onChange={setTerminationDate}
                    />

                    {(node.external_group_assignments || []).length > 0 && (
                        <Alert color="gray" variant="light" p="xs">
                            This project has OpenStack groups assigned outside this system;
                            they are preserved automatically.
                        </Alert>
                    )}

                    {submitError && <Text c="red" size="sm">{submitError}</Text>}

                    <Group justify="flex-end" mt="md">
                        <Button variant="default" type="button" onClick={onClose}>Cancel</Button>
                        <Button type="submit" color={COLOR.outside} loading={submitting}>Adopt</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
}
