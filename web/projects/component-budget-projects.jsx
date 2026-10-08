import { useState } from 'react';
import { ArrowDown, ArrowRightLeft, ArrowUp, ArrowUpDown, Check, Eye, FolderInput, Gift, MoreHorizontal, Pencil, Rocket, Search, Trash2, X } from 'lucide-react';
import { ActionIcon, Badge, Group, Loader, Menu, MultiSelect, Pagination, Paper, SegmentedControl, Stack, Switch, Table, Text, TextInput, Title, Tooltip, UnstyledButton, VisuallyHidden } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { DeletingBadge, InfoPopover, NodeStatusBadge } from './component-common.jsx';
import { ProjectsPrincipalAutocomplete } from './principal-search.jsx';
import { COLOR, deletesOnRequest, deletionRequested, effectiveLimit, isRetired, expiryTone, expiryValue, hasAllocations, nodeTitle, ownerEmail, projectActions, resourceSummaryText, statusLabel } from './util-project.jsx';
import { useProjectConfig } from './projects.jsx';
import { LoadError } from '/helper/query-state.jsx';
import { budgetPathText } from './component-budget-path.jsx';
import { ProjectResources } from './component-project-resources.jsx';

// Rows per page. A table, unlike the tree it replaces for projects, pages
// instead of growing: a budget for all students of a location holds hundreds.
const TABLE_PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

// The statuses a project can be filtered by, in the order a manager thinks
// about them: what runs, what waits, what came from outside, what is gone.
const FILTER_STATUSES = ['approved', 'pending', 'change_pending', 'imported', 'rejected', 'released', 'archived'];

