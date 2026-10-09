import { useState } from 'react';
import { ActionIcon, Group, Paper, Stack, Text, Tooltip } from '@mantine/core';
import { Users, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { useApiMutation } from '/helper/query-state.jsx';
import { formatError } from '/helper/api-error.js';
import { useConfirm } from '/providers/confirm.jsx';

// ExternalGroups lists the groups a project was given in OpenStack rather than
// here — kept by the reconciler as long as the project names them, so this is
// where that access ends. `removable` offers the ×; it acts at once, not with
// the dialog's save, since it only takes access away. Nothing is shown for a
// project without such groups.
export function ExternalGroups({ node, removable = false }) {
    const { t } = useTranslation();
    const api = useNodesApi();
    const confirm = useConfirm();
    // The dialog's node is not refreshed while it is open; what the removal
    // returns is the current list.
    const [groups, setGroups] = useState(node?.external_group_assignments || []);

    const remove = useApiMutation({
        mutationFn: (groupId) => api.removeExternalGroup(node.id, groupId),
        invalidates: [projectKeys.tree()],
        reportErrors: 'inline',
        onSuccess: (result) => setGroups(result?.external_group_assignments || []),
    });

    if (groups.length === 0) return null;

    const ask = async (g) => {
        const ok = await confirm({
            title: t('projects.externalGroups.removeTitle', { name: g.group_name || g.group_id }),
            confirmLabel: t('projects.externalGroups.remove'),
            message: t('projects.externalGroups.removeMessage'),
        });
        if (ok) remove.mutate(g.group_id);
    };

    return (
        <Paper withBorder radius="md" p="md">
            <Stack gap={6}>
                <Text size="sm" fw={500}>{t('projects.externalGroups.title')}</Text>
                <Text size="xs" c="dimmed">{t('projects.externalGroups.hint')}</Text>
                {groups.map(g => (
                    <Group key={g.group_id} gap="xs" wrap="nowrap" justify="space-between">
                        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                            <Users size="14" style={{ flexShrink: 0, color: 'var(--mantine-color-gray-6)' }} />
                            <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
                                {g.group_name || <Text span size="sm" ff="monospace">{g.group_id}</Text>}
                            </Text>
                            <Text size="xs" c="dimmed">{g.role}</Text>
                        </Group>
                        {removable && (
                            <Tooltip label={t('projects.externalGroups.remove')}>
                                <ActionIcon variant="subtle" color="red" size="sm" loading={remove.isPending && remove.variables === g.group_id}
                                    aria-label={t('projects.externalGroups.remove')} onClick={() => ask(g)}>
                                    <X size="14" />
                                </ActionIcon>
                            </Tooltip>
                        )}
                    </Group>
                ))}
                {remove.error && <Text size="xs" c="red">{formatError(remove.error)}</Text>}
            </Stack>
        </Paper>
    );
}
