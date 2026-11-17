import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { ActionIcon, Alert, Badge, Button, Code, Group, Loader, Menu, Modal, MultiSelect, NumberInput, Paper, Radio, Stack, Switch, Text, TextInput, Tooltip } from '@mantine/core';
import { Archive, ArchiveRestore, Check, HardDrive, Info, MoreHorizontal, Plus, Shuffle, Trash2, Users, X } from 'lucide-react';
import { groupsEnabled } from '/features.js';
import { useGroupsApi } from '/groups/api-groups.jsx';
import { groupsKeys } from '/groups/query-keys.js';
import { MAX_GROUPS, MAX_GROUP_MEMBERS, dealablePeople, fillFreePlaces, groupNameError, groupTokens, isPerson, legacyTokens, newGroupsBySize, nextGroupName, overCapacity, peopleCount, personChoices, resolveGroupToken, resolvedChoices, tokenLabel, typedPerson } from '/gpu/groups.js';

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

// GroupsPanel edits a workspace project's groups (groups.js): the group choice by the members, then one card per group (GroupCard), with who is in no group yet; and deals the people in no group out (DealModal: into new groups of a size, or into the free places of the existing ones). Groups take persons: course groups among the members can be resolved to their people, to pick them or deal them out one by one; a group token a group has from before shows as such, to be removed. Saved with the rest of the settings; a group's folder is ~/dhbw/groups/<name>, mounted for its members and the project's managers from the next start of a workspace or job.
export function GroupsPanel({ draft }) {
    const { t } = useTranslation();
    const p = draft.value;
    const groups = p.groups ?? [];
    const direct = personChoices(p.members);
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
    const unassigned = dealablePeople(p.members, groups, resolved);
    const [dealing, setDealing] = useState(false);
    const max = p.group_max_members || 0;
    // removing is the index of the group whose removal is being confirmed; a group not saved yet has no folder and goes at once.
    const [removing, setRemoving] = useState(null);
    const askRemove = (i) => (groups[i]?.id ? setRemoving(i) : set(groups.filter((_, j) => j !== i)));

    if (!(p.storage_gb > 0)) {
        return <Alert color="gray" icon={<Users size={16} />}>{t('gpu.projects.groups.noStorage')}</Alert>;
    }
    return (
        <Stack gap="md">
            <Text size="sm" c="dimmed">{t('gpu.projects.groups.intro')}</Text>
            <GroupChoiceSettings p={p} update={draft.update} />
            {tokens.length > 0 && <CourseGroups tokens={tokens} queries={queries} resolving={resolving} onResolve={() => setResolveAsked(true)} />}
            {groups.length === 0 && <Text size="sm">{t('gpu.projects.groups.none')}</Text>}
            {groups.length > 0 && <Unassigned people={unassigned} />}
            {groups.map((g, i) => (
                <GroupCard key={g.id || `new-${i}`} g={g} nameError={groupNameError(g.name, groups, i)} choices={choices} max={max} storageGB={p.storage_gb}
                    onChange={patch => setGroup(i, patch)} onRemove={() => askRemove(i)} />
            ))}
            <Group gap="sm" align="center">
                <Button size="xs" variant="light" leftSection={<Plus size={14} />} disabled={groups.length >= MAX_GROUPS}
                    onClick={() => set([...groups, { name: nextGroupName(groups), members: [], read_only: false, archived: false }])}>{t('gpu.projects.groups.add')}</Button>
                <Button size="xs" variant="light" leftSection={<Shuffle size={14} />} disabled={unassigned.length === 0} onClick={() => setDealing(true)}>{t('gpu.projects.groups.deal.button')}</Button>
                {unassigned.length === 0 && <Text size="xs" c="dimmed">{t('gpu.projects.groups.deal.allAssigned')}</Text>}
            </Group>
            <Text size="xs" c="dimmed">{t('gpu.projects.groups.hint')}</Text>
            <RemoveGroupModal group={removing === null ? null : groups[removing]} onClose={() => setRemoving(null)}
                onDelete={() => { set(groups.filter((_, j) => j !== removing)); setRemoving(null); }}
                onArchive={() => { setGroup(removing, { archived: true }); setRemoving(null); }} />
            <DealModal opened={dealing} onClose={() => setDealing(false)} groups={groups} people={unassigned} max={max}
                onDeal={next => { set(next); setDealing(false); }} />
        </Stack>
    );
}

