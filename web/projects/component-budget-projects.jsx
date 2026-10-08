import { useState } from 'react';
import { Activity, ArrowDown, ArrowRightLeft, ArrowUp, ArrowUpDown, Check, Eye, FolderInput, Gift, MoreHorizontal, Package, Pencil, Rocket, Search, Trash2, X } from 'lucide-react';
import { ActionIcon, Badge, Box, Group, Loader, Menu, MultiSelect, Pagination, Paper, SegmentedControl, Stack, Switch, Table, Text, TextInput, Title, Tooltip, UnstyledButton, VisuallyHidden } from '@mantine/core';
import { useDebouncedValue, useLocalStorage } from '@mantine/hooks';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { InfoPopover, NodeStatusBadge } from './component-common.jsx';
import { ProjectsPrincipalAutocomplete } from './principal-search.jsx';
import { COLOR, UNLIMITED_QUOTA, deletesOnRequest, deletionRequested, effectiveLimit, isRetired, expiryTone, expiryValue, hasAllocations, isAvailability, nodeTitle, ownerEmail, projectActions, resourceSummaryText, statusLabel } from './util-project.jsx';
import { useProjectConfig } from './projects.jsx';
import { LoadError } from '/helper/query-state.jsx';
import { budgetPathText } from './component-budget-path.jsx';
import { formatDate } from '../format-date.js';

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
    // Remembered per browser: whoever looks below their budgets once wants to
    // keep doing so, and re-ticking it on every visit was the complaint.
    // Read synchronously, so the first query already asks the right question.
    const [deep, setDeep] = useLocalStorage({
        key: 'self-service.budget-projects.deep',
        defaultValue: false,
        getInitialValueInEffect: false,
    });
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
    const columns = resourceColumns(t, resources, items);
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
                    // Fixed layout with set shares, not "as wide as the content": the
                    // content of a row always added up to more than the detail panel
                    // has, and the table scrolled sideways. Name and status get a
                    // share, every resource a column of its own — one heading for
                    // all rows, so the figures line up from row to row. Only a
                    // phone-narrow panel still scrolls.
                    <Table.ScrollContainer minWidth={480}>
                        <Table highlightOnHover verticalSpacing="xs" fz="sm" layout="fixed">
                            <Table.Thead>
                                <Table.Tr>
                                    {/* Four columns, two of them stacked: owner and
                                        place under the name, the end date under the
                                        status. Six side by side did not fit the
                                        detail panel and scrolled sideways. */}
                                    <Table.Th w="34%">
                                        <Group gap="md" rowGap={0} wrap="wrap">
                                            <SortButton label={t('projects.budgetProjects.colName')} sortKey="name" sort={sort} onSort={toggleSort} />
                                            <SortButton label={t('projects.budgetProjects.colOwner')} sortKey="owner" sort={sort} onSort={toggleSort} dimmed />
                                        </Group>
                                    </Table.Th>
                                    <Table.Th w={124}>
                                        <Group gap="md" rowGap={0} wrap="wrap">
                                            <SortButton label={t('projects.budgetProjects.colStatus')} sortKey="status" sort={sort} onSort={toggleSort} />
                                            <SortButton label={t('projects.budgetProjects.colValidUntil')} sortKey="termination_date" sort={sort} onSort={toggleSort} dimmed />
                                        </Group>
                                    </Table.Th>
                                    {/* The row markers: reserved on the first line of
                                        a row, in use on the second. */}
                                    <Table.Th w={22} px={0}><VisuallyHidden>{t('projects.budgetProjects.colResources')}</VisuallyHidden></Table.Th>
                                    {columns.map(c => (
                                        <Table.Th key={c.id} ta="right" px={6}>
                                            <Text size="xs" fw={600} lh={1.2}>{c.label}</Text>
                                            {c.unit && <Text size="10px" c="dimmed" lh={1.2}>{c.unit}</Text>}
                                        </Table.Th>
                                    ))}
                                    <Table.Th w={84}><VisuallyHidden>{t('projects.budgetProjects.colActions')}</VisuallyHidden></Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {items.map(node => (
                                    <ProjectRow key={node.id} node={node} resources={resources} columns={columns}
                                        showBudget={allocatedOnly || (deep && node.parent_id !== budget.id)}
                                        onAction={onAction} onOpen={onOpen} />
                                ))}
                                {items.length === 0 && !query.isPending && (
                                    <Table.Tr>
                                        <Table.Td colSpan={4 + columns.length}>
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

// SortButton is one sortable label in a header cell; a cell may hold two when
// the column shows two values stacked. `dimmed` marks the second one, the value
// on the quieter line below.
function SortButton({ label, sortKey, sort, onSort, dimmed = false }) {
    const active = sort.key === sortKey;
    const Icon = !active ? ArrowUpDown : sort.order === 'asc' ? ArrowUp : ArrowDown;
    return (
        <UnstyledButton onClick={() => onSort(sortKey)}
            aria-sort={active ? (sort.order === 'asc' ? 'ascending' : 'descending') : undefined}>
            <Group gap="4" wrap="nowrap">
                <Text size="sm" fw={dimmed ? 500 : 600} c={dimmed && !active ? 'dimmed' : undefined}
                    style={{ whiteSpace: 'nowrap' }}>{label}</Text>
                <Icon size="12" color={active ? undefined : 'var(--mantine-color-gray-5)'} />
            </Group>
        </UnstyledButton>
    );
}

// resourceColumns are the quantities shown as columns: those any listed project
// holds, in catalogue order, plus the VM count once anything has been measured.
// Availabilities have no amount and go under the project's name instead.
function resourceColumns(t, resources, items) {
    const quotaOf = (n) => effectiveLimit(n, n.pending?.limit || n.limit) || {};
    const cols = (resources || [])
        .filter(r => !isAvailability(r) && items.some(n => (quotaOf(n)[r.id] ?? 0) !== 0))
        .map(r => ({ id: r.id, label: r.name, unit: r.unit }));
    if (items.some(n => n.os_servers !== undefined && n.os_servers !== null)) {
        cols.push({ id: VMS, label: t('projects.resources.vms') });
    }
    return cols;
}

const VMS = '__vms';

// ResourceCells are a project's figures, one cell per column: what it was
// granted on the first line, what is in use on the second. Every row has both
// lines and every cell a value, so the rows read alike: a figure where there is
// one, a dimmed dash where there is none — nothing granted, nothing to grant
// (VMs), or nothing measured (an import, a project not synced yet, a resource
// OpenStack does not count). A dash is never a zero.
function ResourceCells({ node, columns }) {
    const { t } = useTranslation();
    const quota = effectiveLimit(node, node.pending?.limit || node.limit) || {};
    const inUse = node.os_in_use;
    const line = (v) => (v === null || v === undefined)
        ? <Text size="xs" lh={1.6} c="dimmed">–</Text>
        : <Text size="xs" lh={1.6} style={{ whiteSpace: 'nowrap' }}>{v}</Text>;
    const marker = (Icon, label) => (
        <Tooltip label={label} openDelay={300}>
            <Box h={19} style={{ display: 'flex', alignItems: 'center', color: 'var(--mantine-color-gray-6)' }}>
                <Icon size={12} aria-label={label} />
            </Box>
        </Tooltip>
    );
    return (
        <>
            <Table.Td px={0}>
                {marker(Package, t('projects.resources.reserved'))}
                {marker(Activity, t('projects.resources.inUse'))}
            </Table.Td>
            {columns.map(c => {
                const reserved = c.id === VMS || (quota[c.id] ?? 0) === 0 ? null
                    : quota[c.id] === UNLIMITED_QUOTA ? '∞' : quota[c.id];
                const used = c.id === VMS ? node.os_servers : inUse?.[c.id];
                return (
                    <Table.Td key={c.id} ta="right" px={6}>
                        {line(reserved)}
                        {line(used)}
                    </Table.Td>
                );
            })}
        </>
    );
}

function ProjectRow({ node, resources, columns, onAction, onOpen, showBudget = false }) {
    const { t } = useTranslation();
    const config = useProjectConfig();
    const can = projectActions(node, { manager: true, canDelete: deletesOnRequest(config?.retirement) });
    // A click on an action must not also open the row.
    const act = (action) => (e) => { e.stopPropagation(); onAction(action, node); };

    return (
        <Table.Tr style={{ cursor: 'pointer' }} onClick={() => onOpen(node)}>
            <Table.Td>
                <Group gap={6} wrap="nowrap">
                    <Text size="sm" fw={500} style={{ overflowWrap: 'anywhere' }}>{nodeTitle(node)}</Text>
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
                {/* Whose it is, and — listed from a budget further up — where it
                    lives. */}
                {/* Wrapped rather than cut off: the path is what tells two
                    budgets of the same name apart, an ellipsis hid exactly that. */}
                {ownerEmail(node) && (
                    <Text size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>{ownerEmail(node)}</Text>
                )}
                {showBudget && node.parent_name && (
                    <Text size="xs" c="dimmed">
                        {t('projects.budgetProjects.inBudget', { name: budgetPathText(node.parent_path, node.parent_name) })}
                    </Text>
                )}
                {/* Availabilities have no amount, so they get no column. */}
                {availabilityNames(resources, node) && (
                    <Text size="xs" c="dimmed">{availabilityNames(resources, node)}</Text>
                )}
            </Table.Td>
            {/* The status is the one cell that must never be cut: "Change
                requested" and "Awaiting approval" are what a manager scans for.
                The end date sits under it: both answer "how is it doing". */}
            {/* The status as an icon, its name and meaning on hover, the end date
                beside it: the badge with words like "Change requested" took a
                fifth of the table. Being deleted says more than released. */}
            <Table.Td style={{ whiteSpace: 'nowrap' }}>
                <Group gap={6} wrap="nowrap">
                    <NodeStatusBadge icon status={node.status} deleting={deletionRequested(node)} purge={node.purge} />
                    {/* A given-up project has no end date that means anything.
                        The colour says whether it is close; how far, on hover. */}
                    {node.termination_date && !isRetired(node) ? (
                        <Tooltip label={expiryValue(t, node.termination_date)} openDelay={300}>
                            <Text size="xs" c={expiryTone(node.termination_date)}>
                                {formatDate(node.termination_date)}
                            </Text>
                        </Tooltip>
                    ) : <Text size="xs" c="dimmed">—</Text>}
                </Group>
            </Table.Td>
            <ResourceCells node={node} columns={columns} />
            <Table.Td>
                <Group gap="2" wrap="wrap" justify="flex-end">
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

function availabilityNames(resources, node) {
    const quota = effectiveLimit(node, node.pending?.limit || node.limit) || {};
    return (resources || []).filter(r => isAvailability(r) && quota[r.id] === 1).map(r => r.name).join(' · ');
}
