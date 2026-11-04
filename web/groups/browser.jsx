import { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue, useLocalStorage } from '@mantine/hooks';
import { Badge, Box, Button, Container, Grid, Group, Loader, Paper, ScrollArea, Stack, Table, Text, TextInput, Title, UnstyledButton } from '@mantine/core';
import { ChevronRight, Database, Plus, Search, Users } from 'lucide-react';
import { formatDateTime } from '/format-date.js';
import { LoadError, Loading } from '/helper/query-state.jsx';
import { useGroupsApi } from '/groups/api-groups.jsx';
import { groupsKeys } from '/groups/query-keys.js';
import { GroupDetail } from '/groups/detail.jsx';
import { CreateGroupModal } from '/groups/list.jsx';

// Up to this many groups are listed under one node; no group of today's sources holds more than about sixty.
const LIMIT = 1000;

// The first part of a description, which for imported groups says what the group is ("Fakultät Technik", "Maschinenbau", "Kurs MA-TMB24A"); the rest is shown with the group.
const shortDescription = (g) => (g.description ?? '').split(' · ')[0];

// GroupsBrowser: what admins see. Every source as a tree on the left — a group shows up under every group it is entered in — and the selected group on the right, read-only where it belongs to a sync source. Without a selection the right side lists the sources.
export function GroupsBrowser({ params }) {
    const { t } = useTranslation();
    const api = useGroupsApi();
    const [, navigate] = useLocation();
    const selectedId = params?.id ? decodeURIComponent(params.id) : null;
    const [search, setSearch] = useState('');
    const [q] = useDebouncedValue(search.trim(), 250);
    // Branches the viewer opened, remembered per browser, by their path from the source (a group can sit in several places).
    const [expanded, setExpanded] = useLocalStorage({ key: 'self-service.groups-tree.expanded', defaultValue: [], getInitialValueInEffect: false });
    const open = new Set(expanded);
    const toggle = (path) => setExpanded(prev => (prev.includes(path) ? prev.filter(p => p !== path && !p.startsWith(`${path}/`)) : [...prev, path]));
    const select = (id) => navigate(`/${encodeURIComponent(id)}`);

    const sources = useQuery({ queryKey: groupsKeys.sources(), queryFn: () => api.listSources() });

    return (
        <Container size="xl" py="md">
            <Grid gutter="md">
                <Grid.Col span={{ base: 12, md: 4 }}>
                    <Paper p="sm" radius="md" withBorder>
                        <TextInput leftSection={<Search size={14} />} value={search} mb="sm"
                            placeholder={t('groups.browser.search')} aria-label={t('groups.browser.search')}
                            onChange={e => setSearch(e.currentTarget.value)} />
                        <ScrollArea.Autosize mah="calc(100vh - 220px)" type="auto" offsetScrollbars>
                            {q
                                ? <SearchResults q={q} selectedId={selectedId} onSelect={select} />
                                : (
                                    <>
                                        {sources.isPending && <Loading />}
                                        {sources.isError && <LoadError query={sources} />}
                                        {sources.data?.map(src => (
                                            <SourceNode key={src.name} source={src} open={open} toggle={toggle} selectedId={selectedId} onSelect={select} />
                                        ))}
                                    </>
                                )}
                        </ScrollArea.Autosize>
                    </Paper>
                </Grid.Col>
                <Grid.Col span={{ base: 12, md: 8 }}>
                    {selectedId
                        ? <GroupDetail key={selectedId} params={{ id: selectedId }} embedded />
                        : <SourcesOverview sources={sources} />}
                </Grid.Col>
            </Grid>
        </Container>
    );
}

function SourceNode({ source, open, toggle, selectedId, onSelect }) {
    const path = `source:${source.name}`;
    const isOpen = open.has(path);
    return (
        <>
            <Row depth={0} open={isOpen} openable={source.groups > 0} onToggle={() => toggle(path)} onClick={() => toggle(path)}
                icon={<Database size={14} />} label={source.name} count={source.groups}
                badge={source.local ? null : <Badge size="xs" variant="light" color="gray">{source.type}</Badge>} />
            {isOpen && <Children params={{ source: source.name, limit: LIMIT }} path={path} depth={1} sourceName={source.name}
                open={open} toggle={toggle} selectedId={selectedId} onSelect={onSelect} />}
        </>
    );
}

// Children: the groups under a source or a group, fetched when the branch opens.
function Children({ params, path, depth, sourceName, open, toggle, selectedId, onSelect }) {
    const api = useGroupsApi();
    const { t } = useTranslation();
    const children = useQuery({ queryKey: groupsKeys.list(params), queryFn: () => api.listGroups(params) });
    if (children.isPending) return <Box pl={depth * 18 + 24} py={4}><Loader size="xs" /></Box>;
    if (children.isError) return <Box pl={depth * 18 + 24}><LoadError query={children} /></Box>;
    return (
        <>
            {children.data.items.map(g => (
                <GroupNode key={g.id} group={g} path={`${path}/${g.id}`} depth={depth} sourceName={sourceName}
                    open={open} toggle={toggle} selectedId={selectedId} onSelect={onSelect} />
            ))}
            {children.data.total > children.data.items.length && (
                <Text size="xs" c="dimmed" pl={depth * 18 + 24}>{t('groups.browser.more', { count: children.data.total - children.data.items.length })}</Text>
            )}
        </>
    );
}

