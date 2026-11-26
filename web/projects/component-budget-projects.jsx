import { useState } from 'react';
import { Activity, ArrowDown, ArrowUp, CalendarX, CircleMinus, Eye, Layers, LogOut, Package, Pencil, Rocket, Scale, Search, Server, Sparkles, SquareTerminal, Tags, Trash2, X } from 'lucide-react';
import { ActionIcon, Badge, Box, Group, Loader, MultiSelect, Pagination, Paper, Progress, SegmentedControl, Stack, Switch, Table, Text, TextInput, Title, Tooltip, UnstyledButton, VisuallyHidden } from '@mantine/core';
import { useDebouncedValue, useElementSize, useLocalStorage } from '@mantine/hooks';
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { InfoPopover, NodeStatusBadge } from './component-common.jsx';
import { ProjectsPrincipalAutocomplete } from './principal-search.jsx';
import { COLOR, UNLIMITED_QUOTA, budgetKinds, kindOfResource, resourcesOfKinds, deletesOnRequest, deletionRequested, finalDeletion, isRetired, expiryTone, expiryValue, isAvailability, isCoFunded, liveAllocations, nodeTitle, ownerEmail, projectActions, projectOf, resourceSummaryText, statusLabel, USAGE_COLOR, usageLevel, measuredUse, openstackSide, pollWhileDeleting, resourceName, resourceShortName, resourceUnitName, allocationActions, getAuthUserEmail, holdsProject } from './util-project.jsx';
import { useProjectConfig } from './projects.jsx';
import { useAuth } from '/providers/auth.jsx';
import { LoadError } from '/helper/query-state.jsx';
import { budgetPathText } from './component-budget-path.jsx';
import { formatDate } from '../format-date.js';
import { SortButton } from '/helper/sort-button.jsx';

// Rows per page. A table, unlike the tree it replaces for projects, pages
// instead of growing: a budget for all students of a location holds hundreds.
const TABLE_PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

// The statuses a row can be filtered by, in the order a manager thinks about
// them: what pays, what waits, what is over. A row is an allocation, so these
// are its states: ended is one given back, withdrawn, or run out at its own end after the project was extended without it.
const FILTER_STATUSES = ['approved', 'pending', 'change_pending', 'ended', 'rejected', 'released', 'archived'];