// BudgetProjectsTable lists the projects paid from one budget, under the
// budget's card in My Budgets. Filtering, sorting and paging happen on the
// server; the table holds one page. Each row carries the actions the project
// card offers (projectActions decides both), the frequent ones as icons and the
// rarer ones in a menu; clicking a row opens the full card.
//
// allocatedOnly switches the table from the budget's own projects to the ones
// anywhere below that draw an allocation from it — the exceptions its managers
// handed out past the budgets in between. Controlled by the view, so the
// budget card's "allocations" line can switch it on.
export function BudgetProjectsTable({ budget, resources, onAction, onOpen, allocatedOnly = false, onAllocatedOnlyChange }) {
    const { t } = useTranslation();
    const api = useNodesApi();

    const [search, setSearch] = useState('');
    const [statuses, setStatuses] = useState([]);
    const [group, setGroup] = useState('');
    const [groupDraft, setGroupDraft] = useState('');
    const [groupMode, setGroupMode] = useState('access');
    const [sort, setSort] = useState({ key: 'name', order: 'asc' });
    const [page, setPage] = useState(1);
    // Projects of the sub-budgets too: a budget that only structures its
    // sub-budgets has no projects of its own and would show an empty table.
    const [deep, setDeep] = useState(false);
    const [q] = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);

    // Every filter change starts over at the first page: page 7 of the old
    // result means nothing for the new one.
    const refilter = (apply) => (value) => { apply(value); setPage(1); };

    const params = { q, status: statuses, group, groupMode, sort: sort.key, order: sort.order, page, allocated: allocatedOnly, deep };
    const query = useQuery({
        queryKey: projectKeys.budgetProjects(budget.id, params),
        queryFn: () => api.listChildren(budget.id, {
            kind: 'project', q, status: statuses, group, groupMode, allocated: allocatedOnly, deep: deep && !allocatedOnly,
            sort: sort.key, order: sort.order,
            limit: TABLE_PAGE_SIZE, offset: (page - 1) * TABLE_PAGE_SIZE,
        }),
        enabled: !!api,
        // Keep the old rows while the next page or filter loads, so the table
        // does not collapse to nothing on every keystroke.
        placeholderData: keepPreviousData,
    });

    const items = query.data?.items ?? [];
    const total = query.data?.total ?? 0;
    const pages = Math.max(1, Math.ceil(total / TABLE_PAGE_SIZE));
    const filtered = q || statuses.length > 0 || group;

    const toggleSort = (key) => {
        setSort(prev => (prev.key === key
            ? { key, order: prev.order === 'asc' ? 'desc' : 'asc' }
            : { key, order: 'asc' }));
        setPage(1);
    };

    const applyGroup = (token) => {
        const value = (token || '').trim();
        if (!value) return;
        setGroup(value);
        setGroupDraft('');
        setPage(1);
    };

    return (
        <Paper withBorder radius="md" p="md">
            <Stack gap="sm">
                <Group justify="space-between" align="center">
                    <Title order={5}>{allocatedOnly
                        ? t('projects.budgetProjects.titleAllocated', { count: total })
                        : deep
                            ? t('projects.budgetProjects.titleDeep', { count: total })
                            : t('projects.budgetProjects.title', { count: total })}</Title>
                    {query.isFetching && <Loader size="xs" />}
                </Group>

                <Group gap="lg">
                    {/* Only where there are sub-budgets to look into. The
                        allocation view already spans the whole subtree. */}
                    {(budget.child_budget_count > 0 || deep) && (
                        <Group gap={4} wrap="nowrap">
                            <Switch
                                size="xs"
                                label={t('projects.budgetProjects.deep')}
                                checked={deep}
                                disabled={allocatedOnly}
                                onChange={(e) => refilter(setDeep)(e.currentTarget.checked)}
                            />
                            <InfoPopover label={t('projects.budgetProjects.deep')}>
                                {t('projects.budgetProjects.deepHelp')}
                            </InfoPopover>
                        </Group>
                    )}
                    {/* Only where there is something to switch to. */}
                    {(budget.allocated_out?.projects > 0 || allocatedOnly) && (
                        <Group gap={4} wrap="nowrap">
                            <Switch
                                size="xs"
                                label={t('projects.budgetProjects.allocatedOnly')}
                                checked={allocatedOnly}
                                onChange={(e) => { onAllocatedOnlyChange?.(e.currentTarget.checked); setPage(1); }}
                            />
                            <InfoPopover label={t('projects.budgetProjects.allocatedOnly')}>
                                {t('projects.budgetProjects.allocatedOnlyHelp')}
                            </InfoPopover>
                        </Group>
                    )}
                </Group>

                {/* ── Filters ─────────────────────────────────────────── */}
                <Group gap="xs" align="flex-start" wrap="wrap">
                    <TextInput
                        size="xs"
                        style={{ flex: '1 1 200px' }}
                        leftSection={<Search size="13" />}
                        placeholder={t('projects.budgetProjects.searchPlaceholder')}
                        aria-label={t('projects.budgetProjects.searchPlaceholder')}
                        value={search}
                        onChange={(e) => refilter(setSearch)(e.currentTarget.value)}
                    />
                    <MultiSelect
                        size="xs"
                        style={{ flex: '1 1 200px' }}
                        clearable
                        placeholder={statuses.length ? undefined : t('projects.budgetProjects.allStatuses')}
                        aria-label={t('projects.budgetProjects.status')}
                        data={FILTER_STATUSES.map(s => ({ value: s, label: statusLabel(t, s) }))}
                        value={statuses}
                        onChange={refilter(setStatuses)}
                    />
                </Group>
                <Group gap="xs" align="flex-start" wrap="wrap">
                    <SegmentedControl
                        size="xs"
                        value={groupMode}
                        onChange={refilter(setGroupMode)}
                        data={[
                            { value: 'access', label: t('projects.budgetProjects.groupAccess') },
                            { value: 'owner', label: t('projects.budgetProjects.groupOwner') },
                        ]}
                    />
                    {group ? (
                        <Badge size="lg" variant="light" color={COLOR.identity} tt="none"
                            rightSection={
                                <ActionIcon size="xs" variant="transparent" color="gray"
                                    aria-label={t('projects.budgetProjects.clearGroup')}
                                    onClick={() => { setGroup(''); setPage(1); }}>
                                    <X size="12" />
                                </ActionIcon>
                            }>
                            {group}
                        </Badge>
                    ) : (
                        <div style={{ flex: '1 1 260px' }}>
                            <ProjectsPrincipalAutocomplete
                                value={groupDraft}
                                onChange={setGroupDraft}
                                onSelect={applyGroup}
                                placeholder={t('projects.budgetProjects.groupPlaceholder')}
                            />
                        </div>
                    )}
                </Group>

                {query.isError ? (
                    <LoadError query={query} title={t('projects.budgetProjects.loadError')} />
                ) : (
                    <Table.ScrollContainer minWidth={720}>
                        <Table highlightOnHover verticalSpacing="xs" fz="sm">
                            <Table.Thead>
                                <Table.Tr>
                                    <SortHeader label={t('projects.budgetProjects.colName')} sortKey="name" sort={sort} onSort={toggleSort} />
                                    <SortHeader label={t('projects.budgetProjects.colOwner')} sortKey="owner" sort={sort} onSort={toggleSort} />
                                    <SortHeader label={t('projects.budgetProjects.colStatus')} sortKey="status" sort={sort} onSort={toggleSort} />
                                    <Table.Th>{t('projects.budgetProjects.colResources')}</Table.Th>
                                    <SortHeader label={t('projects.budgetProjects.colValidUntil')} sortKey="termination_date" sort={sort} onSort={toggleSort} />
                                    <Table.Th w={1}><VisuallyHidden>{t('projects.budgetProjects.colActions')}</VisuallyHidden></Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {items.map(node => (
                                    <ProjectRow key={node.id} node={node} resources={resources}
                                        showBudget={allocatedOnly || (deep && node.parent_id !== budget.id)}
                                        onAction={onAction} onOpen={onOpen} />
                                ))}
                                {items.length === 0 && !query.isPending && (
                                    <Table.Tr>
                                        <Table.Td colSpan={6}>
                                            <Text size="sm" c="dimmed" ta="center" py="md">
                                                {filtered ? t('projects.budgetProjects.noMatches') : t('projects.budgetProjects.none')}
                                            </Text>
                                        </Table.Td>
                                    </Table.Tr>
                                )}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                )}

                {pages > 1 && (
                    <Group justify="center">
                        <Pagination size="sm" total={pages} value={page} onChange={setPage} />
                    </Group>
                )}
            </Stack>
        </Paper>
    );
}

