import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { ActionIcon, Alert, Button, Code, Group, Loader, MultiSelect, NumberInput, Paper, Stack, Switch, Text, TextInput, Tooltip } from '@mantine/core';
import { Plus, Trash2, Users } from 'lucide-react';
import { groupsEnabled } from '/features.js';
import { useGroupsApi } from '/groups/api-groups.jsx';
import { groupsKeys } from '/groups/query-keys.js';
import { MAX_GROUPS, dealablePeople, distribute, groupNameError, groupTokens, memberChoices, nextGroupName, resolveGroupToken, resolvedChoices, tokenLabel, typedPerson } from '/gpu/groups.js';

// AUTO_RESOLVE: up to this many course groups their people are looked up as soon as the tab opens; with more, on request, so a big project does not fire a request per group unasked.
const AUTO_RESOLVE = 3;
const STALE = 5 * 60 * 1000;
// A group the person may not read (403, 409 for a sync source's group) or that does not exist stays that way on a retry.
const retry = (n, err) => ![403, 404, 409].includes(err?.status) && n < 2;

// useResolvedGroups looks up the people of the course groups in the role provider (gpu/groups.js resolveGroupToken), as the signed-in person: admins, the managers of a local group and its viewers ("Mitglieder einsehen", also on a group it is nested in) may read them. The group's entries and effective members share the cache of the groups section.
function useResolvedGroups(tokens, enabled) {
    const api = useGroupsApi();
    const qc = useQueryClient();
    const effective = id => qc.fetchQuery({ queryKey: groupsKeys.effective(id), queryFn: async () => (await api.effectiveMembers(id)) ?? [], staleTime: STALE, retry });
    const detail = id => qc.fetchQuery({ queryKey: groupsKeys.detail(id), queryFn: () => api.getGroup(id), staleTime: STALE, retry });
    return useQueries({
        queries: tokens.map(token => ({
            queryKey: groupsKeys.resolved(token),
            queryFn: () => resolveGroupToken(token, { effective, detail }),
            enabled: groupsEnabled && enabled,
            staleTime: STALE,
            retry,
        })),
    });
}

// GroupsPanel edits a workspace project's groups (groups.js): name, members, read-only, archived; and makes several at once with the members dealt among them. Course groups among the members can be resolved to their people, to pick them or deal them out one by one. Saved with the rest of the settings; a group's folder is ~/dhbw/groups/<name>, mounted for its members and the project's managers from the next start of a workspace or job.
export function GroupsPanel({ draft }) {
    const { t } = useTranslation();
    const p = draft.value;
    const groups = p.groups ?? [];
    const direct = memberChoices(p.members);
    const tokens = groupTokens(p.members, groups);
    const [resolveAsked, setResolveAsked] = useState(false);
    const resolving = resolveAsked || tokens.length <= AUTO_RESOLVE;
    const queries = useResolvedGroups(tokens, resolving && p.storage_gb > 0);
    const resolved = tokens.map((token, i) => ({ token, people: queries[i]?.data ?? [] }));
    const fromGroups = resolvedChoices(direct, resolved);
    const choices = [
        ...direct.map(v => ({ value: v, label: tokenLabel(v) })),
        ...fromGroups.map(r => ({ group: t('gpu.projects.groups.fromGroup', { group: tokenLabel(r.token) }), items: r.people.map(v => ({ value: v, label: tokenLabel(v) })) })),
    ];
    const set = (groups) => draft.update(cur => ({ ...cur, groups }));
    const setGroup = (i, patch) => set(groups.map((g, j) => (j === i ? { ...g, ...patch } : g)));
    const [count, setCount] = useState(2);

    if (!(p.storage_gb > 0)) {
        return <Alert color="gray" icon={<Users size={16} />}>{t('gpu.projects.groups.noStorage')}</Alert>;
    }
    return (
        <Stack gap="md">
            <Text size="sm" c="dimmed">{t('gpu.projects.groups.intro')}</Text>
            {tokens.length > 0 && <CourseGroups tokens={tokens} queries={queries} resolving={resolving} onResolve={() => setResolveAsked(true)} />}
            {groups.length === 0 && <Text size="sm">{t('gpu.projects.groups.none')}</Text>}
            {groups.map((g, i) => {
                const err = groupNameError(g.name, groups, i);
                return (
                    <Paper key={g.id || `new-${i}`} withBorder radius="md" p="sm">
                        <Group align="flex-start" wrap="nowrap" gap="sm">
                            <TextInput w={200} label={t('gpu.projects.groups.name')} value={g.name ?? ''} onChange={e => setGroup(i, { name: e.currentTarget.value })}
                                error={err ? t(`gpu.projects.groups.nameError.${err}`) : null} description={<Code fz="xs">~/dhbw/groups/{(g.name ?? '').trim().toLowerCase() || '…'}</Code>} />
                            <MemberSelect value={g.members ?? []} choices={choices} onChange={v => setGroup(i, { members: v })} />
                            <Tooltip label={t('gpu.projects.groups.remove')}>
                                <ActionIcon mt={26} variant="subtle" color="red" aria-label={t('gpu.projects.groups.remove')} onClick={() => set(groups.filter((_, j) => j !== i))}><Trash2 size={16} /></ActionIcon>
                            </Tooltip>
                        </Group>
                        <Group gap="lg" mt="xs" align="center">
                            <NumberInput size="xs" w={150} min={0} max={p.storage_gb} suffix=" GB" aria-label={t('gpu.projects.groups.storage')} placeholder={t('gpu.projects.groups.storageNone')}
                                value={g.storage_gb || ''} onChange={v => setGroup(i, { storage_gb: Math.max(0, Math.min(p.storage_gb, Math.floor(Number(v) || 0))) })} leftSection={<Text size="xs" c="dimmed" pl={4}>{t('gpu.projects.groups.storageShort')}</Text>} leftSectionWidth={70} />
                            <Switch size="xs" label={t('gpu.projects.groups.readOnly')} checked={!!g.read_only} onChange={e => setGroup(i, { read_only: e.currentTarget.checked })} />
                            <Switch size="xs" label={t('gpu.projects.groups.archived')} checked={!!g.archived} onChange={e => setGroup(i, { archived: e.currentTarget.checked })} />
                        </Group>
                    </Paper>
                );
            })}
            <Group gap="xl" align="center">
                <Button size="xs" variant="light" leftSection={<Plus size={14} />} disabled={groups.length >= MAX_GROUPS}
                    onClick={() => set([...groups, { name: nextGroupName(groups), members: [], read_only: false, archived: false }])}>{t('gpu.projects.groups.add')}</Button>
                <Group gap={6} align="center" wrap="nowrap">
                    <NumberInput size="xs" w={64} min={1} max={MAX_GROUPS} aria-label={t('gpu.projects.groups.count')} value={count} onChange={v => setCount(Math.max(1, Number(v) || 1))} />
                    <Button size="xs" variant="light" leftSection={<Users size={14} />} disabled={groups.length >= MAX_GROUPS}
                        onClick={() => set(distribute(groups, dealablePeople(p.members, groups, resolved), count))}>{t('gpu.projects.groups.distribute')}</Button>
                </Group>
            </Group>
            <Text size="xs" c="dimmed">{t('gpu.projects.groups.hint')}</Text>
        </Stack>
    );
}

