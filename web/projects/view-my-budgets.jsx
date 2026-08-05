import { useEffect, useMemo, useState } from 'react';
import { ChevronsDownUp, ChevronsUpDown, Inbox, Search, X } from 'lucide-react';
import { ActionIcon, Alert, Badge, Button, Checkbox, filterTreeData, getTreeExpandedState, Grid, Group, Loader, Paper, ScrollArea, SegmentedControl, Stack, Text, TextInput, Tooltip, useTree } from '@mantine/core';
import { Delayed } from '/helper/delayed.jsx';
import { useAuth } from '/providers/auth.jsx';
import { useConfirm } from '/providers/confirm.jsx';
import { useErrorModal } from '/providers/error-modal.jsx';
import { useNodesApi } from './api-nodes.jsx';
import { BudgetCard } from './card-budget.jsx';
import { ProjectCard } from './card-project.jsx';
import { BudgetTree, budgetNodeFilter, budgetsToTreeData } from './component-budget-tree.jsx';
import { AdoptModal } from './modal-adopt.jsx';
import { ApproveModal } from './modal-approve.jsx';
import { BudgetFormModal } from './modal-budget-form.jsx';
import { NodeInspectModal, TAB_DETAILS, TAB_HISTORY } from './modal-inspect.jsx';
import { MoveModal } from './modal-move.jsx';
import { RejectModal } from './modal-reject.jsx';
import { TransferOwnerModal } from './modal-transfer-owner.jsx';
import { useNodeDialog } from './use-node-dialog.jsx';
import { useProjectConfig } from './projects.jsx';
import { COLOR, formatError, getAuthUserEmail, isBudget, REQUEST_TYPES, requestType, useAsyncRefresh } from './util-project.jsx';
import { useCloudStatus } from './cloud-status.jsx';

