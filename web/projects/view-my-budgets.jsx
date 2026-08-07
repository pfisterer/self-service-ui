import { useEffect, useMemo, useState } from 'react';
import { Inbox, Search, X } from 'lucide-react';
import { ActionIcon, Alert, Badge, Button, Checkbox, Grid, Group, Loader, Paper, ScrollArea, SegmentedControl, Stack, Text, TextInput, useTree } from '@mantine/core';
import { Loading, LoadError } from '/helper/query-state.jsx';
import { useAuth } from '/providers/auth.jsx';
import { useConfirm } from '/providers/confirm.jsx';
import { useErrorModal } from '/providers/error-modal.jsx';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDebouncedValue } from '@mantine/hooks';
import { PAGE_SIZE, useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { BudgetCard } from './card-budget.jsx';
import { ProjectCard } from './card-project.jsx';
import { BudgetTree, NodeResultList, budgetsToTreeData } from './component-budget-tree.jsx';
import { AdoptModal } from './modal-adopt.jsx';
import { ApproveModal } from './modal-approve.jsx';
import { BudgetFormModal } from './modal-budget-form.jsx';
import { NodeInspectModal, TAB_DETAILS, TAB_HISTORY } from './modal-inspect.jsx';
import { MoveModal } from './modal-move.jsx';
import { RejectModal } from './modal-reject.jsx';
import { TransferOwnerModal } from './modal-transfer-owner.jsx';
import { useNodeDialog } from './use-node-dialog.jsx';
import { useProjectConfig } from './projects.jsx';
import { COLOR, formatError, getAuthUserEmail, isBudget, REQUEST_TYPES, requestType } from './util-project.jsx';
import { useCloudStatus } from './cloud-status.jsx';

// How long typing pauses before a search is sent.
const SEARCH_DEBOUNCE_MS = 300;

// MyBudgetsView is a master-detail tree navigator: the left side shows the
// budgets the user manages as an expandable tree (sub-budgets and projects
// load lazily on expand, one page at a time), the right side shows the selected
// node with its usage, access rules and actions. Delegating resources =
// creating a sub-budget with someone else in "Managed by" — there is
// deliberately no separate "delegation" concept.
//
// The left panel has three modes, and only ever one of them at a time:
//   tree     — browsing; children are fetched per node, page by page
//   search   — a flat list of hits from the server, across the whole subtree
//   waiting  — a flat list of what needs a decision
// Search and the waiting inbox are flat because the tree is no longer loaded in
// full: it cannot be filtered in the browser, and unfolding it down to a few
// matches would be slower and harder to read than naming their budget.
const EMPTY_PAGE = { items: [], total: 0 };

export function MyBudgetsView() {
    const api = useNodesApi();
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const { showError } = useErrorModal();
    const confirm = useConfirm();
    const config = useProjectConfig();
    const cloudStatus = useCloudStatus();
    const userEmail = getAuthUserEmail(user);

    const [includeSubtree, setIncludeSubtree] = useState(false);
    const scope = includeSubtree ? 'subtree' : 'direct';

    // The three lists this view is built from. Independent queries, so a
    // failing eligible-budget lookup does not blank out the tree.
    const [myBudgetsQuery, eligibleQuery, waitingQuery] = useQueries({
        queries: [
            { queryKey: projectKeys.myBudgets(), queryFn: () => api.listMyBudgets(), enabled: !!api },
            { queryKey: projectKeys.eligibleForMe(), queryFn: () => api.listEligibleForMe(), enabled: !!api },
            { queryKey: projectKeys.toManage(scope), queryFn: () => api.listToManage(scope), enabled: !!api },
        ],
    });
    // `?? EMPTY_PAGE` rather than an inline literal: a fresh object each render
    // would defeat every useMemo downstream that keys on this.
    const myBudgets = myBudgetsQuery.data ?? EMPTY_PAGE;
    const waiting = waitingQuery.data ?? EMPTY_PAGE;
    // Budgets that accept a request for a sub-budget — a budget may take project
    // requests while refusing sub-budgets (allow_sub_budget_requests). Offering
    // one anyway would produce a request the server rejects.
    const budgetRequestTargets = useMemo(
        () => (eligibleQuery.data?.items ?? []).filter(b => b.allow_sub_budget_requests !== false),
        [eligibleQuery.data]);
    // The pages of children loaded so far, per node: { items, total }. Expansion,
    // per-node loading and load errors are owned by the Mantine tree controller.
    const [childrenMap, setChildrenMap] = useState(new Map());
    const [selectedNode, setSelectedNode] = useState(null);
    const [search, setSearch] = useState('');
    const [extraResults, setExtraResults] = useState([]);
    // '' = the whole tree; 'waiting' = everything that needs a decision; the
    // rest narrow that down to one kind of request (see REQUEST_TYPES).
    const [filter, setFilter] = useState('');
    // Everything awaiting this user's decision — one request, where finding the
    // same nodes in the tree would mean expanding it all. By default that is
    // what nobody else manages; a request inside a delegated sub-budget belongs
    // to its manager and would otherwise bury the own ones (a root admin would
    // see the whole organization).
    const dlg = useNodeDialog();
    const [budgetForm, setBudgetForm] = useState(null); // { mode, parent?, node? } | null

    // A manager of a budget is often also in the admin_scope of budgets nested
    // under it, and my-budgets returns that flat list — rendering every entry
    // as a top-level root would show those nested budgets twice. Keep only the
    // budgets whose direct parent is not itself in the managed set; the rest
    // appear in their natural place when their parent is expanded.
    const rootBudgets = useMemo(() => {
        const managedIds = new Set(myBudgets.items.map(b => b.id));
        return myBudgets.items.filter(b => !managedIds.has(b.parent_id));
    }, [myBudgets]);

    // Nothing picked yet falls back to the first root, so the detail panel is
    // never empty for someone who manages something. Derived rather than written
    // into state when the roots arrive: an effect that "selects the first one"
    // also has to decide what to do when the list changes under it.
    const selected = selectedNode ?? rootBudgets[0] ?? null;

    // Lazy loading: the tree calls this the first time a node with children is
    // opened, and it fetches the FIRST page only. Errors propagate on purpose —
    // the controller records them and the row shows the failure in place instead
    // of a modal that loses the context.
    const loadChildren = async (nodeId) => {
        const page = await api.listChildren(nodeId);
        setChildrenMap(m => new Map(m).set(nodeId, page));
    };

    // The "show more" row under a partly loaded budget. The new page is appended;
    // total comes from the fresh response, so a child added meanwhile is counted.
    const loadMoreChildren = async (nodeId) => {
        const loaded = childrenMap.get(nodeId)?.items || [];
        try {
            const page = await api.listChildren(nodeId, { offset: loaded.length });
            setChildrenMap(m => {
                const previous = m.get(nodeId)?.items || [];
                const seen = new Set(previous.map(n => n.id));
                return new Map(m).set(nodeId, {
                    items: [...previous, ...page.items.filter(n => !seen.has(n.id))],
                    total: page.total,
                });
            });
        } catch (e) {
            showError(formatError(e));
        }
    };

    const tree = useTree({ multiple: false, onLoadChildren: loadChildren });

    // Reloads the roots AND everything currently visible in the tree, so the
    // usage bars and statuses are fresh after every action. Each expanded node
    // is refetched with as many rows as were loaded, so a refresh does not
    // silently fold pages the user opened back up.
    // Reloads the lists AND everything currently visible in the tree, so the
    // usage bars and statuses are fresh after every action. Each expanded node
    // is refetched with as many rows as were loaded, so a refresh does not
    // silently fold pages the user opened back up.
    //
    // The lists come from the query cache (a write invalidates them on its own);
    // what still has to be done by hand is the lazily loaded tree, which is not
    // server state a key can describe — it is "the pages this user happened to
    // open".
    const refresh = async () => {
        try {
            await queryClient.invalidateQueries({ queryKey: projectKeys.tree() });
            // The header badge shows the same number; a decision made here must
            // not leave it stale.
            cloudStatus.refresh();

            const ids = Object.entries(tree.expandedState).filter(([, open]) => open).map(([id]) => id);
            const pages = await Promise.all(ids.map(id => {
                const shown = childrenMap.get(id)?.items.length || 0;
                const limit = Math.max(PAGE_SIZE, Math.ceil(shown / PAGE_SIZE) * PAGE_SIZE);
                return api.listChildren(id, { limit }).catch(() => null);
            }));
            const map = new Map();
            ids.forEach((id, i) => { if (pages[i]) map.set(id, pages[i]); });
            setChildrenMap(map);

            // Refresh the selected node too; drop the selection if it vanished
            // (deleted, released, moved out of sight).
            if (selectedNode) {
                setSelectedNode(await api.getNode(selectedNode.id).catch(() => null));
            }
        } catch (e) {
            showError(formatError(e));
        }
    };

    // The first level is always open. Collapsed, the tree shows a manager their
    // own budgets and nothing about what is in them — and the first click is
    // then always the same one.
    //
    // Expansion is set in one go instead of per node via tree.expand(): that
    // helper builds the next state from the state it captured, so expanding
    // several roots in a row would keep only the last one. Loading the children
    // is therefore ours to trigger too; a failure leaves the node empty and the
    // next refresh retries it.
    useEffect(() => {
        const openable = rootBudgets.filter(b => b.child_count > 0);
        if (openable.length === 0) return;
        tree.setExpandedState({
            ...tree.expandedState,
            ...Object.fromEntries(openable.map(b => [b.id, true])),
        });
        openable
            .filter(b => !childrenMap.has(b.id))
            .forEach(b => { loadChildren(b.id).catch(() => { }); });
        // Deliberately keyed on the ROOTS only. `tree` and `childrenMap` are
        // read to decide what still has to be opened/loaded; listing them would
        // re-run this on every expand and fight the user's own collapsing.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rootBudgets]);

    // ── Search ──────────────────────────────────────────────────────────────
    // Server-side: the tree holds only the pages that were opened, so there is
    // nothing local to filter. Debounced, because it runs on every keystroke.
    const query = search.trim();
    const searching = query.length > 0;
    const filtering = filter !== '';

    // Debounced through the cache key instead of a timer that writes state:
    // typing back to an earlier term answers from the cache, and a slow response
    // for an old term can no longer overwrite a newer one.
    const [debouncedQuery] = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
    const searchQuery = useQuery({
        queryKey: projectKeys.search(debouncedQuery, 0),
        queryFn: () => api.searchNodes(debouncedQuery),
        enabled: !!api && debouncedQuery.length > 0,
    });
    // `extraResults` holds the pages appended by "show more"; the query owns the
    // first page, so a new search discards them by itself.
    const results = searching && searchQuery.data
        ? { items: [...searchQuery.data.items, ...extraResults], total: searchQuery.data.total }
        : null;
    const searchBusy = searching && (searchQuery.isFetching || query !== debouncedQuery);

    const loadMoreResults = async () => {
        try {
            const page = await api.searchNodes(query, { offset: results.items.length });
            setExtraResults(prev => [...prev, ...page.items]);
        } catch (e) {
            showError(formatError(e));
        }
    };

    // The two flat modes exclude each other: searching inside "what needs me"
    // would silently mean two filters at once, and neither control would say so.
    const changeSearch = (value) => {
        setSearch(value);
        setExtraResults([]);
        if (value.trim()) setFilter('');
    };
    const changeFilter = (value) => {
        setFilter(value);
        if (value) setSearch('');
    };

    const treeData = useMemo(
        () => budgetsToTreeData(rootBudgets, childrenMap),
        [rootBudgets, childrenMap],
    );

    // Widening the scope only changes the inbox, not the tree. The scope is part
    // of that list's query key, so switching it IS the reload — no separate
    // fetch, and the previous scope stays cached for switching back.
    const changeScope = (subtree) => setIncludeSubtree(subtree);

    // Counts come from the inbox, not from the loaded tree: they must be right
    // before anything is expanded.
    const waitingCount = (type) => (type === 'waiting'
        ? waiting.items.length
        : waiting.items.filter(n => requestType(n) === type).length);

    // The list behind the current filter: everything waiting, or one kind of it.
    const waitingList = filter === 'waiting'
        ? waiting.items
        : waiting.items.filter(n => requestType(n) === filter);

    // Clicking a row selects it. Expanding is handled by the tree itself
    // (expandOnClick), which also triggers onLoadChildren on first open.
    const select = (node) => setSelectedNode(node);

    const handleDelete = async (node) => {
        const ok = await confirm({
            title: `Delete budget “${node.name || node.id}”?`,
            message: 'Only possible while nothing under it is active or awaiting a decision.',
        });
        if (!ok) return;
        try {
            await api.deleteNode(node.id);
            refresh();
        } catch (e) {
            showError(formatError(e));
        }
    };

    // Central action dispatch for both node kinds.
    const handleAction = (action, node) => {
        if (action === 'sub-budget') return setBudgetForm({ mode: 'create', parent: node });
        if (action === 'edit') return setBudgetForm({ mode: 'edit', node });
        if (action === 'delete') return handleDelete(node);
        dlg.open(action, node);
    };

    if (!api || !config || myBudgetsQuery.isPending) return <Loading />;
    if (myBudgetsQuery.isError) return <LoadError query={myBudgetsQuery} title="Could not load your budgets" />;

    const resources = config.resources || [];
    // Move targets: every budget visible in the tree.
    const loadedBudgets = [...childrenMap.values()].flatMap(p => p.items).filter(isBudget);
    const moveTargets = [
        ...myBudgets.items,
        ...loadedBudgets.filter(b => !myBudgets.items.some(r => r.id === b.id)),
    ];

    return (
        <Stack>
            <Group justify="space-between" align="center">
                <Text size="sm" c="dimmed">
                    The budgets you manage, as a tree. Select a node to inspect it;
                    delegate by creating a sub-budget with someone else in “Managed by”.
                </Text>
                {budgetRequestTargets.length > 0 && (
                    <Button size="xs" variant="light" leftSection={<Inbox size="14" />}
                        onClick={() => setBudgetForm({ mode: 'request' })}>
                        Request budget
                    </Button>
                )}
            </Group>

            {myBudgets.items.length === 0 && (
                <Alert color={COLOR.info} variant="light">
                    You don't manage any budgets yet.
                    {budgetRequestTargets.length > 0
                        ? ' You can request one from a budget that accepts sub-budget requests.'
                        : ' A manager of a parent budget can delegate one to you.'}
                </Alert>
            )}

            {/* The roots are fetched in one go — one person manages a handful of
                budgets. Say so rather than quietly drop the rest if that ever
                stops being true. */}
            {myBudgets.items.length < myBudgets.total && (
                <Alert color={COLOR.attention} variant="light">
                    Showing {myBudgets.items.length} of {myBudgets.total} budgets you manage.
                    Use the search to find the ones not listed.
                </Alert>
            )}

            {myBudgets.items.length > 0 && (
                // align="flex-start": tree and detail panel each keep their
                // natural height — otherwise the panel card stretches to the
                // tree's height and its action bar floats far below the content.
                <Grid gutter="md" align="flex-start">
                    {/* ── Tree navigation ────────────────────────────────── */}
                    <Grid.Col span={{ base: 12, md: 5, lg: 4 }}>
                        <Paper withBorder p="xs" radius="md">
                            {/* Filter first, then search: the filter answers "what
                                needs me", the search "where is this one thing". */}
                            <SegmentedControl
                                fullWidth
                                size="xs"
                                mb="xs"
                                value={filter}
                                onChange={changeFilter}
                                data={[
                                    { value: '', label: 'All' },
                                    {
                                        value: 'waiting',
                                        label: (
                                            <Group gap="4" wrap="nowrap" justify="center">
                                                <span>Waiting</span>
                                                {waitingCount('waiting') > 0 && (
                                                    <Badge size="xs" circle color={COLOR.attention}>{waitingCount('waiting')}</Badge>
                                                )}
                                            </Group>
                                        ),
                                    },
                                ]}
                            />
                            {/* Both only say something about the waiting set, so they
                                appear with it: the kinds sort it, the checkbox decides
                                whose requests are in it — off, what nobody else
                                manages; on, also what the managers of delegated
                                sub-budgets have not handled. */}
                            {filtering && (
                                <>
                                    {waiting.items.length > 0 && (
                                        <SegmentedControl
                                            fullWidth
                                            size="xs"
                                            mb="xs"
                                            value={filter}
                                            onChange={changeFilter}
                                            data={[
                                                { value: 'waiting', label: `All (${waitingCount('waiting')})` },
                                                ...REQUEST_TYPES.map(t => ({
                                                    value: t.value,
                                                    label: `${t.label} (${waitingCount(t.value)})`,
                                                    disabled: waitingCount(t.value) === 0,
                                                })),
                                            ]}
                                        />
                                    )}
                                    <Checkbox
                                        size="xs"
                                        mb="xs"
                                        label="Include requests in delegated sub-budgets"
                                        checked={includeSubtree}
                                        onChange={(e) => changeScope(e.currentTarget.checked)}
                                    />
                                    {/* The inbox is fetched in one go — a queue of
                                        decisions is meant to be worked off, not
                                        paged through. Say it if it ever overflows,
                                        because the counts above are then partial. */}
                                    {waiting.items.length < waiting.total && (
                                        <Text size="xs" c={COLOR.attention} mb="xs">
                                            Showing {waiting.items.length} of {waiting.total} open requests.
                                        </Text>
                                    )}
                                </>
                            )}

                            <Group gap="xs" mb="xs" wrap="nowrap">
                                <TextInput
                                    size="xs"
                                    style={{ flex: 1 }}
                                    placeholder="Search name, owner, group…"
                                    aria-label="Search the budget tree"
                                    leftSection={searchBusy ? <Loader size="12" /> : <Search size="13" />}
                                    value={search}
                                    onChange={(e) => changeSearch(e.currentTarget.value)}
                                    rightSection={search ? (
                                        <ActionIcon size="xs" variant="subtle" color="gray"
                                            aria-label="Clear search" onClick={() => changeSearch('')}>
                                            <X size="12" />
                                        </ActionIcon>
                                    ) : null}
                                />
                            </Group>

                            {/* Searching and filtering each replace the tree with a
                                flat list — see the note on this component. */}
                            <ScrollArea.Autosize mah="70vh">
                                {searching ? (
                                    <NodeResultList
                                        nodes={results?.items}
                                        total={results?.total}
                                        onMore={loadMoreResults}
                                        selectedId={selected?.id}
                                        onSelect={select}
                                        emptyText={searchBusy ? 'Searching…' : 'No matches.'}
                                    />
                                ) : filtering ? (
                                    <NodeResultList
                                        nodes={waitingList}
                                        selectedId={selected?.id}
                                        onSelect={select}
                                        emptyText="Nothing is waiting for your decision."
                                    />
                                ) : (
                                    <BudgetTree
                                        data={treeData}
                                        tree={tree}
                                        selectedId={selected?.id}
                                        onSelect={select}
                                        onLoadMore={loadMoreChildren}
                                    />
                                )}
                            </ScrollArea.Autosize>
                        </Paper>
                    </Grid.Col>

                    {/* ── Detail panel: the selected node ────────────────── */}
                    <Grid.Col span={{ base: 12, md: 7, lg: 8 }}>
                        {!selected && (
                            <Alert color={COLOR.info} variant="light">
                                Select a budget or project in the tree to see its details.
                            </Alert>
                        )}
                        {selected && (isBudget(selected) ? (
                            <BudgetCard node={selected} resources={resources}
                                onAction={handleAction} manageable />
                        ) : (
                            <ProjectCard node={selected} resources={resources} parentName={selected.parent_name}
                                perspective="manager" onAction={handleAction} />
                        ))}
                    </Grid.Col>
                </Grid>
            )}

            {/* ── Dialogs (one instance per view) ────────────────────────── */}
            <BudgetFormModal
                opened={!!budgetForm}
                onClose={() => setBudgetForm(null)}
                onDone={refresh}
                resources={resources}
                mode={budgetForm?.mode}
                parent={budgetForm?.parent}
                node={budgetForm?.node}
                eligibleBudgets={budgetRequestTargets}
                currentUserEmail={userEmail}
            />
            <ApproveModal key={`approvemodal:${dlg.key}`} opened={dlg.is('approve')} onClose={dlg.close} onDone={refresh}
                resources={resources} node={dlg.node} />
            <RejectModal key={`rejectmodal:${dlg.key}`} opened={dlg.is('reject')} onClose={dlg.close} onDone={refresh} node={dlg.node} />
            <MoveModal key={`movemodal:${dlg.key}`} opened={dlg.is('move')} onClose={dlg.close} onDone={refresh}
                node={dlg.node} targetBudgets={moveTargets} />
            <TransferOwnerModal key={`transferownermodal:${dlg.key}`} opened={dlg.is('transfer')} onClose={dlg.close} onDone={refresh} node={dlg.node} />
            <AdoptModal key={`adoptmodal:${dlg.key}`} opened={dlg.is('adopt')} onClose={dlg.close} onDone={refresh}
                resources={resources} node={dlg.node} myBudgets={myBudgets.items} />
            {/* One modal for both triggers: the History button opens it on that tab. */}
            <NodeInspectModal key={`nodeinspectmodal:${dlg.key}`} opened={dlg.is('details') || dlg.is('history')}
                initialTab={dlg.is('history') ? TAB_HISTORY : TAB_DETAILS}
                onClose={dlg.close} node={dlg.node} resources={resources} />
        </Stack>
    );
}
