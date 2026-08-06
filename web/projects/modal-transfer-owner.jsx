import { Text, TextInput } from '@mantine/core';
import { useForm, isEmail } from '@mantine/form';
import { useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { FormModal } from './component-form-modal.jsx';
import { useApiMutation } from '/helper/query-state.jsx';
import { formatError } from '/helper/api-error.js';
import { nodeTitle, ownerEmail } from './util-project.jsx';

// TransferOwnerModal hands a project to a new responsible person.
export function TransferOwnerModal({ opened, onClose, onDone, node }) {
    const api = useNodesApi();

    const form = useForm({
        initialValues: { email: '' },
        transformValues: (values) => ({ email: values.email.trim() }),
        validate: { email: isEmail('Please enter the new owner’s email address') },
    });

    const transfer = useApiMutation({
        mutationFn: ({ email }) => api.transferOwner(node.id, email),
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
            title={`Transfer ownership: ${nodeTitle(node)}`}
            onSubmit={form.onSubmit(values => transfer.mutate(values))}
            submitting={transfer.isPending}
            submitError={transfer.error && formatError(transfer.error)}
            submitLabel="Transfer"
        >
            <Text size="sm" c="dimmed">
                The owner is the person responsible for a project — they can edit it,
                request changes and release it. Current owner: <b>{ownerEmail(node) || '—'}</b>
            </Text>

            <TextInput
                label="New owner"
                description="Email address of the person taking over."
                placeholder="someone@dhbw.de"
                required
                {...form.getInputProps('email')}
            />
        </FormModal>
    );
}