function SortHeader({ label, sortKey, sort, onSort }) {
    const active = sort.key === sortKey;
    const Icon = !active ? ArrowUpDown : sort.order === 'asc' ? ArrowUp : ArrowDown;
    return (
        <Table.Th aria-sort={active ? (sort.order === 'asc' ? 'ascending' : 'descending') : undefined}>
            <UnstyledButton onClick={() => onSort(sortKey)}>
                <Group gap="4" wrap="nowrap">
                    <Text size="sm" fw={600}>{label}</Text>
                    <Icon size="12" color={active ? undefined : 'var(--mantine-color-gray-5)'} />
                </Group>
            </UnstyledButton>
        </Table.Th>
    );
}

function ProjectRow({ node, resources, onAction, onOpen, showBudget = false }) {
    const { t } = useTranslation();
    const config = useProjectConfig();
    const can = projectActions(node, { manager: true, canDelete: deletesOnRequest(config?.retirement) });
    // A click on an action must not also open the row.
    const act = (action) => (e) => { e.stopPropagation(); onAction(action, node); };

    return (
        <Table.Tr style={{ cursor: 'pointer' }} onClick={() => onOpen(node)}>
            <Table.Td maw={260}>
                <Group gap={6} wrap="nowrap">
                    <Text size="sm" fw={500} truncate>{nodeTitle(node)}</Text>
                    {hasAllocations(node) && (
                        <Tooltip label={node.allocations.map(a =>
                            `${a.budget_name || a.budget_id}: ${resourceSummaryText(resources, a.limit)}`).join(' · ')}>
                            <Badge size="xs" variant="light" color={COLOR.info} tt="none" leftSection={<Gift size="10" />}
                                style={{ flexShrink: 0 }}>
                                {t('projects.allocation.badge')}
                            </Badge>
                        </Tooltip>
                    )}
                </Group>
                {/* Listed from a budget further up, the row says where it lives. */}
                {showBudget && node.parent_name && (
                    <Text size="xs" c="dimmed" truncate>{t('projects.budgetProjects.inBudget', { name: budgetPathText(node.parent_path, node.parent_name) })}</Text>
                )}
            </Table.Td>
            <Table.Td maw={240}>
                <Text size="xs" truncate>{ownerEmail(node)}</Text>
            </Table.Td>
            {/* The status is the one cell that must never be cut: "Change
                requested" and "Awaiting approval" are what a manager scans for. */}
            <Table.Td style={{ whiteSpace: 'nowrap' }}>
                {/* Being deleted says more than released or archived. */}
                {deletionRequested(node)
                    ? <DeletingBadge size="xs" purge={node.purge} />
                    : <NodeStatusBadge status={node.status} size="xs" full />}
            </Table.Td>
            <Table.Td>
                <ProjectResources node={node} resources={resources}
                    quota={effectiveLimit(node, node.pending?.limit || node.limit)} />
            </Table.Td>
            <Table.Td>
                {/* A given-up project has no end date that means anything. */}
                <Text size="xs" c={node.termination_date && !isRetired(node) ? expiryTone(node.termination_date) : 'dimmed'}>
                    {(!isRetired(node) && expiryValue(t, node.termination_date)) || '—'}
                </Text>
            </Table.Td>
            <Table.Td>
                <Group gap="2" wrap="nowrap" justify="flex-end">
                    <RowAction label={t('projects.actions.details')} onClick={act('details')}><Eye size="14" /></RowAction>
                    {can.change && <RowAction label={t('projects.actions.edit')} onClick={act('change')}><Pencil size="14" /></RowAction>}
                    {can.approve && <RowAction label={t('projects.actions.approve')} color={COLOR.positive} onClick={act('approve')}><Check size="14" /></RowAction>}
                    {can.reject && <RowAction label={t('projects.actions.reject')} color={COLOR.negative} onClick={act('reject')}><X size="14" /></RowAction>}
                    {can.adopt && <RowAction label={t('projects.actions.adopt')} color={COLOR.outside} onClick={act('adopt')}><Rocket size="14" /></RowAction>}
                    {(can.transfer || can.move || can.release || can.allocate || can.deleteForGood) && (
                        <Menu position="bottom-end" withinPortal>
                            <Menu.Target>
                                <ActionIcon variant="subtle" color="gray" size="sm"
                                    aria-label={t('projects.budgetProjects.moreActions')}
                                    onClick={(e) => e.stopPropagation()}>
                                    <MoreHorizontal size="14" />
                                </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
                                {can.allocate && <Menu.Item leftSection={<Gift size="13" />} onClick={act('allocate')}>{t('projects.actions.allocate')}</Menu.Item>}
                                {can.transfer && <Menu.Item leftSection={<ArrowRightLeft size="13" />} onClick={act('transfer')}>{t('projects.actions.ownerAction')}</Menu.Item>}
                                {can.move && <Menu.Item leftSection={<FolderInput size="13" />} onClick={act('move')}>{t('projects.actions.move')}</Menu.Item>}
                                {can.release && <Menu.Item color={COLOR.negative} onClick={act('release')}>{t('projects.actions.release')}</Menu.Item>}
                                {can.deleteForGood && <Menu.Item color={COLOR.negative} leftSection={<Trash2 size="13" />} onClick={act('delete-for-good')}>{t('projects.actions.deleteForGood')}</Menu.Item>}
                            </Menu.Dropdown>
                        </Menu>
                    )}
                </Group>
            </Table.Td>
        </Table.Tr>
    );
}

function RowAction({ label, color = 'gray', onClick, children }) {
    return (
        <Tooltip label={label} withinPortal>
            <ActionIcon variant="subtle" color={color} size="sm" aria-label={label} onClick={onClick}>
                {children}
            </ActionIcon>
        </Tooltip>
    );
}
