import { useCallback, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '@mantine/hooks';
import { ActionIcon, Badge, Button, Group, Paper, Table, Text, Title, Tooltip } from '@mantine/core';
import { Database, ListTree, Plus, Users } from 'lucide-react';
import { MasterDetail } from '/helper/master-detail.jsx';
import { NavTree, TreeFilter, useExpandAll, useTreeExpansion } from '/helper/tree.jsx';
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

// A node of the tree is named by its path from the source ("source:dualis/dualis-standort-mannheim/…"), as a group shows up under every group it is entered in; its children are the source's top groups or the group's groups.
const SOURCE = 'source:';
const listParams = (path) => (path.includes('/') ? { parent: path.slice(path.lastIndexOf('/') + 1), limit: LIMIT } : { source: path.slice(SOURCE.length), limit: LIMIT });

// GroupsBrowser: what admins see. Every source as a section of the tree on the left (helper/tree.jsx's NavTree), its groups loaded as a branch opens, a group under every group it is entered in, and the selected group on the right, read-only where it belongs to a sync source. Without a selection the right side lists the sources. A search asks the server and lists the matches flat.
export function GroupsBrowser({ params }) {
    const { t } = useTranslation();
    const api = useGroupsApi();
    const [, navigate] = useLocation();
    const selectedId = params?.id ? decodeURIComponent(params.id) : null;
    const [search, setSearch] = useState('');
    const [q] = useDebouncedValue(search.trim(), 250);
    // Branches the viewer opened, remembered per browser, by their path from the source.
    const expansion = useTreeExpansion({ storageKey: 'self-service.groups-tree.expanded' });
    const select = (id) => navigate(`/${encodeURIComponent(id)}`);
    const queryClient = useQueryClient();
    // The tree path last revealed: the tree scrolls to its row once its branch has loaded.
    const [revealed, setRevealed] = useState(null);

    // Shows a group in the tree: opens every branch on the way down from its source, leaves the search and selects it.
    const reveal = async (id) => {
        const params = { pathTo: id };
        const way = await queryClient.fetchQuery({ queryKey: groupsKeys.list(params), queryFn: () => api.listGroups(params) });
        const ids = way.items.map(g => g.id);
        const source = way.items[0]?.source_name;
        if (!source) return;
        const paths = ids.map((_, i) => [SOURCE + source, ...ids.slice(0, i + 1)].join('/'));
        expansion.expand([SOURCE + source, ...paths.slice(0, -1)]);
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
    // One query per open branch, fetched as it opens; `combine` keeps its identity while the open paths stay the same, so the nodes are not built anew on every render.
    const openedKey = expansion.opened.join('\n');
    const opened = useMemo(() => (openedKey ? openedKey.split('\n') : []), [openedKey]);
    const combine = useCallback((results) => Object.fromEntries(opened.map((path, i) => [path, { data: results[i].data, pending: results[i].isPending, error: results[i].error }])), [opened]);
    const branches = useQueries({
        queries: opened.map(path => ({ queryKey: groupsKeys.list(listParams(path)), queryFn: () => api.listGroups(listParams(path)) })),
        combine,
    });

    const nodes = useMemo(() => {
        // The loaded children of an open branch, with a note where the server has more than it sent.
        const kids = (path, sourceName) => {
            const page = branches[path]?.data;
            if (!page) return undefined;
            const rows = page.items.map(g => groupNode(g, `${path}/${g.id}`, sourceName));
            if (page.total > page.items.length) rows.push({ id: `${path}::more`, label: t('groups.browser.more', { count: page.total - page.items.length }), more: {} });
            return rows;
        };
        const state = (path) => ({ loading: !!branches[path]?.pending, error: branches[path]?.error ?? null });
        const groupNode = (g, path, sourceName) => ({
            id: path, value: g.id, label: g.id, sub: shortDescription(g), icon: <Users size={14} />,
            count: g.child_groups || null,
            // A group of another source entered here, such as a Dualis course in a ZWR course, says where it comes from.
            badge: g.source_name && g.source_name !== sourceName ? <Badge size="xs" variant="light" color="gray">{g.source_name}</Badge> : null,
            hasChildren: g.child_groups > 0, children: kids(path, g.source_name), ...state(path),
        });
        return (sources.data ?? []).map(src => ({
            id: SOURCE + src.name, label: src.name, section: true, icon: <Database size={14} />, count: src.groups,
            badge: src.local ? null : <Badge size="xs" variant="light" color="gray">{src.type}</Badge>,
            hasChildren: src.groups > 0, children: kids(SOURCE + src.name, src.name), ...state(SOURCE + src.name),
        }));
    }, [sources.data, branches, t]);
    const expandAll = useExpandAll(expansion, nodes);

    return (
        <MasterDetail
            filter={<TreeFilter value={search} onChange={setSearch} onClear={clearSearch} label={t('groups.browser.search')} clearLabel={t('groups.browser.clear')} expandAll={expandAll} />}
            master={q
                ? <SearchResults q={q} selectedId={selectedId} onSelect={select} onReveal={(id) => reveal(id).catch(() => {})} />
                : (
                    <>
                        {sources.isPending && <Loading />}
                        {sources.isError && <LoadError query={sources} />}
                        <NavTree label={t('groups.list.title')} nodes={nodes} expansion={expansion} withLines openOnSelect
                            selectedId={selectedId} onSelect={n => select(n.value)} scrollTo={revealed} />
                    </>
                )}
            detail={selectedId
                ? <GroupDetail key={selectedId} params={{ id: selectedId }} embedded />
                : <SourcesOverview sources={sources} />} />
    );
}

// SearchResults: matches from every source, flat, each with its source and a way to its place in the tree.
function SearchResults({ q, selectedId, onSelect, onReveal }) {
    const { t } = useTranslation();
    const api = useGroupsApi();
    const params = { q, limit: 200 };
    const results = useQuery({ queryKey: groupsKeys.list(params), queryFn: () => api.listGroups(params), placeholderData: (prev) => prev });
    if (results.isPending) return <Loading />;
    if (results.isError) return <LoadError query={results} />;
    if (results.data.items.length === 0) return <Text size="sm" c="dimmed" p="xs">{t('groups.list.noMatch')}</Text>;
    const nodes = results.data.items.map(g => ({
        id: g.id, label: g.id, sub: shortDescription(g), icon: <Users size={14} />,
        badge: <Badge size="xs" variant="light" color="gray">{g.source_name}</Badge>,
        action: (
            <Tooltip label={t('groups.browser.showInTree')}>
                <ActionIcon size="sm" variant="subtle" color="gray" aria-label={t('groups.browser.showInTree')}
                    onClick={(e) => { e.stopPropagation(); onReveal(g.id); }}>
                    <ListTree size={14} />
                </ActionIcon>
            </Tooltip>
        ),
    }));
    if (results.data.total > results.data.items.length) nodes.push({ id: '::more', label: t('groups.browser.more', { count: results.data.total - results.data.items.length }), more: {} });
    return <NavTree label={t('groups.browser.search')} nodes={nodes} selectedId={selectedId} onSelect={n => onSelect(n.id)} />;
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
