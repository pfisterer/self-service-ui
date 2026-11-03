import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { DatePickerInput } from '@mantine/dates';
import { Alert, Anchor, Badge, Button, Container, Group, Modal, Paper, Select, Stack, Table, Tabs, Text, TextInput, Textarea, Title } from '@mantine/core';
import { ArrowLeft, Calendar, Pencil, Plus, Trash2 } from 'lucide-react';
import dayjs from 'dayjs';
import { formatDate, formatDateTime } from '/format-date.js';
import { LoadError, Loading, useApiMutation } from '/helper/query-state.jsx';
import { PrincipalTokenAutocomplete } from '/helper/principal-token-autocomplete.jsx';
import { useConfirm } from '/providers/confirm.jsx';
import { useGroupsApi } from '/groups/api-groups.jsx';
import { groupsKeys } from '/groups/query-keys.js';
import { useGroupsMe } from '/groups/use-groups-me.jsx';
import { TokenText } from '/groups/tokens.jsx';

// What somebody types is completed to a token: an address is a person, anything else without a prefix a group. The service checks the rest.
export function asToken(raw) {
    const v = (raw ?? '').trim();
    if (!v || v.includes(':')) return v;
    return v.includes('@') ? `user:${v.toLowerCase()}` : `group:${v.toLowerCase()}`;
}

// A role as the UI's language names it; one it has no text for is shown as stored.
export function relationText(t, relation) {
    if (!relation || relation === 'member') return t('groups.relationMember');
    return t(`projects.relations.${relation}`, { defaultValue: relation });
}

// The end of the chosen day, so "until 31 March" includes 31 March.
export function endOfDay(date) {
    return date ? dayjs(date).endOf('day').toDate() : null;
}

// GroupDetail: one group the caller maintains — its entries, everyone it counts in the end, who maintains it, and what happened to it.
export function GroupDetail({ params }) {
    const id = decodeURIComponent(params.id);
    const { t } = useTranslation();
    const api = useGroupsApi();
    const confirm = useConfirm();
    const [, navigate] = useLocation();
    const [editing, setEditing] = useState(false);

    const detail = useQuery({ queryKey: groupsKeys.detail(id), queryFn: () => api.getGroup(id) });
    const remove = useApiMutation({
        mutationFn: () => api.deleteGroup(id),
        invalidates: [groupsKeys.all()],
        onSuccess: () => navigate('/'),
    });

    if (detail.isPending) return <Container size="lg" py="md"><Loading /></Container>;
    if (detail.isError) {
        return (
            <Container size="lg" py="md">
                <BackLink />
                <LoadError query={detail} />
            </Container>
        );
    }

    const { group, memberships = [], managers = [], may_delete: mayDelete } = detail.data;

    async function onDelete() {
        const ok = await confirm({
            title: t('groups.delete.title'),
            confirmLabel: t('groups.delete.confirm'),
            message: t('groups.delete.message', { id: group.id }),
        });
        if (ok) remove.mutate();
    }

    return (
        <Container size="lg" py="md">
            <BackLink />
            <Stack gap="lg" mt="xs">
                <Paper p="lg" radius="md" withBorder>
                    <Group justify="space-between" align="flex-start" wrap="wrap">
                        <div>
                            <Group gap="xs">
                                <Title order={3}>{group.id}</Title>
                                {group.source_name && <Badge variant="light">{group.source_name}</Badge>}
                            </Group>
                            {group.display_name && group.display_name !== group.id && <Text fw={500}>{group.display_name}</Text>}
                            {group.description && <Text size="sm" c="dimmed">{group.description}</Text>}
                            <Text size="xs" c="dimmed" mt={4}>{t('groups.detail.token', { token: group.token })}</Text>
                        </div>
                        <Group gap="xs">
                            <Button variant="default" leftSection={<Pencil size={14} />} onClick={() => setEditing(true)}>{t('groups.detail.edit')}</Button>
                            {mayDelete && (
                                <Button variant="subtle" color="red" leftSection={<Trash2 size={14} />} loading={remove.isPending} onClick={onDelete}>
                                    {t('groups.delete.button')}
                                </Button>
                            )}
                        </Group>
                    </Group>
                </Paper>

                <Tabs defaultValue="entries" keepMounted={false}>
                    <Tabs.List>
                        <Tabs.Tab value="entries">{t('groups.tabs.entries', { count: memberships.length })}</Tabs.Tab>
                        <Tabs.Tab value="effective">{t('groups.tabs.effective')}</Tabs.Tab>
                        <Tabs.Tab value="managers">{t('groups.tabs.managers', { count: managers.length })}</Tabs.Tab>
                        <Tabs.Tab value="history">{t('groups.tabs.history')}</Tabs.Tab>
                    </Tabs.List>
                    <Tabs.Panel value="entries" pt="md"><Entries id={group.id} memberships={memberships} /></Tabs.Panel>
                    <Tabs.Panel value="effective" pt="md"><Effective id={group.id} /></Tabs.Panel>
                    <Tabs.Panel value="managers" pt="md"><Managers id={group.id} managers={managers} /></Tabs.Panel>
                    <Tabs.Panel value="history" pt="md"><History id={group.id} /></Tabs.Panel>
                </Tabs>
            </Stack>
            {editing && <EditGroupModal group={group} onClose={() => setEditing(false)} />}
        </Container>
    );
}