// GroupCard is one group in the list: a header with its name (and the folder it becomes), how many people it has (of the places, red when more), what is set (read-only, archived, a storage limit) and one menu for the rest (storage limit, read-only, archive or restore, remove), then the people picker over the full width. An archived group is dimmed and shows no picker.
function GroupCard({ g, nameError, choices, max, storageGB, onChange, onRemove }) {
    const { t } = useTranslation();
    const [storageOpen, setStorageOpen] = useState(false);
    const name = (g.name ?? '').trim().toLowerCase() || '…';
    const count = peopleCount(g);
    const over = overCapacity(g, max);
    return (
        <Paper withBorder radius="md" p="sm" style={g.archived ? { opacity: 0.6 } : undefined} aria-label={t('gpu.projects.groups.card', { name })} role="group">
            <Group justify="space-between" wrap="nowrap" gap="sm" align="flex-start">
                <Group gap="xs" wrap="wrap" align="center" style={{ flex: 1, minWidth: 0 }}>
                    <TextInput size="xs" w={170} aria-label={t('gpu.projects.groups.name')} value={g.name ?? ''} onChange={e => onChange({ name: e.currentTarget.value })}
                        error={nameError ? t(`gpu.projects.groups.nameError.${nameError}`) : null} />
                    <Code fz="xs" c="dimmed">~/dhbw/groups/{name}</Code>
                    <Badge size="sm" variant="light" color={over ? 'red' : 'gray'} title={t('gpu.projects.groups.countTitle')}>{max > 0 ? `${count}/${max}` : count}</Badge>
                    {g.read_only && <Badge size="sm" variant="outline" color="gray">{t('gpu.projects.groups.badge.readOnly')}</Badge>}
                    {g.archived && <Badge size="sm" variant="outline" color="gray">{t('gpu.projects.groups.badge.archived')}</Badge>}
                    {g.storage_gb > 0 && <Badge size="sm" variant="outline" color="gray">{t('gpu.projects.groups.badge.storage', { gb: g.storage_gb })}</Badge>}
                </Group>
                <Menu position="bottom-end" withinPortal>
                    <Menu.Target>
                        <ActionIcon variant="subtle" color="gray" aria-label={t('gpu.projects.groups.menu', { name })}><MoreHorizontal size={16} /></ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Item leftSection={<HardDrive size={14} />} onClick={() => setStorageOpen(true)}>{t('gpu.projects.groups.action.storage')}</Menu.Item>
                        <Menu.Item leftSection={g.read_only ? <Check size={14} /> : <span style={{ width: 14, display: 'inline-block' }} />} onClick={() => onChange({ read_only: !g.read_only })}
                            role="menuitemcheckbox" aria-checked={!!g.read_only}>{t('gpu.projects.groups.action.readOnly')}</Menu.Item>
                        <Menu.Item leftSection={g.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />} onClick={() => onChange({ archived: !g.archived })}>
                            {t(g.archived ? 'gpu.projects.groups.action.restore' : 'gpu.projects.groups.action.archive')}
                        </Menu.Item>
                        <Menu.Divider />
                        <Menu.Item color="red" leftSection={<Trash2 size={14} />} onClick={onRemove}>{t('gpu.projects.groups.action.remove')}</Menu.Item>
                    </Menu.Dropdown>
                </Menu>
            </Group>
            {!g.archived && (
                <MemberSelect value={(g.members ?? []).filter(isPerson)} choices={choices} over={over} onChange={v => onChange({ members: [...v, ...legacyTokens(g)] })} />
            )}
            <LegacyEntries tokens={legacyTokens(g)} onRemove={token => onChange({ members: (g.members ?? []).filter(m => m !== token) })} />
            <StorageModal opened={storageOpen} name={name} value={g.storage_gb || 0} storageGB={storageGB} onClose={() => setStorageOpen(false)}
                onSave={gb => { onChange({ storage_gb: gb }); setStorageOpen(false); }} />
        </Paper>
    );
}

// StorageModal sets a group's storage limit (GB, 0 or empty = none, at most the project's storage).
function StorageModal({ opened, name, value, storageGB, onClose, onSave }) {
    const { t } = useTranslation();
    const [gb, setGb] = useState(value);
    return (
        <Modal opened={opened} onClose={onClose} title={t('gpu.projects.groups.storageTitle', { name })} size="sm">
            <NumberInput min={0} max={storageGB} suffix=" GB" label={t('gpu.projects.groups.storage')} placeholder={t('gpu.projects.groups.storageNone')} description={t('gpu.projects.groups.storageHint', { gb: storageGB })}
                value={gb || ''} onChange={v => setGb(Math.max(0, Math.min(storageGB, Math.floor(Number(v) || 0))))} data-autofocus />
            <Group justify="flex-end" mt="md" gap="sm">
                <Button variant="default" onClick={onClose}>{t('gpu.projects.groups.deal.cancel')}</Button>
                <Button onClick={() => onSave(gb)}>{t('gpu.projects.groups.storageApply')}</Button>
            </Group>
        </Modal>
    );
}

