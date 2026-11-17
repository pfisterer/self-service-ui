import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { ActionIcon, Alert, Badge, Button, Code, Group, Loader, Menu, Modal, MultiSelect, NumberInput, Paper, ScrollArea, SegmentedControl, Stack, Switch, Text, TextInput, Tooltip } from '@mantine/core';
import { DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { ArrowRightLeft, GripVertical, Info, Plus, Trash2, Users, X } from 'lucide-react';
import { groupsEnabled } from '/features.js';
import { useGroupsApi } from '/groups/api-groups.jsx';
import { groupsKeys } from '/groups/query-keys.js';
import { MAX_GROUPS, MAX_GROUP_MEMBERS, dealablePeople, distribute, groupNameError, groupTokens, isPerson, legacyTokens, moveMember, nextGroupName, overCapacity, peopleCount, personChoices, resolveGroupToken, resolvedChoices, tokenLabel, typedPerson } from '/gpu/groups.js';

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

// GroupsPanel edits a workspace project's groups (groups.js): the group choice by the members, then name, members, storage, read-only and archived per group, in a list or as a board to drag people between groups; and makes several at once with the people dealt among them. Groups take persons: course groups among the members can be resolved to their people, to pick them, drag them or deal them out one by one; a group token a group has from before shows as such, to be removed. Saved with the rest of the settings; a group's folder is ~/dhbw/groups/<name>, mounted for its members (not while the group choice is open) and the project's managers from the next start of a workspace or job.
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
    const [count, setCount] = useState(2);
    const [view, setView] = useState('list');
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
            {groups.length > 0 && (
                <SegmentedControl size="xs" w="fit-content" value={view} onChange={setView} data={[
                    { value: 'list', label: t('gpu.projects.groups.view.list') },
                    { value: 'board', label: t('gpu.projects.groups.view.board') },
                ]} />
            )}
            {view === 'board' && groups.length > 0 && (
                <GroupBoard groups={groups} people={dealablePeople(p.members, groups, resolved)} max={max}
                    onMove={(token, to) => set(moveMember(groups, token, to))}
                    onRemove={(i, token) => setGroup(i, { members: (groups[i].members ?? []).filter(m => m !== token) })} onRemoveGroup={askRemove} />
            )}
            {view === 'list' && groups.map((g, i) => {
                const err = groupNameError(g.name, groups, i);
                return (
                    <Paper key={g.id || `new-${i}`} withBorder radius="md" p="sm">
                        <Group align="flex-start" wrap="nowrap" gap="sm">
                            <TextInput w={200} label={t('gpu.projects.groups.name')} value={g.name ?? ''} onChange={e => setGroup(i, { name: e.currentTarget.value })}
                                error={err ? t(`gpu.projects.groups.nameError.${err}`) : null} description={<Code fz="xs">~/dhbw/groups/{(g.name ?? '').trim().toLowerCase() || '…'}</Code>} />
                            <MemberSelect value={(g.members ?? []).filter(isPerson)} choices={choices} capacity={max > 0 ? `${peopleCount(g)}/${max}` : null}
                                onChange={v => setGroup(i, { members: [...v, ...legacyTokens(g)] })} />
                            <Tooltip label={t('gpu.projects.groups.remove')}>
                                <ActionIcon mt={26} variant="subtle" color="red" aria-label={t('gpu.projects.groups.remove')} onClick={() => askRemove(i)}><Trash2 size={16} /></ActionIcon>
                            </Tooltip>
                        </Group>
                        <LegacyEntries tokens={legacyTokens(g)} onRemove={token => setGroup(i, { members: (g.members ?? []).filter(m => m !== token) })} />
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
            <RemoveGroupModal group={removing === null ? null : groups[removing]} onClose={() => setRemoving(null)}
                onDelete={() => { set(groups.filter((_, j) => j !== removing)); setRemoving(null); }}
                onArchive={() => { setGroup(removing, { archived: true }); setRemoving(null); }} />
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

// GroupChoiceSettings is the managers' switch for the group choice (group_choice) and the places per group (group_max_members, empty = no limit), with what it means while it is on: the members choose, their group folders wait.
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

// NONE is the board's column of the people in no group yet.
const NONE = 'none';

// GroupBoard shows the groups as columns of people (a group removed from its column's header, asked first like in the list), next to a column of those in no group yet (dealablePeople: the project's members and the people of its resolved course groups, without managers); a card is dragged to another column, or moved with its menu (keyboard, touch). Moving into "not in a group" takes the person out of their group. A column shows how many places of the group choice are taken; managers may put more in. The board edits the same draft as the list.
function GroupBoard({ groups, people, max, onMove, onRemove, onRemoveGroup }) {
    const { t } = useTranslation();
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));
    const targets = [{ id: NONE, label: t('gpu.projects.groups.board.none') }, ...groups.map((g, i) => ({ id: String(i), label: g.name || '…' }))];
    const move = (token, target) => onMove(token, target === NONE ? null : Number(target));
    const onDragEnd = ({ active, over }) => {
        if (!over || over.id === active.data.current?.from) return;
        move(active.data.current.token, over.id);
    };
    return (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
            <ScrollArea type="auto" offsetScrollbars>
                <Group align="flex-start" wrap="nowrap" gap="sm" pb="xs">
                    <BoardColumn id={NONE} title={t('gpu.projects.groups.board.none')} count={people.length}>
                        {people.map(token => <PersonCard key={token} token={token} from={NONE} targets={targets} onMove={move} />)}
                    </BoardColumn>
                    {groups.map((g, i) => (
                        <BoardColumn key={g.id || `new-${i}`} id={String(i)} title={g.name || '…'} count={peopleCount(g)} max={max} over={overCapacity(g, max)} archived={!!g.archived} onRemove={() => onRemoveGroup(i)}>
                            {(g.members ?? []).filter(isPerson).map(token => <PersonCard key={token} token={token} from={String(i)} targets={targets} onMove={move} />)}
                            {legacyTokens(g).map(token => (
                                <Paper key={token} withBorder radius="sm" px={6} py={4} bg="var(--mantine-color-gray-light)">
                                    <Group gap={4} wrap="nowrap" justify="space-between">
                                        <Text size="xs" c="dimmed" truncate>{t('gpu.projects.groups.legacy.label', { group: tokenLabel(token) })}</Text>
                                        <ActionIcon size="xs" variant="subtle" color="gray" aria-label={t('gpu.projects.groups.legacy.remove', { group: tokenLabel(token) })} onClick={() => onRemove(i, token)}><X size={12} /></ActionIcon>
                                    </Group>
                                </Paper>
                            ))}
                        </BoardColumn>
                    ))}
                </Group>
            </ScrollArea>
        </DndContext>
    );
}

// BoardColumn is one column of the board, a drop target, with its count of people and, with places in the group choice, the places (red when more people are in it).
function BoardColumn({ id, title, count, max = 0, over = false, archived = false, onRemove = null, children }) {
    const { t } = useTranslation();
    const { setNodeRef, isOver } = useDroppable({ id });
    return (
        <Paper ref={setNodeRef} withBorder radius="md" p="xs" w={220} style={{ flexShrink: 0, minHeight: 120, background: isOver ? 'var(--mantine-color-blue-light)' : undefined }}
            role="group" aria-label={title}>
            <Group justify="space-between" gap={4} mb={6} wrap="nowrap">
                <Text size="sm" fw={600} truncate>{title}</Text>
                <Group gap={2} wrap="nowrap">
                    <Badge size="sm" variant="light" color={over ? 'red' : 'gray'}>{max > 0 ? `${count}/${max}` : count}</Badge>
                    {onRemove && <ActionIcon size="xs" variant="subtle" color="red" aria-label={t('gpu.projects.groups.removeOf', { name: title })} onClick={onRemove}><Trash2 size={12} /></ActionIcon>}
                </Group>
            </Group>
            {archived && <Text size="xs" c="dimmed" mb={4}>{t('gpu.projects.groups.board.archived')}</Text>}
            <Stack gap={4}>{children}</Stack>
        </Paper>
    );
}

// PersonCard is a person on the board: dragged by its handle or the card, or moved with its menu "Move to …".
function PersonCard({ token, from, targets, onMove }) {
    const { t } = useTranslation();
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `${from}:${token}`, data: { token, from } });
    const style = { transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, opacity: isDragging ? 0.6 : 1, zIndex: isDragging ? 10 : undefined, position: 'relative', touchAction: 'none' };
    const label = tokenLabel(token);
    return (
        <Paper ref={setNodeRef} withBorder radius="sm" px={6} py={4} style={style}>
            <Group gap={4} wrap="nowrap">
                <span {...listeners} {...attributes} aria-label={t('gpu.projects.groups.board.drag', { person: label })} style={{ cursor: 'grab', display: 'flex' }}><GripVertical size={14} /></span>
                <Text size="xs" style={{ flex: 1, minWidth: 0 }} truncate title={label}>{label}</Text>
                <Menu position="bottom-end" withinPortal>
                    <Menu.Target>
                        <ActionIcon size="xs" variant="subtle" color="gray" aria-label={t('gpu.projects.groups.board.moveOf', { person: label })}><ArrowRightLeft size={12} /></ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Label>{t('gpu.projects.groups.board.moveTo')}</Menu.Label>
                        {targets.filter(x => x.id !== from).map(x => (
                            <Menu.Item key={x.id} onClick={() => onMove(token, x.id)}>{x.label}</Menu.Item>
                        ))}
                    </Menu.Dropdown>
                </Menu>
            </Group>
        </Paper>
    );
}

// MemberSelect picks a group's people from the project's members and the people of its resolved course groups (under the group they come from); an e-mail address typed in is offered as a person too, for the people of a course group that cannot be looked up here. Groups are not offered: a group takes persons. capacity is "taken/places" of the group choice, when it has places.
function MemberSelect({ value, choices, capacity, onChange }) {
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
        <MultiSelect style={{ flex: 1 }} label={capacity ? `${t('gpu.projects.groups.members')} (${capacity})` : t('gpu.projects.groups.members')} searchable clearable value={value} data={data} searchValue={search} onSearchChange={setSearch}
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