// BudgetProjectsTable lists the projects paid from one budget, under the
// budget's card in My Budgets. Since allocation_leaves a row is the budget's
// ALLOCATION — what it pays for one project — carrying the whole project
// (row.project): its name, owner, members and what it uses are the project's,
// the amounts in the row what this budget pays, and a project paid by others too
// says so. Filtering, sorting and paging happen on the server; the table holds
// one page. Each row offers what the viewer may do — with this allocation
// (change, decide, withdraw) and with the project (its dialog, releasing it
// where the viewer manages all of it); clicking a row opens the project.
// v2 (new layout): one tab per kind (no "all"), a column per resource always (the table scrolls instead of summing up), each cell a two-tone bar (used of granted), two labelled sorts per column ("belegt" or "verbraucht", and "zugeteilt"), and by default the biggest user of the kind's first resource on top.
export function BudgetProjectsTable({ budget, resources, onAction, onOpen, v2 = false }) {
    const { t } = useTranslation();
    const api = useNodesApi();
    const { user } = useAuth();
    const me = getAuthUserEmail(user);

    const [search, setSearch] = useState('');
    const [statuses, setStatuses] = useState([]);
    const [group, setGroup] = useState('');
    const [groupDraft, setGroupDraft] = useState('');
    const [groupMode, setGroupMode] = useState('access');
    // Remembered per browser, like the sub-budget switch below: whoever sorts
    // by what is in use wants it that way on the next visit too.
    const [storedSort, setSort] = useLocalStorage({
        key: 'self-service.budget-projects.sort',
        defaultValue: DEFAULT_SORT,
        getInitialValueInEffect: false,
    });
    // Whatever the browser kept is only trusted in the shape it was written.
    const storedOrDefault = typeof storedSort?.key === 'string' && (storedSort.order === 'asc' || storedSort.order === 'desc')
        ? storedSort : DEFAULT_SORT;
    // The new layout keeps the order for this visit only, starting at what is in use most.
    const [v2Sort, setV2Sort] = useState(null);
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
    // The projects of one area only (Cloud, Workspaces, LLM), where the budget offers several: the table then shows that area's resources as columns instead of everything behind the (i). Remembered per browser, like the sort.
    const kinds = budgetKinds(budget, resources);
    const [storedKind, setStoredKind] = useLocalStorage({
        key: 'self-service.budget-projects.kind',
        defaultValue: 'all',
        getInitialValueInEffect: false,
    });
    const kind = v2
        ? (kinds.includes(storedKind) ? storedKind : kinds[0] ?? 'all')
        : kinds.length > 1 && kinds.includes(storedKind) ? storedKind : 'all';
    const sort = v2 ? (v2Sort ?? defaultV2Sort(kind === 'all' ? resources : resourcesOfKinds(resources, [kind]), kind)) : storedOrDefault;
    const writeSort = (update) => (v2 ? setV2Sort(update(sort)) : setSort(update));
    const area = kind === 'all' ? '' : kind;

    // Every filter change starts over at the first page: page 7 of the old
    // result means nothing for the new one.
    const refilter = (apply) => (value) => { apply(value); setPage(1); };

    const params = { q, status: statuses, group, groupMode, sort: sort.key, order: sort.order, page, deep, area };
    const query = useQuery({
        queryKey: projectKeys.budgetProjects(budget.id, params),
        queryFn: () => api.listChildren(budget.id, {
            kind: 'project', q, status: statuses, group, groupMode, deep, area,
            sort: sort.key, order: sort.order,
            limit: TABLE_PAGE_SIZE, offset: (page - 1) * TABLE_PAGE_SIZE,
        }),
        enabled: !!api,
        // Keep the old rows while the next page or filter loads, so the table
        // does not collapse to nothing on every keystroke.
        placeholderData: keepPreviousData,
        refetchInterval: pollWhileDeleting,
    });

    // How many projects each kind has under the same filters, for the switch.
    const counts = useQueries({
        queries: (kinds.length > 1 ? (v2 ? kinds : ['all', ...kinds]) : []).map(k => {
            const p = { ...params, page: 1, area: k === 'all' ? '' : k, count: true };
            return {
                queryKey: projectKeys.budgetProjects(budget.id, p),
                queryFn: () => api.listChildren(budget.id, { kind: 'project', q, status: statuses, group, groupMode, deep, area: p.area, limit: 1 }),
                enabled: !!api,
                placeholderData: keepPreviousData,
            };
        }),
    });
    const countOf = (k) => counts[(v2 ? kinds : ['all', ...kinds]).indexOf(k)]?.data?.total ?? '…';

    const items = query.data?.items ?? [];
    const kindResources = kind === 'all' ? resources : resourcesOfKinds(resources, [kind]);
    const columns = resourceColumns(t, kindResources, items, kind !== 'all' && kind !== 'cloud');
    const summaries = summaryColumns(kindResources, columns, kind);
    // Too narrow for a column per resource, the table shows a few sums instead (summaryColumns), the rest in the project's dialog. Measured, not guessed from the screen: the panel's width depends
    // on the layout around it as much as on the window.
    const { ref: tableBoxRef, width: tableWidth } = useElementSize();
    const compact = !v2 && tableWidth > 0 && tableWidth < 440 + 58 * columns.length;
    const total = query.data?.total ?? 0;
    const pages = Math.max(1, Math.ceil(total / TABLE_PAGE_SIZE));
    const filtered = q || statuses.length > 0 || group;

    // Amounts start with the biggest: "who uses most" is the question there.
    const toggleSort = (key) => {
        const numeric = key === 'servers' || key.includes(':');
        writeSort(prev => (prev.key === key
            ? { key, order: prev.order === 'asc' ? 'desc' : 'asc' }
            : { key, order: numeric ? 'desc' : 'asc' }));
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
                    <Title order={5}>{deep
                        ? t('projects.budgetProjects.titleDeep', { count: total })
                        : t('projects.budgetProjects.title', { count: total })}</Title>
                    {query.isFetching && <Loader size="xs" />}
                </Group>

                {kinds.length > 1 && (
                    <SegmentedControl
                        size="xs"
                        style={{ alignSelf: 'flex-start' }}
                        aria-label={t('projects.kind.label')}
                        value={kind}
                        onChange={(k) => { setStoredKind(k); setPage(1); setV2Sort(null); }}
                        data={(v2 ? kinds : ['all', ...kinds]).map(k => ({
                            value: k,
                            label: (
                                <Group gap={6} wrap="nowrap">
                                    {KIND_ICONS[k] && <KindIcon kind={k} />}
                                    <span>{t(`projects.kind.filter_${k}`, { count: countOf(k) })}</span>
                                </Group>
                            ),
                        }))}
                    />
                )}

                <Group gap="lg">
                    {/* Only where there are sub-budgets to look into. */}
                    {(budget.child_budget_count > 0 || deep) && (
                        <Group gap={4} wrap="nowrap">
                            <Switch
                                size="xs"
                                label={t('projects.budgetProjects.deep')}
                                checked={deep}
                                onChange={(e) => refilter(setDeep)(e.currentTarget.checked)}
                            />
                            <InfoPopover label={t('projects.budgetProjects.deep')}>
                                {t('projects.budgetProjects.deepHelp')}
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
                    <div ref={tableBoxRef}>
                    <Table.ScrollContainer minWidth={v2 ? 420 + 150 * columns.length : 480}>
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
                                    {/* The row markers: in use on the first line of
                                        a row, granted on the second. */}
                                    {compact ? summaries.map(c => (
                                        <Table.Th key={c.key} w={92} ta="right" px={6}>
                                            <Tooltip label={t('projects.budgetProjects.summaryHint')} openDelay={300} multiline w={260}>
                                                <Box>
                                                    <SortButton label={t(`projects.budgetProjects.summary.${c.key}`)} sortKey={c.sortKey} sort={sort} onSort={toggleSort} />
                                                </Box>
                                            </Tooltip>
                                        </Table.Th>
                                    )) : (
                                        <Table.Th w={22} px={0}><VisuallyHidden>{t('projects.budgetProjects.colResources')}</VisuallyHidden></Table.Th>
                                    )}
                                    {!compact && columns.map(c => (
                                        <Table.Th key={c.id} ta="right" px={6}>
                                            <Text size="xs" fw={600} lh={1.2}>{c.label}</Text>
                                            {c.unit && <Text size="10px" c="dimmed" lh={1.2}>{c.unit}</Text>}
                                            {/* One sort per line of the cells below: what is
                                                in use, what was granted — the same marks as
                                                in front of the rows. VMs have only the first. */}
                                            {v2 ? (
                                                <Group gap={4} justify="flex-end" wrap="nowrap" mt={4}>
                                                    <LabelledSort label={t(c.window ? 'projects.v2.table.consumed' : 'projects.v2.table.inUse')}
                                                        title={t(c.window ? 'projects.resources.sortConsumed' : 'projects.resources.sortInUse', { name: c.label })}
                                                        sortKey={c.id === VMS ? 'servers' : `used:${c.id}`} sort={sort} onSort={toggleSort} />
                                                    {c.id !== VMS && (
                                                        <LabelledSort label={t('projects.v2.table.granted')} title={t('projects.resources.sortReserved', { name: c.label })}
                                                            sortKey={`reserved:${c.id}`} sort={sort} onSort={toggleSort} />
                                                    )}
                                                </Group>
                                            ) : (
                                            <Group gap={2} justify="flex-end" wrap="nowrap" mt={2}>
                                                <ResourceSort icon={Activity} label={t(c.window ? 'projects.resources.sortConsumed' : 'projects.resources.sortInUse', { name: c.label })}
                                                    sortKey={c.id === VMS ? 'servers' : `used:${c.id}`} sort={sort} onSort={toggleSort} />
                                                {c.id !== VMS && (
                                                    <ResourceSort icon={Package} label={t('projects.resources.sortReserved', { name: c.label })}
                                                        sortKey={`reserved:${c.id}`} sort={sort} onSort={toggleSort} />
                                                )}
                                            </Group>
                                            )}
                                        </Table.Th>
                                    ))}
                                    <Table.Th w={84}><VisuallyHidden>{t('projects.budgetProjects.colActions')}</VisuallyHidden></Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {items.map(node => (
                                    <ProjectRow key={node.id} node={node} resources={resources} columns={columns} summaries={summaries} compact={compact} v2={v2}
                                        showBudget={deep && node.parent_id !== budget.id} me={me}
                                        onAction={onAction} onOpen={onOpen} />
                                ))}
                                {items.length === 0 && !query.isPending && (
                                    <Table.Tr>
                                        <Table.Td colSpan={compact ? 3 + summaries.length : 4 + columns.length}>
                                            <Text size="sm" c="dimmed" ta="center" py="md">
                                                {filtered ? t('projects.budgetProjects.noMatches') : t('projects.budgetProjects.none')}
                                            </Text>
                                        </Table.Td>
                                    </Table.Tr>
                                )}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                    </div>
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

// ResourceSort is a sort control for a resource column: the mark of the line it
// sorts by (reserved or in use), with the direction once it is the active sort.
function ResourceSort({ icon: Icon, label, sortKey, sort, onSort }) {
    const active = sort.key === sortKey;
    const Arrow = sort.order === 'asc' ? ArrowUp : ArrowDown;
    return (
        <Tooltip label={label} openDelay={300}>
            <UnstyledButton onClick={() => onSort(sortKey)} aria-label={label}
                aria-sort={active ? (sort.order === 'asc' ? 'ascending' : 'descending') : undefined}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 1,
                    color: active ? 'var(--mantine-color-dhbw-7)' : 'var(--mantine-color-gray-5)' }}>
                <Icon size={11} />
                {active && <Arrow size={10} />}
            </UnstyledButton>
        </Tooltip>
    );
}

// resourceColumns are the quantities shown as columns: those any listed project
// holds, in catalogue order, plus the VM count once anything has been measured.
// Availabilities have no amount and go under the project's name instead.
// short: the Lab/KI view, where "Workspace CPU" says no more than "CPU".
function resourceColumns(t, resources, items, short = false) {
    const cols = (resources || [])
        .filter(r => !isAvailability(r) && items.some(n => (paidQuota(n)[r.id] ?? 0) !== 0))
        .map(r => ({ id: r.id, label: short ? resourceShortName(t, r) : resourceName(t, r), unit: resourceUnitName(t, r), window: r.window }));
    if (items.some(n => openstackSide(rowProject(n)).facts?.servers != null)) {
        cols.push({ id: VMS, label: t('projects.resources.vms') });
    }
    return cols;
}

const VMS = '__vms';

// rowProject is the project a row stands for: an allocation's project, an imported project itself.
const rowProject = (row) => projectOf(row) ?? row;

// paidQuota is what a row's budget pays: the allocation's limit, or its waiting change while one waits — what the manager is asked about.
const paidQuota = (row) => row.pending?.limit || row.limit || {};

// SUMMARIES are the sums the narrow table shows instead of a column per resource: what a manager compares projects by, each summed over its resources (the GPU hours of all classes, say). In use now, or consumed in the current window for an amount per window.
const SUMMARIES = [
    { key: 'gpuHours', match: (r) => r.unit === 'GPU h' },
    { key: 'cpuHours', match: (r) => r.unit === 'vCPU h' },
    // Two more where the table shows Workspaces only; among all areas they would crowd the others out.
    { key: 'ramHours', match: (r) => r.unit === 'GB h', only: 'workspaces' },
    { key: 'storage', match: (r) => r.id === 'ws-storage-gb', only: 'workspaces' },
    { key: 'llmTokens', match: (r) => r.unit === 'M tokens' },
    { key: 'cores', match: (r) => r.id === 'cores' },
];

// summaryColumns are the SUMMARIES any listed project holds a resource of; sorted on the server by the sum over all of their resources (used:a,b,…), not only those on this page.
function summaryColumns(resources, columns, kind) {
    return SUMMARIES.filter(sum => !sum.only || sum.only === kind).flatMap(sum => {
        const ids = (resources || []).filter(r => !isAvailability(r) && sum.match(r)).map(r => r.id);
        if (!columns.some(c => ids.includes(c.id))) return [];
        return [{ key: sum.key, ids, sortKey: `used:${ids.join(',')}` }];
    });
}

// summaryValue is a project's sum of one summary; null when none of its resources was measured, so a dash, never a zero.
function summaryValue(node, c) {
    const inUse = measuredUse(rowProject(node)) || {};
    const values = c.ids.map(id => inUse[id]).filter(v => typeof v === 'number');
    return values.length ? values.reduce((a, b) => a + b, 0).toLocaleString() : null;
}

// The symbol of each kind in the switch.
const KIND_ICONS = { cloud: Server, workspaces: SquareTerminal, llm: Sparkles };
function KindIcon({ kind }) {
    const Icon = KIND_ICONS[kind];
    return <Icon size={13} />;
}

const DEFAULT_SORT = { key: 'name', order: 'asc' };

// ResourceCells are a project's figures, one cell per column: what is in use on
// the first line, what it was granted on the second. Every row has both
// lines and every cell a value, so the rows read alike: a figure where there is
// one, a dimmed dash where there is none — nothing granted, or nothing
// measured (an import, a project not synced yet, a resource
// OpenStack does not count). A dash is never a zero.
function resourceFigures(node, c) {
    const quota = paidQuota(node);
    const project = rowProject(node);
    // VMs are no catalogue resource: what OpenStack allows is measured with
    // the count (for a managed project it follows the cores).
    const reserved = c.id === VMS ? (openstackSide(project).facts?.server_limit ?? null)
        : (quota[c.id] ?? 0) === 0 ? null
            : quota[c.id] === UNLIMITED_QUOTA ? '∞' : quota[c.id];
    // What the project uses is the project's, whoever pays for it.
    const used = c.id === VMS ? openstackSide(project).facts?.servers : measuredUse(project)?.[c.id];
    return { reserved, used };
}

// figure is one value; `level` colours what is in use by how full the project
// is on it — normal, a hint from 80 %, a warning when all of it is used.
function figure(v, level = null) {
    const color = level && USAGE_COLOR[level];
    return (v === null || v === undefined)
        ? <Text size="xs" lh={1.6} c="dimmed">–</Text>
        : <Text size="xs" lh={1.6} fw={color ? 600 : undefined} c={color ? `${color}.8` : undefined} style={{ whiteSpace: 'nowrap' }}>{v}</Text>;
}

function figureLevel({ used, reserved }) {
    return usageLevel(used, typeof reserved === 'number' ? reserved : null);
}

function RowMarker({ icon: Icon, label }) {
    return (
        <Tooltip label={label} openDelay={300}>
            <Box h={19} style={{ display: 'flex', alignItems: 'center', color: 'var(--mantine-color-gray-6)' }}>
                <Icon size={12} aria-label={label} />
            </Box>
        </Tooltip>
    );
}

function ResourceCells({ node, columns, bars = false }) {
    const { t } = useTranslation();
    if (bars) {
        return (
            <>
                <Table.Td px={0} />
                {columns.map(c => <Table.Td key={c.id} px={6}><BarCell figures={resourceFigures(node, c)} /></Table.Td>)}
            </>
        );
    }
    return (
        <>
            <Table.Td px={0}>
                <RowMarker icon={Activity} label={t('projects.resources.inUse')} />
                <RowMarker icon={Package} label={t('projects.resources.reserved')} />
            </Table.Td>
            {columns.map(c => {
                const figures = resourceFigures(node, c);
                const { reserved, used } = figures;
                return (
                    <Table.Td key={c.id} ta="right" px={6}>
                        {figure(used, figureLevel(figures))}
                        {figure(reserved)}
                    </Table.Td>
                );
            })}
        </>
    );
}

function ProjectRow({ node, resources, columns, summaries, compact = false, v2 = false, onAction, onOpen, showBudget = false, me = '' }) {
    const { t } = useTranslation();
    const config = useProjectConfig();
    // The row is the budget's allocation; the project it pays for is everything else.
    const project = rowProject(node);
    const isAlloc = node.kind === 'allocation';
    const can = projectActions(project, { manager: true, canDelete: deletesOnRequest(config?.retirement) });
    const holder = holdsProject(project, me);
    // The viewer manages this budget, so this allocation is theirs to change, decide and withdraw.
    const mine = isAlloc ? allocationActions(node, { holder, manager: true, project }) : {};
    // Releasing the whole project only where this budget is the only one paying for it: with others, ending this allocation is what is the viewer's.
    const others = isAlloc ? liveAllocations(project).filter(a => a.id !== node.id) : [];
    const releasable = can.release && others.length === 0;
    // A click on an action must not also open the row.
    const act = (action, target = project, extra) => (e) => { e.stopPropagation(); onAction(action, target, extra); };

    return (
        <Table.Tr style={{ cursor: 'pointer' }} onClick={() => onOpen(project)}>
            <Table.Td>
                <Group gap={6} wrap="nowrap">
                    <Text size="sm" fw={500} style={{ overflowWrap: 'anywhere' }}>{nodeTitle(project)}</Text>
                    {/* Paid by other budgets too: how many, and on hover the project's total and who pays the rest. */}
                    {isAlloc && isCoFunded(project) && (
                        <Tooltip multiline w={300} withinPortal label={
                            <>
                                <b>{t('projects.budgetProjects.coFundedTotal', { total: resourceSummaryText(t, resources, project.limit) || '—' })}</b>
                                {others.map(a => <div key={a.id}>{`${a.budget_name || a.budget_id}: ${resourceSummaryText(t, resources, a.limit) || '—'}`}</div>)}
                            </>
                        }>
                            <Badge size="xs" variant="light" color={COLOR.info} tt="none" leftSection={<Layers size="10" />}
                                style={{ flexShrink: 0 }}>
                                {t('projects.budgetProjects.coFunded', { count: others.length })}
                            </Badge>
                        </Tooltip>
                    )}
                    {/* The project was extended without this allocation: it ends at its own date. */}
                    {isAlloc && node.ends_alone && node.termination_date && node.status !== 'ended' && (
                        <Tooltip label={t('projects.allocation.endsAlone', { date: formatDate(node.termination_date) })} multiline w={300} withinPortal>
                            <Badge size="xs" variant="light" color={COLOR.identity} tt="none" leftSection={<CalendarX size="10" />}
                                style={{ flexShrink: 0 }}>
                                {t('projects.allocation.endsAloneBadge')}
                            </Badge>
                        </Tooltip>
                    )}
                </Group>
                {/* Whose it is, and — listed from a budget further up — where it
                    lives. */}
                {/* Wrapped rather than cut off: the path is what tells two
                    budgets of the same name apart, an ellipsis hid exactly that. */}
                {ownerEmail(project) && (
                    <Text size="xs" c="dimmed" style={{ overflowWrap: 'anywhere' }}>{ownerEmail(project)}</Text>
                )}
                {showBudget && node.parent_name && (
                    <Text size="xs" c="dimmed">
                        {t('projects.budgetProjects.inBudget', { name: budgetPathText(node.parent_path, node.parent_name) })}
                    </Text>
                )}
                {/* Availabilities have no amount, so they get no column. */}
                {availabilityNames(t, resources, node) && (
                    <Text size="xs" c="dimmed">{availabilityNames(t, resources, node)}</Text>
                )}
            </Table.Td>
            {/* The status as an icon, its name and meaning on hover, the end date
                beside it: the badge with words like "Change requested" took a
                fifth of the table. Being deleted says more than released. The
                status and the end are this allocation's: what the budget pays,
                and until when. */}
            <Table.Td style={{ whiteSpace: 'nowrap' }}>
                <Group gap={6} wrap="nowrap">
                    <NodeStatusBadge icon status={node.status} deleting={deletionRequested(project)} purge={openstackSide(project).purge} deletionAt={finalDeletion(project, resources, config?.retirement)} />
                    {/* A given-up project has no end date that means anything.
                        The colour says whether it is close; how far, on hover. */}
                    {node.termination_date && !isRetired(node) && node.status !== 'ended' ? (
                        <Tooltip label={expiryValue(t, node.termination_date)} openDelay={300}>
                            <Text size="xs" c={expiryTone(node.termination_date)}>
                                {formatDate(node.termination_date)}
                            </Text>
                        </Tooltip>
                    ) : <Text size="xs" c="dimmed">—</Text>}
                </Group>
            </Table.Td>
            {compact ? summaries.map(c => (
                <Table.Td key={c.key} ta="right" px={6}>{figure(summaryValue(node, c))}</Table.Td>
            )) : <ResourceCells node={node} columns={columns} bars={v2} />}
            <Table.Td>
                <Group gap="2" wrap="wrap" justify="flex-end">
                    {/* The project's one dialog: editable where it may be changed. */}
                    {can.change
                        ? <RowAction label={t('projects.actions.edit')} onClick={act('change')}><Pencil size="14" /></RowAction>
                        : <RowAction label={t('projects.actions.details')} onClick={act('details')}><Eye size="14" /></RowAction>}
                    {mine.decide && <RowAction label={t('projects.actions.decide')} color={COLOR.attention} onClick={act('decide', node)}><Scale size="14" /></RowAction>}
                    {mine.change && others.length > 0 && <RowAction label={t('projects.allocation.change')} onClick={act('allocations', project, node.id)}><Package size="14" /></RowAction>}
                    {/* What this budget's part is booked to (cost centre and the like): the allocation dialog, where its managers set it. */}
                    {mine.end && <RowAction label={t('projects.allocation.attributes')} onClick={act('allocations', project, node.id)}><Tags size="14" /></RowAction>}
                    {mine.endAlone && <RowAction label={t('projects.allocation.endAlone')} color={COLOR.attention} onClick={act('allocation-end-alone', { ...node, project })}><CalendarX size="14" /></RowAction>}
                    {!isAlloc && can.adopt && <RowAction label={t('projects.actions.adopt')} color={COLOR.outside} onClick={act('adopt', node)}><Rocket size="14" /></RowAction>}
                    {/* Every action as its own icon, none behind a menu: a row may
                        grow a line taller, but nothing has to be looked for. */}
                    {mine.end && others.length > 0 && <RowAction label={t('projects.allocation.withdraw')} color={COLOR.negative} onClick={act('allocation-end', node)}><CircleMinus size="14" /></RowAction>}
                    {releasable && <RowAction label={t('projects.actions.release')} color={COLOR.negative} onClick={act('release')}><LogOut size="14" /></RowAction>}
                    {can.deleteForGood && <RowAction label={t('projects.actions.deleteForGood')} color={COLOR.negative} onClick={act('delete-for-good')}><Trash2 size="14" /></RowAction>}
                </Group>
            </Table.Td>
        </Table.Tr>
    );
}

// BarCell is one resource of a row in the new layout: "used / granted" and a bar of two tones, the used part solid (orange from 80 %), the rest of what is granted lighter.
function BarCell({ figures }) {
    const { used, reserved } = figures;
    const capped = typeof reserved === 'number' && reserved > 0;
    const measured = typeof used === 'number';
    const level = figureLevel(figures);
    const high = level === 'high' || level === 'full';
    const pct = capped && measured ? Math.min(100, (used / reserved) * 100) : 0;
    if (reserved === null && !measured) return <Text size="xs" c="dimmed" ta="right">–</Text>;
    return (
        <Stack gap={4}>
            <Text size="xs" ta="right" fw={high ? 600 : undefined} c={high ? 'orange.8' : undefined} style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                {measured ? used : '–'} / {reserved ?? '–'}
            </Text>
            {capped && (
                <Progress.Root size="sm">
                    {pct > 0 && <Progress.Section value={pct} color={high ? 'orange' : 'blue'} />}
                    <Progress.Section value={100 - pct} color={high ? 'orange.2' : 'blue.2'} />
                </Progress.Root>
            )}
        </Stack>
    );
}

// LabelledSort is a sort control with words ("belegt", "zugeteilt"), for the new layout.
function LabelledSort({ label, title, sortKey, sort, onSort }) {
    const active = sort.key === sortKey;
    const Arrow = sort.order === 'asc' ? ArrowUp : ArrowDown;
    return (
        <Tooltip label={title} openDelay={300}>
            <UnstyledButton onClick={(e) => { e.stopPropagation(); onSort(sortKey); }} aria-label={title}
                aria-sort={active ? (sort.order === 'asc' ? 'ascending' : 'descending') : undefined}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '1px 6px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                    border: `1px solid ${active ? 'var(--mantine-color-text)' : 'var(--mantine-color-default-border)'}`,
                    background: active ? 'var(--mantine-color-text)' : 'transparent', color: active ? 'var(--mantine-color-body)' : 'var(--mantine-color-dimmed)' }}>
                {label}{active && <Arrow size={10} />}
            </UnstyledButton>
        </Tooltip>
    );
}

// defaultV2Sort is where the new layout's table starts: the biggest user of the kind's first quantity.
export function defaultV2Sort(resources, kind) {
    const first = (resources || []).find(r => !isAvailability(r) && (kind === 'all' || kindOfResource(r) === kind));
    return first ? { key: `used:${first.id}`, order: 'desc' } : DEFAULT_SORT;
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

function availabilityNames(t, resources, node) {
    const quota = paidQuota(node);
    return (resources || []).filter(r => isAvailability(r) && quota[r.id] === 1).map(r => resourceName(t, r)).join(' · ');
}
