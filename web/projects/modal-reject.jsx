import { Alert, Paper, Stack, Text, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { FormModal } from './component-form-modal.jsx';
import { useApiMutation } from '/helper/query-state.jsx';
import { formatError } from '/helper/api-error.js';
import { COLOR, nodeTitle, ownerEmail } from './util-project.jsx';

// RejectModal declines a pending request or discards a pending change.
// Rejecting a CHANGE does not harm the project — it simply stays as it was.
export function RejectModal({ opened, onClose, onDone, node }) {
    const api = useNodesApi();
    const isChange = node?.status === 'change_pending';

    const form = useForm({
        initialValues: { reason: '' },
        validate: {
            reason: (value) => (value.trim().length < 5
                ? 'Please give a reason (at least 5 characters) — the requester will see it.'
                : null),
        },
    });

    const reject = useApiMutation({
        mutationFn: ({ reason }) => api.reject(node.id, reason),
        invalidates: [projectKeys.tree()],
        reportErrors: 'inline',
        onSuccess: (result) => { onDone?.(result); onClose(); },
    });

    if (!node) return null;

    return (
        <FormModal
            opened={opened}
            onClose={onClose}
            size="md"
            title={isChange ? 'Decline change request' : 'Reject request'}
            onSubmit={form.onSubmit(values => reject.mutate(values))}
            submitting={reject.isPending}
            submitError={reject.error && formatError(reject.error)}
            submitLabel={isChange ? 'Decline change' : 'Reject'}
            submitColor={COLOR.negative}
        >
            <Paper p="md" withBorder>
                <Stack gap="xs">
                    <Text size="sm" fw={600}>{nodeTitle(node)}</Text>
                    {ownerEmail(node) && <Text size="sm" c="dimmed">Requested by: {ownerEmail(node)}</Text>}
                </Stack>
            </Paper>

            {isChange && (
                <Alert color={COLOR.info} variant="light" p="xs">
                    Only the proposed change is discarded — the project keeps running
                    with its current resources.
                </Alert>
            )}

            <Textarea
                label="Reason"
                required
                placeholder="Explain the decision…"
                rows={3}
                {...form.getInputProps('reason')}
            />
        </FormModal>
    );
}