function BackLink() {
    const { t } = useTranslation();
    return (
        <Anchor component={Link} to="/" size="sm">
            <Group gap={4} component="span"><ArrowLeft size={14} />{t('groups.detail.back')}</Group>
        </Anchor>
    );
}

function EditGroupModal({ group, onClose }) {
    const { t } = useTranslation();
    const api = useGroupsApi();
    const [displayName, setDisplayName] = useState(group.display_name === group.id ? '' : group.display_name);
    const [description, setDescription] = useState(group.description ?? '');
    const save = useApiMutation({
        mutationFn: () => api.updateGroup(group.id, { displayName: displayName.trim(), description: description.trim() }),
        invalidates: [groupsKeys.all()],
        onSuccess: onClose,
    });
    return (
        <Modal opened onClose={onClose} title={t('groups.edit.title', { id: group.id })} centered>
            <Stack gap="sm">
                <TextInput label={t('groups.create.displayName')} value={displayName} onChange={e => setDisplayName(e.currentTarget.value)} data-autofocus />
                <Textarea label={t('groups.create.description')} autosize minRows={2} value={description} onChange={e => setDescription(e.currentTarget.value)} />
                <Group justify="flex-end" mt="md">
                    <Button variant="default" onClick={onClose}>{t('groups.cancel')}</Button>
                    <Button loading={save.isPending} onClick={() => save.mutate()}>{t('groups.edit.save')}</Button>
                </Group>
            </Stack>
        </Modal>
    );
}

