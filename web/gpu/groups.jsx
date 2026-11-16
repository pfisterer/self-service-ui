import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionIcon, Alert, Button, Code, Group, MultiSelect, NumberInput, Paper, Stack, Switch, Text, TextInput, Tooltip } from '@mantine/core';
import { Plus, Trash2, Users } from 'lucide-react';
import { MAX_GROUPS, distribute, groupNameError, memberChoices, nextGroupName, tokenLabel } from '/gpu/groups.js';

// GroupsPanel edits a workspace project's groups (groups.js): name, members, read-only, archived; and makes several at once with the members dealt among them. Saved with the rest of the settings; a group's folder is ~/dhbw/groups/<name>, mounted for its members and the project's managers from the next start of a workspace or job.
export function GroupsPanel({ draft }) {
    const { t } = useTranslation();
    const p = draft.value;
    const groups = p.groups ?? [];
    const choices = memberChoices(p.members).map(v => ({ value: v, label: tokenLabel(v) }));
    const set = (groups) => draft.update(cur => ({ ...cur, groups }));
    const setGroup = (i, patch) => set(groups.map((g, j) => (j === i ? { ...g, ...patch } : g)));
    const [count, setCount] = useState(2);

    if (!(p.storage_gb > 0)) {
        return <Alert color="gray" icon={<Users size={16} />}>{t('gpu.projects.groups.noStorage')}</Alert>;
    }
    return (
        <Stack gap="md">
            <Text size="sm" c="dimmed">{t('gpu.projects.groups.intro')}</Text>
            {groups.length === 0 && <Text size="sm">{t('gpu.projects.groups.none')}</Text>}
            {groups.map((g, i) => {
                const err = groupNameError(g.name, groups, i);
                return (
                    <Paper key={g.id || `new-${i}`} withBorder radius="md" p="sm">
                        <Group align="flex-start" wrap="nowrap" gap="sm">
                            <TextInput w={200} label={t('gpu.projects.groups.name')} value={g.name ?? ''} onChange={e => setGroup(i, { name: e.currentTarget.value })}
                                error={err ? t(`gpu.projects.groups.nameError.${err}`) : null} description={<Code fz="xs">~/dhbw/groups/{(g.name ?? '').trim().toLowerCase() || '…'}</Code>} />
                            <MultiSelect style={{ flex: 1 }} label={t('gpu.projects.groups.members')} searchable clearable value={g.members ?? []} onChange={v => setGroup(i, { members: v })}
                                data={[...choices, ...(g.members ?? []).filter(m => !choices.some(c => c.value === m)).map(v => ({ value: v, label: tokenLabel(v) }))]}
                                placeholder={(g.members ?? []).length ? undefined : t('gpu.projects.groups.membersPlaceholder')} />
                            <Tooltip label={t('gpu.projects.groups.remove')}>
                                <ActionIcon mt={26} variant="subtle" color="red" aria-label={t('gpu.projects.groups.remove')} onClick={() => set(groups.filter((_, j) => j !== i))}><Trash2 size={16} /></ActionIcon>
                            </Tooltip>
                        </Group>
                        <Group gap="lg" mt="xs">
                            <Switch size="xs" label={t('gpu.projects.groups.readOnly')} checked={!!g.read_only} onChange={e => setGroup(i, { read_only: e.currentTarget.checked })} />
                            <Switch size="xs" label={t('gpu.projects.groups.archived')} checked={!!g.archived} onChange={e => setGroup(i, { archived: e.currentTarget.checked })} />
                        </Group>
                    </Paper>
                );
            })}
            <Group gap="sm" align="flex-end">
                <Button size="xs" variant="light" leftSection={<Plus size={14} />} disabled={groups.length >= MAX_GROUPS}
                    onClick={() => set([...groups, { name: nextGroupName(groups), members: [], read_only: false, archived: false }])}>{t('gpu.projects.groups.add')}</Button>
                <NumberInput size="xs" w={90} min={1} max={MAX_GROUPS} label={t('gpu.projects.groups.count')} value={count} onChange={v => setCount(Math.max(1, Number(v) || 1))} />
                <Button size="xs" variant="light" leftSection={<Users size={14} />} disabled={groups.length >= MAX_GROUPS}
                    onClick={() => set(distribute(groups, memberChoices(p.members).filter(m => !groups.some(g => (g.members ?? []).includes(m))), count))}>{t('gpu.projects.groups.distribute')}</Button>
            </Group>
            <Text size="xs" c="dimmed">{t('gpu.projects.groups.hint')}</Text>
        </Stack>
    );
}
