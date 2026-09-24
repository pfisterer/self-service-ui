import { Alert, Paper, Stack, Text, Textarea } from '@mantine/core';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation();
    const api = useNodesApi();
    const isChange = node?.status === 'change_pending';

    const form = useForm({
        initialValues: { reason: '' },
        validate: {
            reason: (value) => (value.trim().length < 5
                ? t('projects.reject.reasonRequired')
                : null),
        },
    });

    const reject = useApiMutation({
        mutationFn: ({ reason }) => api.reject(node.id, reason),
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
            title={t(isChange ? 'projects.reject.titleChange' : 'projects.reject.title')}
            onSubmit={form.onSubmit(values => reject.mutate(values))}
            submitting={reject.isPending}
            submitError={reject.error && formatError(reject.error)}
            submitLabel={isChange ? t('projects.reject.submitChange') : t('projects.actions.reject')}
            submitColor={COLOR.negative}
        >
            <Paper p="md" withBorder>
                <Stack gap="xs">
                    <Text size="sm" fw={600}>{nodeTitle(node)}</Text>
                    {ownerEmail(node) && (
                        <Text size="sm" c="dimmed">{t('projects.reject.requestedBy', { email: ownerEmail(node) })}</Text>
                    )}
                </Stack>
            </Paper>

            {isChange && (
                <Alert color={COLOR.info} variant="light" p="xs">
                    {t('projects.reject.changeNote')}
                </Alert>
            )}

            <Textarea
                label={t('projects.reject.reason')}
                required
                placeholder={t('projects.reject.reasonPlaceholder')}
                rows={3}
                {...form.getInputProps('reason')}
            />
        </FormModal>
    );
}
