import { Select, Text } from '@mantine/core';
import { useForm, isNotEmpty } from '@mantine/form';
import { useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { FormModal } from './component-form-modal.jsx';
import { useApiMutation } from '/helper/query-state.jsx';
import { formatError } from '/helper/api-error.js';
import { isBudget, nodeTitle } from './util-project.jsx';

// MoveModal reparents a node under another budget. The server checks that the
// mover manages BOTH sides and that the target has capacity.
export function MoveModal({ opened, onClose, onDone, node, targetBudgets }) {
    const api = useNodesApi();

    // The node itself and its current parent are not meaningful targets.
    const targets = (targetBudgets || []).filter(b => b.id !== node?.id && b.id !== node?.parent_id);

    const form = useForm({
        initialValues: { targetId: null },
        validate: { targetId: isNotEmpty('Please choose the destination budget') },
    });

    const move = useApiMutation({
        mutationFn: ({ targetId }) => api.move(node.id, targetId),
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
            size="md"
            title={`Move: ${nodeTitle(node)}`}
            onSubmit={form.onSubmit(values => move.mutate(values))}
            submitting={move.isPending}
            submitError={move.error && formatError(move.error)}
            submitLabel="Move"
        >
            <Text size="sm" c="dimmed">
                The {isBudget(node) ? 'budget (including everything under it)' : 'project'} will
                be funded by the destination budget from then on. You must manage both the
                current and the new location, and the destination needs enough free capacity.
            </Text>

            <Select
                label="Move to"
                required
                searchable
                data={targets.map(b => ({ value: b.id, label: b.name || b.id }))}
                placeholder="Choose the destination budget"
                {...form.getInputProps('targetId')}
            />
        </FormModal>
    );
}
