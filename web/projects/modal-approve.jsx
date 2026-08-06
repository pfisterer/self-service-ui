import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Anchor, Checkbox, Loader, Stack, Text } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { FormModal } from './component-form-modal.jsx';
import { NodeUsageBars, QuotaBadges } from './component-common.jsx';
import { QuotaInputs, validateQuota } from './component-quota-inputs.jsx';
import { useApiMutation } from '/helper/query-state.jsx';
import { formatError } from '/helper/api-error.js';
import { COLOR, isBudget, nodeTitle, ownerEmail } from './util-project.jsx';

// ApproveModal confirms granting a pending request or a pending change.
// The manager sees the impact on the funding budget before deciding and may
// grant an adjusted amount instead of the requested one.
export function ApproveModal({ opened, onClose, onDone, resources, node }) {
    const api = useNodesApi();

    const isChange = node?.status === 'change_pending';
    // What the requester asked for: the proposed limit for changes, the
    // requested limit for new nodes.
    const requested = isChange ? (node?.pending?.limit || node?.limit) : node?.limit;

    // The dialog is remounted per node (see useNodeDialog's `key`), so the
    // requested amount is a correct starting value and needs no reset effect.
    const form = useForm({
        initialValues: { adjust: false, quota: { ...requested } },
        validate: (values) => (values.adjust
            ? Object.fromEntries(
                Object.entries(validateQuota(resources, values.quota)).map(([id, msg]) => [`quota.${id}`, msg]))
            : {}),
    });

    // The funding budget, for the impact preview. Managers of a request can
    // always read its parent; a failure here is not fatal, the preview is just
    // left out.
    const parentQuery = useQuery({
        queryKey: projectKeys.node(node?.parent_id),
        queryFn: () => api.getNode(node.parent_id),
        enabled: !!api && !!node?.parent_id && opened,
        retry: false,
    });
    const parent = parentQuery.data;

    // Net NEW usage this approval adds to the budget: for changes only the
    // increase counts (the current allocation is already included in the bars).
    const { adjust, quota } = form.values;
    const incoming = useMemo(() => {
        if (!node) return null;
        const granted = adjust ? quota : requested;
        if (!isChange) return granted;
        return Object.fromEntries((resources || []).map(r => [
            r.id, Math.max(0, (granted?.[r.id] ?? 0) - (node.limit?.[r.id] ?? 0)),
        ]));
    }, [node, isChange, adjust, quota, requested, resources]);

    const approve = useApiMutation({
        mutationFn: (values) => {
            // Only send a modified limit when it actually differs from what was
            // asked for; otherwise this is a plain approval.
            const changed = values.adjust
                && (resources || []).some(r => (values.quota[r.id] ?? 0) !== (requested?.[r.id] ?? 0));
            return api.approve(node.id, changed ? values.quota : null);
        },
        invalidates: [projectKeys.tree()],
        reportErrors: 'inline',
        onSuccess: (result) => { onDone?.(result); onClose(); },
        // A 409 means this dialog was acting on a node that has moved on; there
        // is nothing here to correct, so close it and let the refreshed view speak.
        onConflict: () => { onDone?.(); onClose(); },
    });

    if (!node) return null;

    return (
        <FormModal
            opened={opened}
            onClose={onClose}
            size="lg"
            title={isChange ? `Approve change: ${nodeTitle(node)}` : `Approve: ${nodeTitle(node)}`}
            onSubmit={form.onSubmit(values => approve.mutate(values))}
            submitting={approve.isPending}
            submitError={approve.error && formatError(approve.error)}
            submitLabel="Approve"
            submitColor={COLOR.positive}
        >
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
                {...form.getInputProps('adjust', { type: 'checkbox' })}
            />
            {adjust && (
                <QuotaInputs
                    resources={resources}
                    value={quota}
                    errors={Object.fromEntries((resources || []).map(r => [r.id, form.errors[`quota.${r.id}`]]))}
                    onChange={(id, v) => {
                        form.setFieldValue(`quota.${id}`, v);
                        form.clearFieldError(`quota.${id}`);
                    }}
                />
            )}

            {/* Impact preview on the funding budget. */}
            {parentQuery.isPending
                ? <Loader size="xs" />
                : parent && (
                    <div>
                        <Text size="sm" fw={600} mb="xs">
                            Impact on budget “{parent.name || parent.id}”
                        </Text>
                        <NodeUsageBars resources={resources} node={parent} incomingQuota={incoming} />
                    </div>
                )}
        </FormModal>
    );
}