function GroupNode({ group, path, depth, sourceName, open, toggle, selectedId, onSelect }) {
    const isOpen = open.has(path);
    // A group of another source entered here, such as a Dualis course in a ZWR course, says where it comes from.
    const foreign = group.source_name && group.source_name !== sourceName;
    return (
        <>
            <Row depth={depth} open={isOpen} openable={group.child_groups > 0} onToggle={() => toggle(path)}
                onClick={() => { onSelect(group.id); if (group.child_groups > 0 && !isOpen) toggle(path); }}
                selected={group.id === selectedId} icon={<Users size={14} />} label={group.id} sub={shortDescription(group)}
                count={group.child_groups || null}
                badge={foreign ? <Badge size="xs" variant="light" color="gray">{group.source_name}</Badge> : null} />
            {isOpen && <Children params={{ parent: group.id, limit: LIMIT }} path={path} depth={depth + 1} sourceName={group.source_name}
                open={open} toggle={toggle} selectedId={selectedId} onSelect={onSelect} />}
        </>
    );
}

// Row: one line of the tree. The arrow opens and closes; the line itself selects (a group) or opens (a source).
function Row({ depth, open, openable, onToggle, onClick, selected, icon, label, sub, count, badge }) {
    const { t } = useTranslation();
    return (
        <Group gap={4} wrap="nowrap" pl={depth * 18} pr={6} py={3} onClick={onClick}
            style={{ cursor: 'pointer', borderRadius: 'var(--mantine-radius-sm)', background: selected ? 'var(--mantine-color-blue-light)' : undefined }}>
            {openable
                ? (
                    <UnstyledButton aria-label={t(open ? 'projects.tree.collapse' : 'projects.tree.expand')}
                        onClick={(e) => { e.stopPropagation(); onToggle(); }} style={{ display: 'flex' }}>
                        <ChevronRight size={14} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 150ms ease' }} />
                    </UnstyledButton>
                )
                : <Box w={14} style={{ flexShrink: 0 }} />}
            <Box c="dimmed" style={{ display: 'flex', flexShrink: 0 }}>{icon}</Box>
            <Box style={{ flex: 1, minWidth: 0 }}>
                <Text size="sm" truncate fw={selected ? 600 : 400}>{label}</Text>
                {sub && <Text size="xs" c="dimmed" truncate>{sub}</Text>}
            </Box>
            {badge}
            {count != null && <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>{count}</Text>}
        </Group>
    );
}

// SearchResults: matches from every source, flat, each with its source.
function SearchResults({ q, selectedId, onSelect }) {
    const { t } = useTranslation();
    const api = useGroupsApi();
    const params = { q, limit: 200 };
    const results = useQuery({ queryKey: groupsKeys.list(params), queryFn: () => api.listGroups(params), placeholderData: (prev) => prev });
    if (results.isPending) return <Loading />;
    if (results.isError) return <LoadError query={results} />;
    if (results.data.items.length === 0) return <Text size="sm" c="dimmed" p="xs">{t('groups.list.noMatch')}</Text>;
    return (
        <Stack gap={0}>
            {results.data.items.map(g => (
                <Row key={g.id} depth={0} onClick={() => onSelect(g.id)} selected={g.id === selectedId} icon={<Users size={14} />}
                    label={g.id} sub={shortDescription(g)} badge={<Badge size="xs" variant="light" color="gray">{g.source_name}</Badge>} />
            ))}
            {results.data.total > results.data.items.length && (
                <Text size="xs" c="dimmed" p="xs">{t('groups.browser.more', { count: results.data.total - results.data.items.length })}</Text>
            )}
        </Stack>
    );
}

// SourcesOverview: where the groups come from, and the way to a new one (always in the local source).
function SourcesOverview({ sources }) {
    const { t } = useTranslation();
    const [creating, setCreating] = useState(false);
    const local = sources.data?.find(s => s.local);
    return (
        <Paper p="lg" radius="md" withBorder>
            <Group justify="space-between" align="flex-start" wrap="wrap">
                <div>
                    <Title order={3}>{t('groups.list.title')}</Title>
                    <Text size="sm" c="dimmed">{t('groups.browser.intro', { source: local?.name ?? '' })}</Text>
                </div>
                <Button leftSection={<Plus size={16} />} onClick={() => setCreating(true)}>{t('groups.list.create')}</Button>
            </Group>
            {sources.data && (
                <Table mt="md" striped>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>{t('groups.browser.source')}</Table.Th>
                            <Table.Th>{t('groups.browser.kind')}</Table.Th>
                            <Table.Th>{t('groups.browser.groups')}</Table.Th>
                            <Table.Th>{t('groups.browser.lastSync')}</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {sources.data.map(s => (
                            <Table.Tr key={s.name}>
                                <Table.Td><Text size="sm" fw={500}>{s.name}</Text></Table.Td>
                                <Table.Td><Text size="sm">{s.local ? t('groups.browser.local') : t('groups.browser.synced', { type: s.type })}</Text></Table.Td>
                                <Table.Td>{s.groups}</Table.Td>
                                <Table.Td><Text size="sm">{s.last_synced_at ? formatDateTime(s.last_synced_at) : '–'}</Text></Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            )}
            {creating && <CreateGroupModal onClose={() => setCreating(false)} />}
        </Paper>
    );
}
