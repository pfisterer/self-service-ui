import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '@mantine/hooks';
import { Anchor, Badge, Button, Container, Group, Modal, Paper, Stack, Table, Text, TextInput, Textarea, Title } from '@mantine/core';
import { Plus, Search } from 'lucide-react';
import { LoadError, Loading, useApiMutation } from '/helper/query-state.jsx';
import { PrincipalTokenAutocomplete } from '/helper/principal-token-autocomplete.jsx';
import { useGroupsApi } from '/groups/api-groups.jsx';
import { groupsKeys } from '/groups/query-keys.js';
import { useGroupsMe } from '/groups/use-groups-me.jsx';
import { TokenChips } from '/groups/tokens.jsx';

// The same shape the service accepts (common.GroupIDPattern), checked here so the button says it before the server does.
export const GROUP_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;

// GroupsList: the groups the caller maintains, with a search. Admins get the browser over every source instead (browser.jsx).
export function GroupsList() {
    const { t } = useTranslation();
    const api = useGroupsApi();
    const { isAdmin, sourceName } = useGroupsMe();
    const [search, setSearch] = useState('');
    const [q] = useDebouncedValue(search.trim(), 250);
    const [creating, setCreating] = useState(false);

    const groups = useQuery({ queryKey: groupsKeys.list({ q }), queryFn: () => api.listGroups({ q }), placeholderData: (prev) => prev });

    return (
        <Container size="lg" py="md">
            <Stack gap="lg">
                <Paper p="lg" radius="md" withBorder>
                    <Group justify="space-between" align="flex-end" wrap="wrap">
                        <div>
                            <Title order={3}>{t('groups.list.title')}</Title>
                            <Text size="sm" c="dimmed">{isAdmin ? t('groups.list.introAdmin', { source: sourceName }) : t('groups.list.intro')}</Text>
                        </div>
                        <Group gap="xs" wrap="nowrap">
                            <TextInput w={260} leftSection={<Search size={14} />} value={search}
                                placeholder={t('groups.list.search')} aria-label={t('groups.list.search')}
                                onChange={e => setSearch(e.currentTarget.value)} />
                            {isAdmin && (
                                <Button leftSection={<Plus size={16} />} onClick={() => setCreating(true)}>{t('groups.list.create')}</Button>
                            )}
                        </Group>
                    </Group>

                    {groups.isPending && <Loading />}
                    {groups.isError && <LoadError query={groups} />}
                    {groups.data && (
                        <Table striped highlightOnHover mt="md">
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>{t('groups.list.group')}</Table.Th>
                                    <Table.Th>{t('groups.list.description')}</Table.Th>
                                    <Table.Th>{t('groups.list.roles')}</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {groups.data.items.length === 0 && (
                                    <Table.Tr><Table.Td colSpan={3}><Text size="sm" c="dimmed">{q ? t('groups.list.noMatch') : t('groups.list.none')}</Text></Table.Td></Table.Tr>
                                )}
                                {groups.data.items.map(g => (
                                    <Table.Tr key={g.id}>
                                        <Table.Td>
                                            <Anchor component={Link} to={`/${encodeURIComponent(g.id)}`} fw={500}>{g.id}</Anchor>
                                            {g.display_name && g.display_name !== g.id && <Text size="xs" c="dimmed">{g.display_name}</Text>}
                                        </Table.Td>
                                        <Table.Td><Text size="sm">{g.description}</Text></Table.Td>
                                        <Table.Td>
                                            <Group gap={4}>
                                                {(g.relations ?? []).map(r => <Badge key={r} size="xs" variant="light">{r}</Badge>)}
                                            </Group>
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    )}
                </Paper>
            </Stack>
            {creating && <CreateGroupModal onClose={() => setCreating(false)} />}
        </Container>
    );
}

// CreateGroupModal: id, name, description and who maintains the new group. The id is the token every rule will name, so it is fixed at creation; name and description can change later.
export function CreateGroupModal({ onClose }) {
    const { t } = useTranslation();
    const api = useGroupsApi();
    const [, navigate] = useLocation();
    const [id, setId] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [description, setDescription] = useState('');
    const [managers, setManagers] = useState([]);
    const [managerInput, setManagerInput] = useState('');

    const normalizedId = id.trim().toLowerCase();
    const create = useApiMutation({
        mutationFn: () => api.createGroup({ id: normalizedId, displayName: displayName.trim(), description: description.trim(), managers }),
        invalidates: [groupsKeys.all()],
        onSuccess: (g) => { onClose(); navigate(`/${encodeURIComponent(g.id)}`); },
    });
    const idOk = GROUP_ID.test(normalizedId);

    return (
        <Modal opened onClose={onClose} title={t('groups.create.title')} size="lg" centered>
            <Stack gap="sm">
                <TextInput label={t('groups.create.id')} description={t('groups.create.idHint')} required data-autofocus
                    value={id} onChange={e => setId(e.currentTarget.value)}
                    error={id && !idOk ? t('groups.create.idInvalid') : null} />
                <TextInput label={t('groups.create.displayName')} value={displayName} onChange={e => setDisplayName(e.currentTarget.value)} />
                <Textarea label={t('groups.create.description')} autosize minRows={2} value={description} onChange={e => setDescription(e.currentTarget.value)} />
                <div>
                    <PrincipalTokenAutocomplete label={t('groups.create.managers')} placeholder={t('groups.managers.placeholder')}
                        value={managerInput} onChange={setManagerInput}
                        search={api.searchPrincipals} searchKey={groupsKeys.principals()}
                        onSelect={(token) => token && !managers.includes(token) && setManagers([...managers, token])} />
                    <Text size="xs" c="dimmed" mt={4}>{t('groups.create.managersHint')}</Text>
                    <TokenChips tokens={managers} onRemove={(token) => setManagers(managers.filter(m => m !== token))} mt="xs" />
                </div>
                <Group justify="flex-end" mt="md">
                    <Button variant="default" onClick={onClose}>{t('groups.cancel')}</Button>
                    <Button disabled={!idOk} loading={create.isPending} onClick={() => create.mutate()}>{t('groups.create.submit')}</Button>
                </Group>
            </Stack>
        </Modal>
    );
}