// MemberSelect picks a group's members from the project's members and the people of its resolved course groups (under the group they come from); an e-mail address typed in is offered as a person too, for the people of a course group that cannot be looked up here.
function MemberSelect({ value, choices, onChange }) {
    const { t } = useTranslation();
    const [search, setSearch] = useState('');
    const offered = new Set(choices.flatMap(c => (c.items ? c.items.map(x => x.value) : [c.value])));
    const typed = typedPerson(search);
    const data = [
        ...choices,
        ...value.filter(m => !offered.has(m)).map(v => ({ value: v, label: tokenLabel(v) })),
        ...(typed && !offered.has(typed) && !value.includes(typed) ? [{ value: typed, label: t('gpu.projects.groups.addPerson', { email: tokenLabel(typed) }) }] : []),
    ];
    return (
        <MultiSelect style={{ flex: 1 }} label={t('gpu.projects.groups.members')} searchable clearable value={value} data={data} searchValue={search} onSearchChange={setSearch}
            onChange={onChange} nothingFoundMessage={t('gpu.projects.groups.nothingFound')} placeholder={value.length ? undefined : t('gpu.projects.groups.membersPlaceholder')} />
    );
}

// CourseGroups says for each course group among the members whether its people could be looked up: how many, or why not — a group the person may not read (403, 409) gets the way to the right "Mitglieder einsehen", anything else that the lookup failed. Without the role provider in this deployment, one line instead.
function CourseGroups({ tokens, queries, resolving, onResolve }) {
    const { t } = useTranslation();
    if (!groupsEnabled) return <Text size="xs" c="dimmed">{t('gpu.projects.groups.resolve.unavailable')}</Text>;
    if (!resolving) {
        return (
            <Group gap="sm">
                <Button size="xs" variant="default" leftSection={<Users size={14} />} onClick={onResolve}>{t('gpu.projects.groups.resolve.show', { count: tokens.length })}</Button>
                <Text size="xs" c="dimmed">{t('gpu.projects.groups.resolve.why')}</Text>
            </Group>
        );
    }
    return (
        <Stack gap={4}>
            {tokens.map((token, i) => {
                const q = queries[i];
                const group = tokenLabel(token);
                let status;
                if (!q || q.isPending) status = <Loader size={12} />;
                else if (q.isError) status = <Text size="xs" c="dimmed">{t([403, 409].includes(q.error?.status) ? 'gpu.projects.groups.resolve.forbidden' : 'gpu.projects.groups.resolve.failed', { group })}</Text>;
                else status = <Text size="xs" c="dimmed">{t('gpu.projects.groups.resolve.count', { count: q.data.length })}</Text>;
                return (
                    <Group key={token} gap="xs" wrap="nowrap" align="flex-start">
                        <Code fz="xs">{group}</Code>
                        {status}
                    </Group>
                );
            })}
        </Stack>
    );
}
