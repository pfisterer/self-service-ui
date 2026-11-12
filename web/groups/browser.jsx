import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '@mantine/hooks';
import { ActionIcon, Badge, Box, Button, Group, Loader, Paper, Table, Text, Title, Tooltip } from '@mantine/core';
import { Database, ListTree, Plus, Users } from 'lucide-react';
import { MasterDetail } from '/helper/master-detail.jsx';
import { Tree, TREE_INDENT, TreeFilter, TreeRow as Row, TreeSection, usePathExpansion as useTreeExpansion } from '/helper/tree.jsx';
import { formatDateTime } from '/format-date.js';
import { LoadError, Loading } from '/helper/query-state.jsx';
import { useGroupsApi } from '/groups/api-groups.jsx';
import { groupsKeys } from '/groups/query-keys.js';
import { GroupDetail } from '/groups/detail.jsx';
import { CreateGroupModal } from '/groups/list.jsx';

// Up to this many groups are listed under one node; no group of today's sources holds more than about sixty.
const LIMIT = 1000;

// The first two parts of a description, which for imported groups say what and where the group is ("Fakultät Technik · DHBW Mannheim", "Kurs MA-TMB24A · Maschinenbau"); the rest is shown with the group.
const shortDescription = (g) => (g.description ?? '').split(' · ').slice(0, 2).join(' · ');

// GroupsBrowser: what admins see. Every source as a tree on the left — a group shows up under every group it is entered in — and the selected group on the right, read-only where it belongs to a sync source. Without a selection the right side lists the sources.
export function GroupsBrowser({ params }) {
    const { t } = useTranslation();
    const api = useGroupsApi();
    const [, navigate] = useLocation();
    const selectedId = params?.id ? decodeURIComponent(params.id) : null;
    const [search, setSearch] = useState('');
    const [q] = useDebouncedValue(search.trim(), 250);
    // Branches the viewer opened, remembered per browser, by their path from the source (a group can sit in several places).
    const { isOpen, toggle, expand } = useTreeExpansion({ storageKey: 'self-service.groups-tree.expanded' });
    const select = (id) => navigate(`/${encodeURIComponent(id)}`);
    const queryClient = useQueryClient();
    // The tree path last revealed: its row scrolls into view once its branch has loaded.
    const [revealed, setRevealed] = useState(null);

    // Shows a group in the tree: opens every branch on the way down from its source, leaves the search and selects it.
    const reveal = async (id) => {
        const params = { pathTo: id };
        const way = await queryClient.fetchQuery({ queryKey: groupsKeys.list(params), queryFn: () => api.listGroups(params) });
        const ids = way.items.map(g => g.id);
        const source = way.items[0]?.source_name;
        if (!source) return;
        const paths = ids.map((_, i) => ['source:' + source, ...ids.slice(0, i + 1)].join('/'));
        expand(['source:' + source, ...paths.slice(0, -1)]);
        setRevealed(paths.at(-1));
        setSearch('');
        select(id);
    };
    // Leaving the search shows the group picked in it where it sits in the tree.
    const clearSearch = () => {
        setSearch('');
        if (selectedId) reveal(selectedId).catch(() => {});
    };

    const sources = useQuery({ queryKey: groupsKeys.sources(), queryFn: () => api.listSources() });

    return (
        <MasterDetail
            filter={<TreeFilter value={search} onChange={setSearch} onClear={clearSearch} label={t('groups.browser.search')} clearLabel={t('groups.browser.clear')} />}
            master={q
                ? <SearchResults q={q} selectedId={selectedId} onSelect={select} onReveal={(id) => reveal(id).catch(() => {})} />
                : (
                    <Tree label={t('groups.list.title')}>
                        {sources.isPending && <Loading />}
                        {sources.isError && <LoadError query={sources} />}
                        {sources.data?.map(src => (
                            <SourceNode key={src.name} source={src} isOpen={isOpen} toggle={toggle} selectedId={selectedId} onSelect={select} revealed={revealed} />
                        ))}
                    </Tree>
                )}
            detail={selectedId
                ? <GroupDetail key={selectedId} params={{ id: selectedId }} embedded />
                : <SourcesOverview sources={sources} />} />
    );
}

function SourceNode({ source, isOpen, toggle, selectedId, onSelect, revealed }) {
    const path = `source:${source.name}`;
    const opened = isOpen(path);
    return (
        <TreeSection open={opened} openable={source.groups > 0} onToggle={() => toggle(path)}
            icon={<Database size={14} />} label={source.name} count={source.groups}
            badge={source.local ? null : <Badge size="xs" variant="light" color="gray">{source.type}</Badge>}>
            <Children params={{ source: source.name, limit: LIMIT }} path={path} depth={1} sourceName={source.name}
                isOpen={isOpen} toggle={toggle} selectedId={selectedId} onSelect={onSelect} revealed={revealed} />
        </TreeSection>
    );
}