// MyBudgetsView is a master-detail tree navigator: the left side shows the
// budgets the user manages as an expandable tree (sub-budgets and projects
// load lazily on expand), the right side shows the selected node with its
// usage, access rules and actions. Delegating resources = creating a
// sub-budget with someone else in "Managed by" — there is deliberately no
// separate "delegation" concept.
export function MyBudgetsView() {
    const api = useNodesApi();
    const { user } = useAuth();
    const { showError } = useErrorModal();
    const confirm = useConfirm();
    const config = useProjectConfig();
    const cloudStatus = useCloudStatus();
    const userEmail = getAuthUserEmail(user);

    const [myBudgets, setMyBudgets] = useState([]);
    const [eligibleBudgets, setEligibleBudgets] = useState([]);
    // Budgets that accept a request for a sub-budget — a budget may take project
    // requests while refusing sub-budgets (allow_sub_budget_requests). Offering
    // one anyway would produce a request the server rejects.
    const budgetRequestTargets = useMemo(
        () => eligibleBudgets.filter(b => b.allow_sub_budget_requests !== false),
        [eligibleBudgets]);
    // Tree state: the children loaded so far. Expansion, per-node loading and
    // load errors are owned by the Mantine tree controller below.
    const [childrenMap, setChildrenMap] = useState(new Map());
    const [selected, setSelected] = useState(null);
    const [search, setSearch] = useState('');
    // '' = the whole tree; 'waiting' = everything that needs a decision; the
    // rest narrow that down to one kind of request (see REQUEST_TYPES).
    const [filter, setFilter] = useState('');
    // Everything awaiting this user's decision — one request, where finding the
    // same nodes in the tree would mean expanding it all. By default that is
    // what nobody else manages; a request inside a delegated sub-budget belongs
    // to its manager and would otherwise bury the own ones (a root admin would
    // see the whole organization).
    const [waiting, setWaiting] = useState([]);
    const [includeSubtree, setIncludeSubtree] = useState(false);
    const scope = includeSubtree ? 'subtree' : 'direct';
    const dlg = useNodeDialog();
    const [budgetForm, setBudgetForm] = useState(null); // { mode, parent?, node? } | null

    // A manager of a budget is often also in the admin_scope of budgets nested
    // under it, and my-budgets returns that flat list — rendering every entry
    // as a top-level root would show those nested budgets twice. Keep only the
    // budgets whose direct parent is not itself in the managed set; the rest
    // appear in their natural place when their parent is expanded.
    const managedIds = new Set(myBudgets.map(b => b.id));
    const rootBudgets = myBudgets.filter(b => !managedIds.has(b.parent_id));

    // Lazy loading: the tree calls this the first time a node with children is
    // opened. Errors propagate on purpose — the controller records them and the
    // row shows the failure in place instead of a modal that loses the context.
    const loadChildren = async (nodeId) => {
        const kids = await api.listChildren(nodeId);
        setChildrenMap(m => new Map(m).set(nodeId, kids));
    };

    const tree = useTree({ multiple: false, onLoadChildren: loadChildren });

    // Reloads the roots AND everything currently visible in the tree, so the
    // usage bars and statuses are fresh after every action.
    const { loaded, refresh } = useAsyncRefresh(async () => {
        const [budgets, eligible, toManage] = await Promise.all([
            api.listMyBudgets(),
            api.listEligibleForMe(),
            api.listToManage(scope),
        ]);
        setMyBudgets(budgets);
        setEligibleBudgets(eligible);
        setWaiting(toManage);
        // The header badge shows the same number; a decision made here must not
        // leave it stale.
        cloudStatus.refresh();

        const ids = Object.entries(tree.expandedState).filter(([, open]) => open).map(([id]) => id);
        const loadedKids = await Promise.all(ids.map(id => api.listChildren(id).catch(() => null)));
        const map = new Map();
        ids.forEach((id, i) => { if (loadedKids[i]) map.set(id, loadedKids[i]); });
        setChildrenMap(map);

        // Refresh the selected node too; drop the selection if it vanished
        // (deleted, released, moved out of sight).
        if (selected) {
            setSelected(await api.getNode(selected.id).catch(() => null));
        }
    }, showError);

    useEffect(() => { if (api) refresh(); }, [api, userEmail]);

    // Select the first budget once the roots arrive, so the panel is never
    // empty for users who manage something.
    useEffect(() => {
        if (!selected && rootBudgets.length > 0) setSelected(rootBudgets[0]);
    }, [myBudgets]);

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
    }, [myBudgets]);

    // Loads the children of every budget in the tree, level by level. Needed
    // by full-text search and "expand all"; already-loaded budgets are skipped.
    const loadAllChildren = async () => {
        const map = new Map(childrenMap);
        let frontier = rootBudgets;
        while (frontier.length > 0) {
            const budgets = frontier.filter(isBudget);
            const toLoad = budgets.filter(b => !map.has(b.id));
            const results = await Promise.all(toLoad.map(b => api.listChildren(b.id).catch(() => [])));
            toLoad.forEach((b, i) => map.set(b.id, results[i]));
            frontier = budgets.flatMap(b => map.get(b.id) || []);
        }
        setChildrenMap(map);
        return map;
    };

    const expandAll = async () => {
        // Expand from the freshly loaded map: the derived tree data has not been
        // re-rendered yet at this point, so the controller must be told directly.
        const map = await loadAllChildren();
        tree.setExpandedState(getTreeExpandedState(budgetsToTreeData(rootBudgets, map), '*'));
    };
    const collapseAll = () => tree.collapseAllNodes();

    // Search and the request filter both look at the WHOLE tree, so it has to be
    // in memory once either is on (no-op when everything is already loaded).
    const searching = search.trim().length > 0;
    const filtering = filter !== '';
    useEffect(() => { if (searching || filtering) loadAllChildren(); }, [searching, filtering]);

    const treeData = useMemo(
        () => budgetsToTreeData(rootBudgets, childrenMap),
        [myBudgets, childrenMap],
    );

    // The filter matches against the inbox, not against the node's status: both
    // must mean the same thing, or the tree would show rows the count above it
    // excludes (a request in a delegated sub-budget, with the scope off).
    const waitingIds = useMemo(() => new Set(waiting.map(n => n.id)), [waiting]);

    // Mantine keeps the ancestors of a match, so a hit stays visible in its
    // context.
    const visibleData = useMemo(() => {
        let data = treeData;
        if (filtering) {
            data = filterTreeData(data, filter, (_, treeNode) => {
                const node = treeNode?.nodeProps?.node;
                if (!waitingIds.has(node?.id)) return false;
                return filter === 'waiting' || requestType(node) === filter;
            });
        }
        if (searching) data = filterTreeData(data, search.trim(), budgetNodeFilter);
        return data;
    }, [treeData, filtering, filter, waitingIds, searching, search]);

    // A filtered or searched tree is only useful fully unfolded — the matches
    // usually sit deep in it.
    useEffect(() => {
        if (searching || filtering) tree.setExpandedState(getTreeExpandedState(visibleData, '*'));
    }, [searching, filtering, visibleData]);

    // Widening the scope only changes the inbox, not the tree — so reload just
    // that instead of going through the full refresh.
    const changeScope = async (subtree) => {
        setIncludeSubtree(subtree);
        try {
            setWaiting(await api.listToManage(subtree ? 'subtree' : 'direct'));
        } catch (e) {
            showError(formatError(e));
        }
    };

    // Counts come from the inbox, not from the loaded tree: they must be right
    // before anything is expanded.
    const waitingCount = (type) => (type === 'waiting'
        ? waiting.length
        : waiting.filter(n => requestType(n) === type).length);

    // Clicking a row selects it. Expanding is handled by the tree itself
    // (expandOnClick), which also triggers onLoadChildren on first open.
    const select = (node) => setSelected(node);

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

    if (!config || !loaded) return (<Delayed><Loader /></Delayed>);

    const resources = config.resources || [];
    // Move targets: every budget visible in the tree.
    const loadedBudgets = [...childrenMap.values()].flat().filter(isBudget);
    const moveTargets = [
        ...myBudgets,
        ...loadedBudgets.filter(b => !myBudgets.some(r => r.id === b.id)),
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

            {myBudgets.length === 0 && (
                <Alert color={COLOR.info} variant="light">
                    You don't manage any budgets yet.
                    {budgetRequestTargets.length > 0
                        ? ' You can request one from a budget that accepts sub-budget requests.'
                        : ' A manager of a parent budget can delegate one to you.'}
                </Alert>
            )}

            {myBudgets.length > 0 && (
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
                                onChange={setFilter}
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
                                    {waiting.length > 0 && (
                                        <SegmentedControl
                                            fullWidth
                                            size="xs"
                                            mb="xs"
                                            value={filter}
                                            onChange={setFilter}
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
                                </>
                            )}

                            {/* Toolbar: full-text search + expand/collapse all. */}
                            <Group gap="xs" mb="xs" wrap="nowrap">
                                <TextInput
                                    size="xs"
                                    style={{ flex: 1 }}
                                    placeholder="Search name, owner, group…"
                                    aria-label="Search the budget tree"
                                    leftSection={<Search size="13" />}
                                    value={search}
                                    onChange={(e) => setSearch(e.currentTarget.value)}
                                    rightSection={search ? (
                                        <ActionIcon size="xs" variant="subtle" color="gray"
                                            aria-label="Clear search" onClick={() => setSearch('')}>
                                            <X size="12" />
                                        </ActionIcon>
                                    ) : null}
                                />
                                <Tooltip label="Expand all">
                                    <ActionIcon variant="light" color="gray" aria-label="Expand all"
                                        disabled={searching || filtering} onClick={expandAll}>
                                        <ChevronsUpDown size="14" />
                                    </ActionIcon>
                                </Tooltip>
                                <Tooltip label="Collapse all">
                                    <ActionIcon variant="light" color="gray" aria-label="Collapse all"
                                        disabled={searching || filtering} onClick={collapseAll}>
                                        <ChevronsDownUp size="14" />
                                    </ActionIcon>
                                </Tooltip>
                            </Group>

                            {/* A filtered tree with an empty inbox would just be
                                blank — say why instead. */}
                            {filtering && waiting.length === 0 && (
                                <Text size="xs" c="dimmed" ta="center" py="md">
                                    Nothing is waiting for your decision.
                                </Text>
                            )}

                            <ScrollArea.Autosize mah="70vh">
                                <BudgetTree
                                    data={visibleData}
                                    tree={tree}
                                    selectedId={selected?.id}
                                    onSelect={select}
                                />
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
            <ApproveModal opened={dlg.is('approve')} onClose={dlg.close} onDone={refresh}
                resources={resources} node={dlg.node} />
            <RejectModal opened={dlg.is('reject')} onClose={dlg.close} onDone={refresh} node={dlg.node} />
            <MoveModal opened={dlg.is('move')} onClose={dlg.close} onDone={refresh}
                node={dlg.node} targetBudgets={moveTargets} />
            <TransferOwnerModal opened={dlg.is('transfer')} onClose={dlg.close} onDone={refresh} node={dlg.node} />
            <AdoptModal opened={dlg.is('adopt')} onClose={dlg.close} onDone={refresh}
                resources={resources} node={dlg.node} myBudgets={myBudgets} />
            {/* One modal for both triggers: the History button opens it on that tab. */}
            <NodeInspectModal opened={dlg.is('details') || dlg.is('history')}
                initialTab={dlg.is('history') ? TAB_HISTORY : TAB_DETAILS}
                onClose={dlg.close} node={dlg.node} resources={resources} />
        </Stack>
    );
}
