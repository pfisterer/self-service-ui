import { useEffect, useMemo, useState } from 'react';
import { ChevronsDownUp, ChevronsUpDown, Inbox, Search, X } from 'lucide-react';
import { ActionIcon, Alert, Button, filterTreeData, getTreeExpandedState, Grid, Group, Loader, Paper, ScrollArea, Stack, Text, TextInput, Tooltip, useTree } from '@mantine/core';
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
import { NodeDetailsModal } from './modal-details.jsx';
import { NodeHistoryModal } from './modal-history.jsx';
import { MoveModal } from './modal-move.jsx';
import { RejectModal } from './modal-reject.jsx';
import { TransferOwnerModal } from './modal-transfer-owner.jsx';
import { useNodeDialog } from './use-node-dialog.jsx';
import { useProjectConfig } from './projects.jsx';
import { formatError, getAuthUserEmail, isBudget, useAsyncRefresh } from './util-project.jsx';

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
        const [budgets, eligible] = await Promise.all([
            api.listMyBudgets(),
            api.listEligibleForMe(),
        ]);
        setMyBudgets(budgets);
        setEligibleBudgets(eligible);

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

    // Full-text search filters the WHOLE tree, so it must be loaded once the
    // user starts typing (no-op when everything is already in memory).
    const searching = search.trim().length > 0;
    useEffect(() => { if (searching) loadAllChildren(); }, [searching]);

    const treeData = useMemo(
        () => budgetsToTreeData(rootBudgets, childrenMap),
        [myBudgets, childrenMap],
    );

    const visibleData = useMemo(
        () => (searching ? filterTreeData(treeData, search.trim(), budgetNodeFilter) : treeData),
        [treeData, searching, search],
    );

    // A search result is only useful fully unfolded — the matches usually sit
    // deep in the tree.
    useEffect(() => {
        if (searching) tree.setExpandedState(getTreeExpandedState(visibleData, '*'));
    }, [searching, visibleData]);

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
                <Alert color="blue" variant="light">
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
                                        disabled={searching} onClick={expandAll}>
                                        <ChevronsUpDown size="14" />
                                    </ActionIcon>
                                </Tooltip>
                                <Tooltip label="Collapse all">
                                    <ActionIcon variant="light" color="gray" aria-label="Collapse all"
                                        disabled={searching} onClick={collapseAll}>
                                        <ChevronsDownUp size="14" />
                                    </ActionIcon>
                                </Tooltip>
                            </Group>

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
                            <Alert color="blue" variant="light">
                                Select a budget or project in the tree to see its details.
                            </Alert>
                        )}
                        {selected && (isBudget(selected) ? (
                            <BudgetCard node={selected} resources={resources}
                                onAction={handleAction} manageable />
                        ) : (
                            <ProjectCard node={selected} resources={resources}
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
            <NodeDetailsModal opened={dlg.is('details')} onClose={dlg.close} node={dlg.node} resources={resources} />
            <NodeHistoryModal opened={dlg.is('history')} onClose={dlg.close} node={dlg.node} resources={resources} />
        </Stack>
    );
}