// Children: the groups under a source or a group, fetched when the branch opens. `through` is null for a source's top groups, which get no guide lines, else the levels above whose lines pass by (TreeRow's lines).
function Children({ params, path, depth, through = null, sourceName, isOpen, toggle, selectedId, onSelect, revealed }) {
    const api = useGroupsApi();
    const { t } = useTranslation();
    const children = useQuery({ queryKey: groupsKeys.list(params), queryFn: () => api.listGroups(params) });
    if (children.isPending) return <Box pl={depth * TREE_INDENT + 24} py={4}><Loader size="xs" /></Box>;
    if (children.isError) return <Box pl={depth * TREE_INDENT + 24}><LoadError query={children} /></Box>;
    return (
        <>
            {children.data.items.map((g, i, list) => (
                <GroupNode key={g.id} group={g} path={`${path}/${g.id}`} depth={depth} sourceName={sourceName}
                    lines={through ? { through, last: i === list.length - 1 } : null}
                    isOpen={isOpen} toggle={toggle} selectedId={selectedId} onSelect={onSelect} revealed={revealed} />
            ))}
            {children.data.total > children.data.items.length && (
                <Text size="xs" c="dimmed" pl={depth * TREE_INDENT + 24}>{t('groups.browser.more', { count: children.data.total - children.data.items.length })}</Text>
            )}
        </>
    );
}

function GroupNode({ group, path, depth, lines, sourceName, isOpen, toggle, selectedId, onSelect, revealed }) {
    const opened = isOpen(path);
    const row = useRef(null);
    useEffect(() => {
        if (revealed === path) row.current?.scrollIntoView?.({ block: 'center' });
    }, [revealed, path]);
    // A group of another source entered here, such as a Dualis course in a ZWR course, says where it comes from.
    const foreign = group.source_name && group.source_name !== sourceName;
    return (
        <>
            <Row rowRef={row} depth={depth} lines={lines} open={opened} openable={group.child_groups > 0} onToggle={() => toggle(path)}
                onClick={() => { onSelect(group.id); if (group.child_groups > 0 && !opened) toggle(path); }}
                selected={group.id === selectedId} icon={<Users size={14} />} label={group.id} sub={shortDescription(group)}
                count={group.child_groups || null}
                badge={foreign ? <Badge size="xs" variant="light" color="gray">{group.source_name}</Badge> : null} />
            {opened && <Children params={{ parent: group.id, limit: LIMIT }} path={path} depth={depth + 1} through={lines ? [...lines.through, !lines.last] : []} sourceName={group.source_name}
                isOpen={isOpen} toggle={toggle} selectedId={selectedId} onSelect={onSelect} revealed={revealed} />}
        </>
    );
}

// SearchResults: matches from every source, flat, each with its source.
function SearchResults({ q, selectedId, onSelect, onReveal }) {
    const { t } = useTranslation();
    const api = useGroupsApi();
    const params = { q, limit: 200 };
    const results = useQuery({ queryKey: groupsKeys.list(params), queryFn: () => api.listGroups(params), placeholderData: (prev) => prev });
    if (results.isPending) return <Loading />;
    if (results.isError) return <LoadError query={results} />;
    if (results.data.items.length === 0) return <Text size="sm" c="dimmed" p="xs">{t('groups.list.noMatch')}</Text>;
    return (
        <Tree label={t('groups.browser.search')}>
            {results.data.items.map(g => (
                <Row key={g.id} depth={0} onClick={() => onSelect(g.id)} selected={g.id === selectedId} icon={<Users size={14} />}
                    label={g.id} sub={shortDescription(g)} badge={<Badge size="xs" variant="light" color="gray">{g.source_name}</Badge>}
                    action={(
                        <Tooltip label={t('groups.browser.showInTree')}>
                            <ActionIcon size="sm" variant="subtle" color="gray" aria-label={t('groups.browser.showInTree')}
                                onClick={(e) => { e.stopPropagation(); onReveal(g.id); }}>
                                <ListTree size={14} />
                            </ActionIcon>
                        </Tooltip>
                    )} />
            ))}
            {results.data.total > results.data.items.length && (
                <Text size="xs" c="dimmed" p="xs">{t('groups.browser.more', { count: results.data.total - results.data.items.length })}</Text>
            )}
        </Tree>
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