// DealModal deals the people in no group yet (people: dealablePeople) out, applied to the draft (saved with the project): into new groups of about a size each (newGroupsBySize, no tiny last group), or, with places per group (max), into the free places of the existing groups that are not archived (fillFreePlaces; whoever does not fit stays in no group). Existing assignments stay as they are. A preview says what it will do.
function DealModal({ opened, onClose, groups, people, max, onDeal }) {
    const { t } = useTranslation();
    return (
        <Modal opened={opened} onClose={onClose} title={t('gpu.projects.groups.deal.title')} size="md">
            {opened && <DealForm onClose={onClose} groups={groups} people={people} max={max} onDeal={onDeal} />}
        </Modal>
    );
}

// DealForm is the content of DealModal, made anew at every opening.
function DealForm({ onClose, groups, people, max, onDeal }) {
    const { t } = useTranslation();
    const [mode, setMode] = useState('new');
    const [size, setSize] = useState(4);
    const fresh = newGroupsBySize(groups, people, size);
    const fill = max > 0 ? fillFreePlaces(groups, people, max) : null;
    const names = fresh.made.map(g => g.name);
    const filled = fill ? fill.added.map((n, i) => (n ? `${groups[i].name} +${n}` : null)).filter(Boolean) : [];
    return (
        <Stack gap="sm">
            <Text size="sm">{t('gpu.projects.groups.deal.people', { count: people.length })}</Text>
            <Radio.Group value={mode} onChange={setMode}>
                <Stack gap="sm">
                    <div>
                        <Group gap="xs" align="center" wrap="nowrap">
                            <Radio value="new" label={t('gpu.projects.groups.deal.newGroups')} />
                            <NumberInput size="xs" w={70} min={1} max={MAX_GROUP_MEMBERS} aria-label={t('gpu.projects.groups.deal.size')} value={size}
                                onChange={v => setSize(Math.max(1, Math.floor(Number(v) || 1)))} disabled={mode !== 'new'} />
                            <Text size="sm">{t('gpu.projects.groups.deal.persons')}</Text>
                        </Group>
                        {mode === 'new' && (
                            <Text size="xs" c="dimmed" mt={4} ml={28}>
                                {t('gpu.projects.groups.deal.previewNew', { count: names.length, names: names.length > 2 ? `${names[0]} … ${names[names.length - 1]}` : names.join(', '), sizes: fresh.made.map(g => g.members.length).join(', ') })}
                            </Text>
                        )}
                    </div>
                    {fill && (
                        <div>
                            <Radio value="fill" label={t('gpu.projects.groups.deal.fill')} />
                            {mode === 'fill' && (
                                <Text size="xs" c="dimmed" mt={4} ml={28}>
                                    {filled.length ? t('gpu.projects.groups.deal.previewFill', { groups: filled.join(', ') }) : t('gpu.projects.groups.deal.noPlaces')}
                                    {fill.left > 0 ? ` ${t('gpu.projects.groups.deal.left', { count: fill.left })}` : ''}
                                </Text>
                            )}
                        </div>
                    )}
                </Stack>
            </Radio.Group>
            <Text size="xs" c="dimmed">{t('gpu.projects.groups.deal.hint')}</Text>
            <Group justify="flex-end" gap="sm">
                <Button variant="default" onClick={onClose}>{t('gpu.projects.groups.deal.cancel')}</Button>
                <Button disabled={mode === 'fill' ? !filled.length : !names.length} onClick={() => onDeal(mode === 'fill' ? fill.groups : fresh.groups)}>{t('gpu.projects.groups.deal.apply')}</Button>
            </Group>
        </Stack>
    );
}