// Entries: the group's direct entries with role and expiry, and the form for a new one. An expired entry grants nothing but stays until removed, so it is visible that it ran out.
function Entries({ id, memberships }) {
    const { t } = useTranslation();
    const api = useGroupsApi();
    const confirm = useConfirm();
    const { relations } = useGroupsMe();
    const [member, setMember] = useState('');
    const [relation, setRelation] = useState('member');
    const [until, setUntil] = useState(null);
    // The entry whose expiry is being changed.
    const [extending, setExtending] = useState(null);

    const invalidates = [groupsKeys.detail(id), groupsKeys.effective(id), groupsKeys.history(id), groupsKeys.lists()];
    const add = useApiMutation({
        mutationFn: () => api.addMember(id, { member: asToken(member), relation, expiresAt: endOfDay(until) }),
        invalidates,
        onSuccess: () => { setMember(''); setUntil(null); },
    });
    const remove = useApiMutation({
        mutationFn: (m) => api.removeMember(id, { member: m.member, relation: m.relation }),
        invalidates,
    });

    async function onRemove(m) {
        const ok = await confirm({
            title: t('groups.entries.removeTitle'),
            confirmLabel: t('groups.entries.removeConfirm'),
            message: t('groups.entries.removeMessage', { member: m.member, relation: relationText(t, m.relation) }),
        });
        if (ok) remove.mutate(m);
    }

    return (
        <Paper p="lg" radius="md" withBorder>
            <Group align="flex-end" gap="xs" wrap="wrap">
                <div style={{ flex: '1 1 280px' }}>
                    <PrincipalTokenAutocomplete single label={t('groups.entries.member')} placeholder={t('groups.entries.placeholder')}
                        value={member} onChange={setMember} search={api.searchPrincipals} searchKey={groupsKeys.principals()} />
                </div>
                {relations.length > 1 && (
                    <Select w={180} label={t('groups.entries.relation')} allowDeselect={false} value={relation} onChange={setRelation}
                        data={relations.map(r => ({ value: r, label: relationText(t, r) }))} />
                )}
                <DatePickerInput w={190} clearable label={t('groups.entries.until')} placeholder={t('groups.entries.noEnd')}
                    leftSection={<Calendar size={14} />} valueFormat={t('dates.pickerFormat')} minDate={new Date()}
                    value={until} onChange={(v) => setUntil(v ? dayjs(v).toDate() : null)} />
                <Button leftSection={<Plus size={16} />} disabled={!asToken(member)} loading={add.isPending} onClick={() => add.mutate()}>
                    {t('groups.entries.add')}
                </Button>
            </Group>
            <Text size="xs" c="dimmed" mt="xs">{t('groups.entries.hint')}</Text>

            <Table striped highlightOnHover mt="md">
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>{t('groups.entries.member')}</Table.Th>
                        <Table.Th>{t('groups.entries.relation')}</Table.Th>
                        <Table.Th>{t('groups.entries.until')}</Table.Th>
                        <Table.Th>{t('groups.entries.since')}</Table.Th>
                        <Table.Th />
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {memberships.length === 0 && (
                        <Table.Tr><Table.Td colSpan={5}><Text size="sm" c="dimmed">{t('groups.entries.none')}</Text></Table.Td></Table.Tr>
                    )}
                    {memberships.map(m => (
                        <Table.Tr key={`${m.member}#${m.relation}`} style={m.expired ? { opacity: 0.6 } : undefined}>
                            <Table.Td><TokenText token={m.member} /></Table.Td>
                            <Table.Td>{relationText(t, m.relation)}</Table.Td>
                            <Table.Td>
                                {m.expired
                                    ? <Badge color="red" variant="light">{t('groups.entries.expired', { date: formatDate(m.expires_at) })}</Badge>
                                    : (m.expires_at ? formatDate(m.expires_at) : <Text span size="sm" c="dimmed">{t('groups.entries.noEnd')}</Text>)}
                            </Table.Td>
                            <Table.Td>{m.created_at ? formatDate(m.created_at) : ''}</Table.Td>
                            <Table.Td align="right">
                                <Group gap={4} justify="flex-end" wrap="nowrap">
                                    <Button size="xs" variant="subtle" leftSection={<Calendar size={14} />} onClick={() => setExtending(m)}>
                                        {t('groups.entries.changeUntil')}
                                    </Button>
                                    <Button size="xs" variant="subtle" color="red" leftSection={<Trash2 size={14} />}
                                        loading={remove.isPending && remove.variables === m} onClick={() => onRemove(m)}>
                                        {t('groups.entries.remove')}
                                    </Button>
                                </Group>
                            </Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
            {extending && <ExpiryModal id={id} entry={extending} onClose={() => setExtending(null)} />}
        </Paper>
    );
}

// ExpiryModal: a new end for an entry, or none. Adding an entry again is how the service sets its expiry.
function ExpiryModal({ id, entry, onClose }) {
    const { t } = useTranslation();
    const api = useGroupsApi();
    const current = entry.expires_at && !entry.expired ? new Date(entry.expires_at) : null;
    const [until, setUntil] = useState(current);
    const save = useApiMutation({
        mutationFn: () => api.addMember(id, { member: entry.member, relation: entry.relation, expiresAt: endOfDay(until) }),
        invalidates: [groupsKeys.detail(id), groupsKeys.effective(id), groupsKeys.history(id)],
        onSuccess: onClose,
    });
    return (
        <Modal opened onClose={onClose} title={t('groups.expiry.title')} centered>
            <Stack gap="sm">
                <TokenText token={entry.member} />
                <DatePickerInput clearable label={t('groups.entries.until')} placeholder={t('groups.entries.noEnd')}
                    leftSection={<Calendar size={14} />} valueFormat={t('dates.pickerFormat')} minDate={new Date()}
                    value={until} onChange={(v) => setUntil(v ? dayjs(v).toDate() : null)} />
                <Text size="xs" c="dimmed">{t('groups.expiry.hint')}</Text>
                <Group justify="flex-end" mt="md">
                    <Button variant="default" onClick={onClose}>{t('groups.cancel')}</Button>
                    <Button loading={save.isPending} onClick={() => save.mutate()}>{t('groups.edit.save')}</Button>
                </Group>
            </Stack>
        </Modal>
    );
}

// Effective: everyone the group counts in the end, sub-groups resolved.
function Effective({ id }) {
    const { t } = useTranslation();
    const api = useGroupsApi();
    const members = useQuery({ queryKey: groupsKeys.effective(id), queryFn: () => api.effectiveMembers(id) });
    if (members.isPending) return <Loading />;
    if (members.isError) return <LoadError query={members} />;
    return (
        <Paper p="lg" radius="md" withBorder>
            <Text size="sm" c="dimmed" mb="sm">{t('groups.effective.hint', { count: members.data.length })}</Text>
            {members.data.length === 0
                ? <Text size="sm" c="dimmed">{t('groups.effective.none')}</Text>
                : (
                    <Stack gap={4}>
                        {members.data.map(token => <TokenText key={token} token={token} />)}
                    </Stack>
                )}
        </Paper>
    );
}

// Managers: who maintains the group. Maintaining a group is not being in it, which the hint says, because the two are easy to confuse.
function Managers({ id, managers }) {
    const { t } = useTranslation();
    const api = useGroupsApi();
    const confirm = useConfirm();
    const [input, setInput] = useState('');
    const invalidates = [groupsKeys.detail(id), groupsKeys.history(id), groupsKeys.lists(), groupsKeys.me()];
    const add = useApiMutation({
        mutationFn: (token) => api.addManager(id, token),
        invalidates,
        onSuccess: () => setInput(''),
    });
    const remove = useApiMutation({
        mutationFn: (token) => api.removeManager(id, token),
        invalidates,
    });

    async function onRemove(token) {
        const ok = await confirm({
            title: t('groups.managers.removeTitle'),
            confirmLabel: t('groups.managers.removeConfirm'),
            message: t('groups.managers.removeMessage', { manager: token }),
        });
        if (ok) remove.mutate(token);
    }

    return (
        <Paper p="lg" radius="md" withBorder>
            <Alert variant="light" color="gray" mb="md">{t('groups.managers.hint')}</Alert>
            <Group align="flex-end" gap="xs">
                <div style={{ flex: '1 1 280px' }}>
                    <PrincipalTokenAutocomplete single label={t('groups.managers.add')} placeholder={t('groups.managers.placeholder')}
                        value={input} onChange={setInput} search={api.searchPrincipals} searchKey={groupsKeys.principals()} />
                </div>
                <Button leftSection={<Plus size={16} />} disabled={!asToken(input)} loading={add.isPending} onClick={() => add.mutate(asToken(input))}>
                    {t('groups.managers.addButton')}
                </Button>
            </Group>
            <Table striped mt="md">
                <Table.Tbody>
                    {managers.length === 0 && (
                        <Table.Tr><Table.Td><Text size="sm" c="dimmed">{t('groups.managers.none')}</Text></Table.Td></Table.Tr>
                    )}
                    {managers.map(m => (
                        <Table.Tr key={m.token}>
                            <Table.Td><TokenText token={m.token} /></Table.Td>
                            <Table.Td><Text size="xs" c="dimmed">{m.created_by ? t('groups.managers.addedBy', { who: m.created_by, date: formatDate(m.created_at) }) : formatDate(m.created_at)}</Text></Table.Td>
                            <Table.Td align="right">
                                <Button size="xs" variant="subtle" color="red" leftSection={<Trash2 size={14} />}
                                    loading={remove.isPending && remove.variables === m.token} onClick={() => onRemove(m.token)}>
                                    {t('groups.managers.remove')}
                                </Button>
                            </Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
        </Paper>
    );
}

// History: who changed what, newest first; an admin acting for somebody is named with that person.
function History({ id }) {
    const { t } = useTranslation();
    const api = useGroupsApi();
    const history = useQuery({ queryKey: groupsKeys.history(id), queryFn: () => api.history(id) });
    if (history.isPending) return <Loading />;
    if (history.isError) return <LoadError query={history} />;
    return (
        <Paper p="lg" radius="md" withBorder>
            <Table striped>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>{t('groups.history.at')}</Table.Th>
                        <Table.Th>{t('groups.history.who')}</Table.Th>
                        <Table.Th>{t('groups.history.what')}</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {history.data.length === 0 && (
                        <Table.Tr><Table.Td colSpan={3}><Text size="sm" c="dimmed">{t('groups.history.none')}</Text></Table.Td></Table.Tr>
                    )}
                    {history.data.map(c => (
                        <Table.Tr key={c.id}>
                            <Table.Td><Text size="sm">{formatDateTime(c.at)}</Text></Table.Td>
                            <Table.Td>
                                <Text size="sm">{actorText(t, c.actor)}</Text>
                                {c.on_behalf_of && <Text size="xs" c="dimmed">{t('groups.history.onBehalf', { who: c.on_behalf_of })}</Text>}
                            </Table.Td>
                            <Table.Td><ChangeText change={c} /></Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
        </Paper>
    );
}

function actorText(t, actor) {
    if (actor === 'api-token') return t('groups.history.apiToken');
    if (actor === 'system') return t('groups.history.system');
    return actor;
}

// ChangeText: one history entry as a sentence. Every action has its own key, so German can order the parts its own way.
function ChangeText({ change: c }) {
    const { t } = useTranslation();
    const values = {
        member: c.member ?? '',
        relation: relationText(t, c.relation),
        date: c.expires_at ? formatDate(c.expires_at) : '',
        detail: c.detail ?? '',
    };
    const key = c.action === 'member_added' && c.expires_at ? 'member_added_until' : c.action;
    return <Text size="sm">{t(`groups.history.actions.${key}`, { ...values, defaultValue: c.action })}</Text>;
}
