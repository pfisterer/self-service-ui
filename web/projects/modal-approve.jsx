import { useEffect, useMemo, useState } from 'react';
import { Alert, Anchor, Button, Checkbox, Group, Loader, Modal, Stack, Text } from '@mantine/core';
import { useNodesApi } from './api-nodes.jsx';
import { NodeUsageBars, QuotaBadges } from './component-common.jsx';
import { QuotaInputs, validateQuota } from './component-quota-inputs.jsx';
import { COLOR, formatError, isBudget, nodeTitle, ownerEmail } from './util-project.jsx';

// ApproveModal confirms granting a pending request or a pending change.
// The manager sees the impact on the funding budget before deciding and may
// grant an adjusted amount instead of the requested one.
export function ApproveModal({ opened, onClose, onDone, resources, node }) {
    const api = useNodesApi();
    const [parent, setParent] = useState(null);
    const [adjust, setAdjust] = useState(false);
    const [quota, setQuota] = useState({});
    const [errors, setErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState(null);

    const isChange = node?.status === 'change_pending';
    // What the requester asked for: the proposed limit for changes, the
    // requested limit for new nodes.
    const requested = isChange ? (node?.pending?.limit || node?.limit) : node?.limit;

    useEffect(() => {
        if (!opened || !node) return;
        setAdjust(false);
        setQuota({ ...requested });
        setErrors({});
        setSubmitError(null);
        setParent(null);
        // Load the funding budget (with usage) for the impact preview; managers
        // of the request can always read its parent. Failure is non-fatal.
        api.getNode(node.parent_id).then(setParent).catch(() => setParent(null));
    }, [opened, node?.id]);

    // Net NEW usage this approval adds to the budget: for changes only the
    // increase counts (the current allocation is already included in the bars).
    const incoming = useMemo(() => {
        if (!node) return null;
        const granted = adjust ? quota : requested;
        if (!isChange) return granted;
        return Object.fromEntries((resources || []).map(r => [
            r.id, Math.max(0, (granted?.[r.id] ?? 0) - (node.limit?.[r.id] ?? 0)),
        ]));
    }, [node, adjust, quota, requested, resources]);

    const handleSubmit = async () => {
        if (adjust) {
            const next = validateQuota(resources, quota);
            setErrors(next);
            if (Object.keys(next).length) return;
        }
        setSubmitting(true);
        setSubmitError(null);
        try {
            const changed = adjust && (resources || []).some(r => (quota[r.id] ?? 0) !== (requested?.[r.id] ?? 0));
            const result = await api.approve(node.id, changed ? quota : null);
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
        <Modal opened={opened} onClose={onClose} size="lg"
            title={isChange ? `Approve change: ${nodeTitle(node)}` : `Approve: ${nodeTitle(node)}`}>
            <Stack>
                <Stack gap="4">
                    {/* The owner for a leaf; a budget has none, so fall back to
                        whoever filed the request. */}
                    {(ownerEmail(node) || node.created_by) && (
                        <Text size="sm">
                            <b>Requested by:</b>{' '}
                            <Anchor href={`mailto:${ownerEmail(node) || node.created_by}`} size="sm">
                                {ownerEmail(node) || node.created_by}
                            </Anchor>
                        </Text>
                    )}
                    {node.reason && <Text size="sm"><b>Purpose:</b> {node.reason}</Text>}
                    {isBudget(node) && (
                        <Alert color={COLOR.info} variant="light" p="xs">
                            This approves a <b>budget</b>: its managers can then approve requests and
                            delegate further within the granted cap.
                        </Alert>
                    )}
                </Stack>

                <div>
                    <Text size="sm" fw={600} mb="xs">Requested amount</Text>
                    <QuotaBadges resources={resources} quota={requested} />
                </div>

                <Checkbox
                    label="Grant a different amount"
                    description="Approve with an adjusted allocation instead of what was requested."
                    checked={adjust}
                    onChange={e => setAdjust(e.currentTarget.checked)}
                />
                {adjust && (
                    <QuotaInputs
                        resources={resources}
                        value={quota}
                        errors={errors}
                        onChange={(id, v) => { setQuota(q => ({ ...q, [id]: v })); setErrors(er => ({ ...er, [id]: null })); }}
                    />
                )}

                {/* Impact preview on the funding budget. */}
                {parent === null
                    ? <Loader size="xs" />
                    : (
                        <div>
                            <Text size="sm" fw={600} mb="xs">
                                Impact on budget “{parent.name || parent.id}”
                            </Text>
                            <NodeUsageBars resources={resources} node={parent} incomingQuota={incoming} />
                        </div>
                    )}

                {submitError && <Text c="red" size="sm">{submitError}</Text>}

                <Group justify="flex-end" mt="md">
                    <Button variant="default" onClick={onClose}>Cancel</Button>
                    <Button color={COLOR.positive} loading={submitting} onClick={handleSubmit}>Approve</Button>
                </Group>
            </Stack>
        </Modal>
    );
}