// RemoveGroupModal asks before a saved group is removed, since that deletes its folder ~/dhbw/groups/<name> with every file in it (the service's job does it once the project is saved); with the size the last listing of the folders gave (used_gib), and archiving as the way to keep it.
export function RemoveGroupModal({ group, onClose, onDelete, onArchive }) {
    const { t } = useTranslation();
    const name = (group?.name ?? '').trim().toLowerCase() || '…';
    const used = typeof group?.used_gib === 'number' ? t('gpu.projects.groups.removeConfirm.used', { gb: Math.round(group.used_gib * 10) / 10 }) : '';
    return (
        <Modal opened={!!group} onClose={onClose} title={t('gpu.projects.groups.removeConfirm.title', { name })} size="md">
            <Text size="sm">{t('gpu.projects.groups.removeConfirm.text', { name, used })}</Text>
            <Text size="sm" mt="xs" c="dimmed">{t(group?.archived ? 'gpu.projects.groups.removeConfirm.archivedHint' : 'gpu.projects.groups.removeConfirm.archiveHint')}</Text>
            <Group justify="flex-end" mt="md" gap="sm">
                <Button variant="default" onClick={onClose}>{t('gpu.projects.groups.removeConfirm.cancel')}</Button>
                {!group?.archived && <Button variant="light" onClick={onArchive}>{t('gpu.projects.groups.removeConfirm.archive')}</Button>}
                <Button color="red" onClick={onDelete}>{t('gpu.projects.groups.removeConfirm.delete')}</Button>
            </Group>
        </Modal>
    );
}

// GroupChoiceSettings is the managers' switch for the group choice (group_choice: it only opens and closes joining, which is binding) and the places per group (group_max_members, empty = no limit), with what it means while it is on.
function GroupChoiceSettings({ p, update }) {
    const { t } = useTranslation();
    return (
        <Paper withBorder radius="md" p="sm">
            <Group gap="lg" align="center">
                <Switch label={t('gpu.projects.groups.choice.switch')} checked={!!p.group_choice} onChange={e => { const on = e.currentTarget.checked; update(cur => ({ ...cur, group_choice: on })); }} />
                <NumberInput size="xs" w={190} min={0} max={MAX_GROUP_MEMBERS} label={t('gpu.projects.groups.choice.max')} placeholder={t('gpu.projects.groups.choice.noLimit')}
                    value={p.group_max_members || ''} onChange={v => update(cur => ({ ...cur, group_max_members: Math.max(0, Math.min(MAX_GROUP_MEMBERS, Math.floor(Number(v) || 0))) }))} />
            </Group>
            <Text size="xs" c="dimmed" mt={6}>{t('gpu.projects.groups.choice.hint')}</Text>
            {p.group_choice && (
                <Alert mt="xs" color="yellow" variant="light" icon={<Info size={16} />} p="xs">{t('gpu.projects.groups.choice.running')}</Alert>
            )}
        </Paper>
    );
}

// LegacyEntries are the group tokens a group has from before groups took persons only: they still count their people in, but are no longer offered; each can be removed.
function LegacyEntries({ tokens, onRemove }) {
    const { t } = useTranslation();
    if (tokens.length === 0) return null;
    return (
        <Group gap={6} mt={6} align="center">
            {tokens.map(token => (
                <Badge key={token} variant="outline" color="gray" style={{ textTransform: 'none' }}
                    rightSection={<ActionIcon size="xs" variant="transparent" color="gray" aria-label={t('gpu.projects.groups.legacy.remove', { group: tokenLabel(token) })} onClick={() => onRemove(token)}><X size={12} /></ActionIcon>}>
                    {t('gpu.projects.groups.legacy.label', { group: tokenLabel(token) })}
                </Badge>
            ))}
            <Text size="xs" c="dimmed">{t('gpu.projects.groups.legacy.hint')}</Text>
        </Group>
    );
}

// Unassigned names the people in no group yet (dealablePeople: the project's members and the people of its resolved course groups, without managers), the ones "deal out" would take.
function Unassigned({ people }) {
    const { t } = useTranslation();
    return (
        <Text size="xs" c="dimmed">
            {people.length === 0 ? t('gpu.projects.groups.unassignedNone') : t('gpu.projects.groups.unassigned', { count: people.length, names: people.map(tokenLabel).join(', ') })}
        </Text>
    );
}

// MemberSelect picks a group's people from the project's members and the people of its resolved course groups (under the group they come from); an e-mail address typed in is offered as a person too, for the people of a course group that cannot be looked up here. Groups are not offered: a group takes persons. over marks more people than places of the group choice (the managers may).
function MemberSelect({ value, choices, over = false, onChange }) {
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
        <MultiSelect style={{ flex: 1 }} mt="xs" aria-label={t('gpu.projects.groups.members')} searchable clearable value={value} data={data} searchValue={search} onSearchChange={setSearch}
            error={over ? t('gpu.projects.groups.overCapacity') : null} onChange={onChange} nothingFoundMessage={t('gpu.projects.groups.nothingFound')} placeholder={value.length ? undefined : t('gpu.projects.groups.membersPlaceholder')} />
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
