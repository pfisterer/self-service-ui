import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronsDownUp, ChevronsUpDown, Inbox, Search, X } from 'lucide-react';
import { ActionIcon, Alert, Badge, Box, Button, Checkbox, Flex, Modal, Group, Loader, Paper, SegmentedControl, Stack, Text, TextInput, Tooltip, useTree } from '@mantine/core';
import { Loading, LoadError } from '/helper/query-state.jsx';
import { useAuth } from '/providers/auth.jsx';
import { useConfirm } from '/providers/confirm.jsx';
import { useErrorModal } from '/providers/error-modal.jsx';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDebouncedValue, useLocalStorage } from '@mantine/hooks';
import { PAGE_SIZE, useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { BudgetCard } from './card-budget.jsx';
import { ProjectCard } from './card-project.jsx';
import { BudgetTree, MORE_SUFFIX, NodeResultList, budgetsToTreeData, budgetChildCount } from './component-budget-tree.jsx';
import { BudgetProjectsTable } from './component-budget-projects.jsx';
import { AllocationModal } from './modal-allocation.jsx';
import { RetireModal } from './modal-retire.jsx';
import { ApproveModal } from './modal-approve.jsx';
import { BudgetFormModal } from './modal-budget-form.jsx';
import { ProjectFormModal } from './modal-project-form.jsx';
import { NodeInspectModal } from './modal-inspect.jsx';
import { MoveModal } from './modal-move.jsx';
import { RejectModal } from './modal-reject.jsx';
import { TransferOwnerModal } from './modal-transfer-owner.jsx';
import { useNodeDialog } from './use-node-dialog.jsx';
import { useProjectConfig } from './projects.jsx';
import { useTranslation } from 'react-i18next';
import { useLocation, useRouter } from 'wouter';
import { childrenById, COLOR, formatError, getAuthUserEmail, isBudget, requestTypes, requestType } from './util-project.jsx';
import { useCloudStatus } from './cloud-status.jsx';

// How long typing pauses before a search is sent.
const SEARCH_DEBOUNCE_MS = 300;

// How long a loaded branch counts as fresh. Long enough that opening a node
// does not fetch it twice (see childQuery), short enough that a branch someone
// leaves sitting open is re-read when they come back to it. Changes made in
// this view do not wait for it — every write invalidates.
const CHILDREN_STALE_MS = 30_000;

// MyBudgetsView is a master-detail tree navigator: the left side shows the
// budgets the user manages as an expandable tree (sub-budgets load lazily on
// expand, one page at a time), the right side shows the selected budget with
// its usage, access rules and actions, and below it a table of the projects
// paid from it. Projects are not in the tree: a budget for all students of a
// location holds hundreds, which buried the budget structure and could only be
// scrolled, not filtered. The table filters, sorts and pages on the server. Delegating resources =
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

// The selected node is in the URL (/budgets/<id>), so a link to a budget or a
// project can be sent: opening it selects the node and opens the tree down to
// it. A node that does not exist, or that the viewer may not see, falls back to
// the first budget with a note saying so.
export function MyBudgetsView({ params }) {
    const { t } = useTranslation();
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
    // How many rows of a node's children to hold, per node. "Show more" raises
    // this; the query key follows it, so the cache keeps one entry per branch
    // instead of a pile of pages the view would have to stitch together.
    const [limits, setLimits] = useState({});
    const [selectedNode, setSelectedNode] = useState(null);
    const [, navigate] = useLocation();
    const router = useRouter();
    const linkedId = params?.id ?? null;
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
    // The project a table row was opened for, shown as its full card in a
    // dialog so the table stays where it was.
    const [openProject, setOpenProject] = useState(null);
    // Whether the selected budget's table lists the projects it allocated to
    // further down instead of its own; kept per budget, so choosing another
    // budget starts with its own projects.
    const [allocatedFor, setAllocatedFor] = useState(null);

    // Which of the managed budgets are drawn at the top.
    //
    // A manager of a budget is often also in the admin_scope of budgets nested
    // under it, and my-budgets returns that as a flat list — so the ones that
    // are already reachable by expanding another entry have to be left out, or
    // they appear twice: once at the top and once in their real place.
    //
    // The test is the whole ANCESTOR chain, not the direct parent. Comparing
    // parents breaks as soon as the chain skips a level, and it skips exactly
    // where it is most likely to: the node in between belongs to someone else,
    // so it is not in this list at all. Observed on staging on 2026-08-25 — a
    // root admin also managing a budget under an unmanaged faculty budget saw
    // both of theirs drawn twice.
    //
    // ancestor_ids is missing when the API is older than this UI, which is the
    // normal state for a few minutes during a rollout. Falling back to the
    // parent check keeps the view working with the old, occasionally doubled
    // result rather than treating every budget as a root.
    const rootBudgets = useMemo(() => {
        const managedIds = new Set(myBudgets.items.map(b => b.id));
        return myBudgets.items.filter(b => (
            b.ancestor_ids
                ? !b.ancestor_ids.some(id => managedIds.has(id))
                : !managedIds.has(b.parent_id)
        ));
    }, [myBudgets]);

    // Budgets the user may request from but does not manage, shown read-only in
    // the tree: a requester sees where their requests draw from and how full it
    // is. The server already hands them exactly this (eligible-for-me carries
    // the usage rollup). Not expandable — listing children is a manager's view —
    // so child_count is dropped, and request_only marks the rows and gates the
    // card's actions. Direct parent managed = already reachable in the tree.
    const requestableOnly = useMemo(() => {
        const managedIds = new Set(myBudgets.items.map(b => b.id));
        return (eligibleQuery.data?.items ?? [])
            .filter(b => !managedIds.has(b.id) && !managedIds.has(b.parent_id))
            .map(b => ({ ...b, child_count: 0, request_only: true }));
    }, [myBudgets, eligibleQuery.data]);

    // The node a link names, fetched only when it is not the one in hand —
    // after a click in the tree the URL already matches the selection.
    const linkedQuery = useQuery({
        queryKey: projectKeys.node(linkedId),
        queryFn: () => api.getNode(linkedId),
        enabled: !!api && !!linkedId && selectedNode?.id !== linkedId,
        retry: false,
    });
    const linked = linkedId && selectedNode?.id !== linkedId ? linkedQuery.data : null;
    // A missing node (404) and one the viewer may not see (403) both end here.
    const linkMissing = !!linkedId && selectedNode?.id !== linkedId && !linkedQuery.isPending && !linkedQuery.data;

    // Nothing picked yet falls back to the first root, so the detail panel is
    // never empty for someone who manages something. Derived rather than written
    // into state when the roots arrive: an effect that "selects the first one"
    // also has to decide what to do when the list changes under it. While a
    // linked node is loading nothing is shown, so the first root does not
    // flash up before it.
    const linkLoading = !!linkedId && selectedNode?.id !== linkedId && linkedQuery.isPending;
    const selected = linkLoading ? null
        : (linked ?? selectedNode ?? rootBudgets[0] ?? requestableOnly[0] ?? null);
    const linkTo = (node) => `${window.location.origin}${router.base}/budgets/${encodeURIComponent(node.id)}`;

    const childLimit = (nodeId) => limits[nodeId] ?? PAGE_SIZE;
    const childQuery = (nodeId) => ({
        queryKey: projectKeys.children(nodeId, childLimit(nodeId)),
        queryFn: () => api.listChildren(nodeId, { limit: childLimit(nodeId), kind: 'budget' }),
        // Not a caching nicety, a correctness one for the pair below: with the
        // default of 0 the row that onLoadChildren just fetched is stale the
        // moment it arrives, so the query mounting behind it fetches the same
        // branch a second time. Every first expand would cost two requests.
        // Writes invalidate regardless of this, so nothing goes stale unseen.
        staleTime: CHILDREN_STALE_MS,
        // A node that was expanded and has since been deleted or released keeps
        // its entry in the expansion state, so its query outlives it and answers
        // 404. Nothing renders for it — it is not in the tree any more — and the
        // default three retries would repeat that on every invalidation. Fail
        // once and stay quiet.
        retry: false,
    });

    // Lazy loading: the tree calls this the first time a node with children is
    // opened. It only warms the cache — the query below is what the view reads,
    // and it starts as soon as the node counts as expanded. Going through
    // fetchQuery rather than the api directly means the two share one cache
    // entry, so this is not a second request.
    //
    // Awaited, and errors propagate on purpose: that is what gives the row its
    // spinner and its in-place failure marker instead of a modal that loses the
    // context. A rejected load is not remembered as loaded, so collapsing and
    // reopening retries it.
    const loadChildren = (nodeId) => queryClient.fetchQuery(childQuery(nodeId));

    const tree = useTree({ multiple: false, onLoadChildren: loadChildren });

    // The branches currently open. This — not a Map the view maintains — is what
    // decides which children are fetched, so expansion and data cannot disagree.
    // The "show more" placeholder rows are not nodes and have nothing to fetch.
    const openIds = useMemo(
        () => Object.entries(tree.expandedState)
            .filter(([id, open]) => open && !id.endsWith(MORE_SUFFIX))
            .map(([id]) => id),
        [tree.expandedState],
    );

    // One query per open branch, under the shared `tree()` prefix — so every
    // write already invalidates them and the tree refreshes itself. That is the
    // whole point of the rewrite: the children used to live in component state,
    // where `invalidates: [projectKeys.tree()]` could not reach them and a
    // hand-written refresh had to guess which branches to reload.
    //
    // `combine` has to keep its identity across renders, and childrenById has to
    // return a PLAIN OBJECT — see the note on that function. Pending branches are
    // simply absent: budgetsToTreeData reads that as "not loaded yet".
    const combineChildren = useCallback((results) => childrenById(openIds, results), [openIds]);
    const childrenMap = useQueries({
        queries: openIds.map(id => ({ ...childQuery(id), enabled: !!api })),
        combine: combineChildren,
    });

    // The "show more" row under a partly loaded budget: raise this branch's
    // limit. Fetched before the key moves so the rows do not blink out and back
    // in, and so MoreRow's spinner covers the wait.
    //
    // This refetches the branch rather than appending the next page — the same
    // trade the old refresh already made when it reloaded each open branch with
    // as many rows as were showing. It costs a bigger response on later clicks
    // and buys one cache entry per branch instead of a merge the view has to get
    // right on every path.
    const loadMoreChildren = async (nodeId) => {
        const next = childLimit(nodeId) + PAGE_SIZE;
        try {
            await queryClient.fetchQuery({
                queryKey: projectKeys.children(nodeId, next),
                queryFn: () => api.listChildren(nodeId, { limit: next, kind: 'budget' }),
            });
            setLimits(prev => ({ ...prev, [nodeId]: next }));
        } catch (e) {
            showError(formatError(e));
        }
    };

    // Everything the tree shows now sits under the `tree()` prefix, so one
    // invalidation reaches the lists AND every open branch — including the two
    // this view cannot name after a move, the one the node came from and the one
    // it went to. This used to walk the open branches by hand and rebuild the
    // page map wholesale, which is what left expansion and data disagreeing.
    //
    // Two things stay by hand, because neither is server state a key describes:
    // the selection (one node, and it has to be DROPPED when it vanishes) and
    // the header badge.
    const refresh = async () => {
        try {
            await queryClient.invalidateQueries({ queryKey: projectKeys.tree() });
            // The header badge shows the same number; a decision made here must
            // not leave it stale.
            cloudStatus.refresh();

            // Refresh the selected node too; drop the selection if it vanished
            // (deleted, released, moved out of sight).
            if (selectedNode) {
                const current = await api.getNode(selectedNode.id).catch(() => null);
                setSelectedNode(current);
                if (!current) navigate('/budgets', { replace: true });
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
    // several roots in a row would keep only the last one. Fetching is not ours
    // to trigger any more — a branch that counts as open is queried by that
    // alone.
    //
    // Keyed on the root IDs and not on the root OBJECTS: a write that only
    // changes a root's child_count (a move into one, say) hands back a new array
    // but the same set of roots, and re-running then re-opened what the user had
    // just collapsed.
    const rootIds = rootBudgets.map(b => b.id).join('\u0000');
    useEffect(() => {
        const openable = rootBudgets.filter(b => budgetChildCount(b) > 0);
        if (openable.length === 0) return;
        tree.setExpandedState({
            ...tree.expandedState,
            ...Object.fromEntries(openable.map(b => [b.id, true])),
        });
        // `tree` and `rootBudgets` are read to decide what to open; listing them
        // would re-run this on every expand and fight the user's own collapsing.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rootIds]);

    // A linked node is opened in the tree: every budget on its way down from the
    // first one the viewer manages. What lies above that is not in their tree.
    // parent_path leaves out the root, which is open anyway where it is shown.
    useEffect(() => {
        if (!linked) return;
        const shown = new Set(rootBudgets.map(b => b.id));
        const path = (linked.parent_path || []).map(p => p.id);
        let from = path.findIndex(id => shown.has(id));
        if (from < 0 && shown.has('root')) from = 0;
        if (from < 0) return;
        tree.setExpandedState({
            ...tree.expandedState,
            ...Object.fromEntries(path.slice(from).map(id => [id, true])),
        });
        // `tree` is read to keep what is open; listing it would re-run this on
        // every toggle and re-open what the user just closed.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [linked?.id, rootIds]);

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
        () => budgetsToTreeData(t, [...rootBudgets, ...requestableOnly], childrenMap),
        [t, rootBudgets, requestableOnly, childrenMap],
    );

    // "Expand everything", remembered per browser. The tree loads a branch when
    // it is opened, so everything cannot be opened at once: each pass opens the
    // budgets that are loaded and still closed, their children arrive, and the
    // next pass opens those — level by level until nothing closed is left.
    const [expandAll, setExpandAll] = useLocalStorage({
        key: 'self-service.budget-tree.expand-all',
        defaultValue: false,
        getInitialValueInEffect: false,
    });
    useEffect(() => {
        if (!expandAll) return;
        const closed = [];
        const walk = (rows) => rows.forEach(row => {
            if (row.hasChildren && !tree.expandedState[row.value]) closed.push(row.value);
            if (row.children) walk(row.children);
        });
        walk(treeData);
        if (closed.length) {
            tree.setExpandedState({ ...tree.expandedState, ...Object.fromEntries(closed.map(id => [id, true])) });
        }
        // `tree` is read to see what is open; listing it would re-run this on
        // every toggle, which is the point only while expandAll is on anyway.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expandAll, treeData]);
    // Switching it off goes back to the default: the first level open.
    const toggleExpandAll = () => {
        if (expandAll) {
            tree.setExpandedState(Object.fromEntries(
                rootBudgets.filter(b => budgetChildCount(b) > 0).map(b => [b.id, true])));
        }
        setExpandAll(!expandAll);
    };

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

    // Clicking a row selects it and puts it in the URL — replacing the entry, so
    // clicking through the tree does not fill the browser's history. Expanding
    // is handled by the tree itself (expandOnClick), which also triggers
    // onLoadChildren on first open.
    const select = (node) => {
        setSelectedNode(node);
        navigate(`/budgets/${encodeURIComponent(node.id)}`, { replace: true });
    };

    const handleDelete = async (node) => {
        const ok = await confirm({
            title: t('projects.budgets.deleteTitle', { name: node.name || node.id }),
            message: t('projects.budgets.deleteMessage'),
        });
        if (!ok) return;
        try {
            await api.deleteNode(node.id);
            refresh();
        } catch (e) {
            showError(formatError(e));
        }
    };

    // Central action dispatch for both node kinds. An action started from the
    // project dialog closes it: the dialog it opens is the next thing to look at, and
    // the card behind it would show the state before the change.
    const handleAction = (action, node) => {
        setOpenProject(null);
        if (action === 'sub-budget') return setBudgetForm({ mode: 'create', parent: node });
        // From a read-only budget: request under it — `parent` preselects it.
        if (action === 'request-here') return setBudgetForm({ mode: 'request', parent: node });
        if (action === 'edit') {
            // Editing a budget IS delegating from its parent, so the form has
            // to offer the PARENT's resource scope: the child's own scope can
            // by definition never contain a resource it has not been given
            // yet, so a catalogue entry new to the platform would stay
            // invisible forever. When the parent is outside the caller's view
            // the node itself remains the fallback — the server enforces the
            // real boundary either way.
            const parent = [...myBudgets.items, ...Object.values(childrenMap).flatMap(p => p.items)]
                .find(b => b.id === node.parent_id) || null;
            return setBudgetForm({ mode: 'edit', node, parent });
        }
        if (action === 'delete') return handleDelete(node);
        if (action === 'show-allocated') return setAllocatedFor(node.id);
        dlg.open(action, node);
    };

    if (!api || !config || myBudgetsQuery.isPending) return <Loading />;
    if (myBudgetsQuery.isError) return <LoadError query={myBudgetsQuery} title={t('projects.budgets.loadError')} />;

    const resources = config.resources || [];
    // Move targets: every budget visible in the tree.
    const loadedBudgets = Object.values(childrenMap).flatMap(p => p.items).filter(isBudget);
    const moveTargets = [
        ...myBudgets.items,
        ...loadedBudgets.filter(b => !myBudgets.items.some(r => r.id === b.id)),
    ];

    return (
        <Stack>
            <Group justify="space-between" align="center">
                <Text size="sm" c="dimmed">
                    {requestableOnly.length > 0
                        ? t('projects.budgets.introWithRequestable')
                        : t('projects.budgets.intro')}
                    {' '}
                    {t('projects.budgets.introSelect')}
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
                    {budgetRequestTargets.length > 0
                        ? t('projects.budgets.noneCanRequest')
                        : t('projects.budgets.none')}
                </Alert>
            )}

            {/* The roots are fetched in one go — one person manages a handful of
                budgets. Say so rather than quietly drop the rest if that ever
                stops being true. */}
            {myBudgets.items.length < myBudgets.total && (
                <Alert color={COLOR.attention} variant="light">
                    {t('projects.budgets.shown', { shown: myBudgets.items.length, total: myBudgets.total })}
                </Alert>
            )}

            {(myBudgets.items.length > 0 || requestableOnly.length > 0) && (
                // align="flex-start": tree and detail panel each keep their
                // natural height — otherwise the panel card stretches to the
                // tree's height and its action bar floats far below the content.
                // The tree takes the width its rows need, within bounds; the
                // detail panel gets the rest. A fixed third for the tree left it
                // half empty on a flat tree and squeezed the project table next
                // to it into scrolling sideways.
                <Flex gap="md" align="flex-start" direction={{ base: 'column', md: 'row' }}>
                    {/* ── Tree navigation ────────────────────────────────── */}
                    <Box w={{ base: '100%', md: 'fit-content' }} miw={{ md: 240 }} maw={{ md: 380 }}
                        style={{ flexShrink: 0 }}>
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
                                    { value: '', label: t('projects.budgets.filterAll') },
                                    {
                                        value: 'waiting',
                                        label: (
                                            <Group gap="4" wrap="nowrap" justify="center">
                                                <span>{t('projects.budgets.filterWaiting')}</span>
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
                                                {
                                                    value: 'waiting',
                                                    label: t('projects.budgets.filterCount', {
                                                        label: t('projects.budgets.filterAll'),
                                                        count: waitingCount('waiting'),
                                                    }),
                                                },
                                                ...requestTypes(t).map(kind => ({
                                                    value: kind.value,
                                                    label: t('projects.budgets.filterCount', {
                                                        label: kind.label,
                                                        count: waitingCount(kind.value),
                                                    }),
                                                    disabled: waitingCount(kind.value) === 0,
                                                })),
                                            ]}
                                        />
                                    )}
                                    <Checkbox
                                        size="xs"
                                        mb="xs"
                                        label={t('projects.budgets.includeSubtree')}
                                        checked={includeSubtree}
                                        onChange={(e) => changeScope(e.currentTarget.checked)}
                                    />
                                    {/* The inbox is fetched in one go — a queue of
                                        decisions is meant to be worked off, not
                                        paged through. Say it if it ever overflows,
                                        because the counts above are then partial. */}
                                    {waiting.items.length < waiting.total && (
                                        <Text size="xs" c={COLOR.attention} mb="xs">
                                            {t('projects.budgets.openShown', { shown: waiting.items.length, total: waiting.total })}
                                        </Text>
                                    )}
                                </>
                            )}

                            <Group gap="xs" mb="xs" wrap="nowrap">
                                <TextInput
                                    size="xs"
                                    style={{ flex: 1 }}
                                    placeholder={t('projects.budgets.searchPlaceholder')}
                                    aria-label={t('projects.budgets.searchLabel')}
                                    leftSection={searchBusy ? <Loader size="12" /> : <Search size="13" />}
                                    value={search}
                                    onChange={(e) => changeSearch(e.currentTarget.value)}
                                    rightSection={search ? (
                                        <ActionIcon size="xs" variant="subtle" color="gray"
                                            aria-label={t('projects.budgets.clearSearch')} onClick={() => changeSearch('')}>
                                            <X size="12" />
                                        </ActionIcon>
                                    ) : null}
                                />
                                {!searching && !filtering && (
                                    <Tooltip label={t(expandAll ? 'projects.budgets.collapseAll' : 'projects.budgets.expandAll')}>
                                        <ActionIcon size="sm" variant={expandAll ? 'light' : 'subtle'} color="gray"
                                            aria-label={t(expandAll ? 'projects.budgets.collapseAll' : 'projects.budgets.expandAll')}
                                            aria-pressed={expandAll} onClick={toggleExpandAll}>
                                            {expandAll ? <ChevronsDownUp size="14" /> : <ChevronsUpDown size="14" />}
                                        </ActionIcon>
                                    </Tooltip>
                                )}
                            </Group>

                            {/* Searching and filtering each replace the tree with a
                                flat list — see the note on this component. */}
                            {/* No height of its own: a long tree scrolls with the
                                page instead of in a box with a second scrollbar. */}
                            <div>
                                {searching ? (
                                    <NodeResultList
                                        nodes={results?.items}
                                        total={results?.total}
                                        onMore={loadMoreResults}
                                        selectedId={selected?.id}
                                        onSelect={select}
                                        emptyText={searchBusy ? t('projects.budgets.searching') : t('projects.budgets.noMatches')}
                                    />
                                ) : filtering ? (
                                    <NodeResultList
                                        nodes={waitingList}
                                        selectedId={selected?.id}
                                        onSelect={select}
                                        emptyText={t('projects.budgets.nothingWaiting')}
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
                            </div>
                        </Paper>
                    </Box>

                    {/* ── Detail panel: the selected node ────────────────── */}
                    <Box w="100%" style={{ flex: 1, minWidth: 0 }}>
                        {linkMissing && (
                            <Alert color={COLOR.attention} variant="light" mb="md">
                                {t('projects.budgets.linkMissing')}
                            </Alert>
                        )}
                        {linkLoading && <Loader size="sm" />}
                        {!selected && !linkLoading && (
                            <Alert color={COLOR.info} variant="light">
                                {t('projects.budgets.selectHint')}
                            </Alert>
                        )}
                        {selected && (isBudget(selected) ? (
                            <Stack>
                                <BudgetCard node={selected} resources={resources}
                                    link={linkTo(selected)}
                                    onAction={handleAction}
                                    manageable={!selected.request_only} />
                                {/* Listing a budget's projects is a manager's view;
                                    a budget one may only request under has none
                                    to show. Keyed by budget so its filters reset
                                    when another budget is picked. */}
                                {!selected.request_only && (
                                    <BudgetProjectsTable key={selected.id} budget={selected} resources={resources}
                                        onAction={handleAction} onOpen={setOpenProject}
                                        allocatedOnly={allocatedFor === selected.id}
                                        onAllocatedOnlyChange={(on) => setAllocatedFor(on ? selected.id : null)} />
                                )}
                            </Stack>
                        ) : (
                            <ProjectCard node={selected} resources={resources} parentName={selected.parent_name}
                                link={linkTo(selected)} perspective="manager" onAction={handleAction} />
                        ))}
                    </Box>
                </Flex>
            )}

            <Modal opened={!!openProject} onClose={() => setOpenProject(null)} size="lg" centered
                title={t('projects.budgetProjects.projectTitle')}>
                {openProject && (
                    <ProjectCard node={openProject} resources={resources} parentName={openProject.parent_name ?? selected?.name}
                        link={linkTo(openProject)}
                        perspective="manager" onAction={handleAction} />
                )}
            </Modal>

            {/* ── Dialogs (one instance per view) ────────────────────────── */}
            {/* Keyed like every other dialog here, and for a sharper reason: this
                form reads the node ONCE, into useForm's initialValues. Without a
                key the instance mounted with the view — before anything was
                selected — and every later "Edit" showed that first state: an empty
                name, the default quota, an empty "Managed by". Saving it would
                have renamed the budget to nothing and shrunk its limits to the
                defaults. */}
            <BudgetFormModal
                key={`budgetform:${budgetForm?.mode ?? 'closed'}:${budgetForm?.node?.id ?? budgetForm?.parent?.id ?? ''}`}
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
            <AllocationModal key={`allocationmodal:${dlg.key}`} opened={dlg.is('allocate')} onClose={dlg.close} onDone={refresh}
                node={dlg.node} resources={resources} />
            <RetireModal key={`retiremodal:${dlg.key}`} opened={dlg.is('release') || dlg.is('delete-for-good')}
                mode={dlg.is('delete-for-good') ? 'delete' : 'release'} onClose={dlg.close} onDone={refresh} node={dlg.node} />
            {/* Adopting an import is the project dialog with an owner and a
                paying budget in front — same tabs, members correctable. */}
            <ProjectFormModal
                key={`adopt:${dlg.key}`}
                adopt
                opened={dlg.is('adopt')}
                onClose={dlg.close}
                onDone={refresh}
                resources={resources}
                openstackRoles={config.openstackRoles}
                node={dlg.node}
                myBudgets={myBudgets.items}
            />
            {/* A manager may edit a project of theirs, so the change dialog has to
                exist on this side too — not only in My Projects. On a pending
                request it amends in place; on an approved one it files a change
                for them to approve. */}
            <ProjectFormModal
                key={`change:${dlg.key}`}
                opened={dlg.is('change')}
                onClose={dlg.close}
                onDone={refresh}
                resources={resources}
                openstackRoles={config.openstackRoles}
                node={dlg.node}
                // The budget the project was opened under: its end and its
                // maximum project term bound the new end date. A sub-budget
                // managed through an ancestor is not among myBudgets.
                myBudgets={selected ? [selected, ...myBudgets.items] : myBudgets.items}
                // Opened from a budget's projects: a manager of it, who says
                // who pays — the owner does not.
                canEditAttributes
            />
            {/* History is a tab in here, not a button of its own outside. */}
            <NodeInspectModal key={`nodeinspectmodal:${dlg.key}`} opened={dlg.is('details')}
                onClose={dlg.close} node={dlg.node} resources={resources} />
        </Stack>
    );
}
