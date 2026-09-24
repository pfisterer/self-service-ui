import { Text, TextInput } from '@mantine/core';
import { Trans, useTranslation } from 'react-i18next';
import { useForm, isEmail } from '@mantine/form';
import { useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { FormModal } from './component-form-modal.jsx';
import { useApiMutation } from '/helper/query-state.jsx';
import { formatError } from '/helper/api-error.js';
import { nodeTitle, ownerEmail } from './util-project.jsx';

// TransferOwnerModal hands a project to a new responsible person.
export function TransferOwnerModal({ opened, onClose, onDone, node }) {
    const { t } = useTranslation();
    const api = useNodesApi();

    const form = useForm({
        initialValues: { email: '' },
        transformValues: (values) => ({ email: values.email.trim() }),
        validate: { email: isEmail(t('projects.transferOwner.newOwnerRequired')) },
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
            title={t('projects.transferOwner.title', { name: nodeTitle(node) })}
            onSubmit={form.onSubmit(values => transfer.mutate(values))}
            submitting={transfer.isPending}
            submitError={transfer.error && formatError(transfer.error)}
            submitLabel={t('projects.transferOwner.submit')}
        >
            <Text size="sm" c="dimmed">
                {t('projects.transferOwner.explain')}{' '}
                <Trans i18nKey="projects.transferOwner.currentOwner"
                    values={{ email: ownerEmail(node) || '—' }} components={{ 1: <b /> }} />
            </Text>

            <TextInput
                label={t('projects.transferOwner.newOwner')}
                description={t('projects.transferOwner.newOwnerHint')}
                placeholder={t('projects.transferOwner.newOwnerPlaceholder')}
                required
                {...form.getInputProps('email')}
            />
        </FormModal>
    );
}
