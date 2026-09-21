import { useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Alert, Button, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { Loading, LoadError, useApiMutation } from '/helper/query-state.jsx';
import { useAuth } from '/providers/auth.jsx';
import { useConfirm } from '/providers/confirm.jsx';
import { useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { ProjectCard } from './card-project.jsx';
import { BudgetOffers } from './component-budget-offers.jsx';
import { BudgetFormModal } from './modal-budget-form.jsx';
import { ProjectFormModal } from './modal-project-form.jsx';
import { NodeInspectModal } from './modal-inspect.jsx';
import { useNodeDialog } from './use-node-dialog.jsx';
import { useProjectConfig } from './projects.jsx';
import { useCloudStatus } from './cloud-status.jsx';
import { COLOR, getAuthUserEmail } from './util-project.jsx';

// MyProjectsView lists the projects the signed-in user owns and lets them
// request new ones, propose changes and release finished projects. Above them
// sit the budgets the user may draw from — for somebody without budgets of
// their own this is the whole cloud section (see nav.jsx).
export function MyProjectsView() {
    const api = useNodesApi();
    const confirm = useConfirm();
    const config = useProjectConfig();
    const { user } = useAuth();
    const cloudStatus = useCloudStatus();
    // The new-project dialog: null = closed, otherwise the budget to preselect
    // ('' = none, when opened from the page header).
    const [newProjectBudget, setNewProjectBudget] = useState(null);
    // The budget a sub-budget is being requested from, or null.
    const [budgetRequestFrom, setBudgetRequestFrom] = useState(null);
    const dlg = useNodeDialog();

    // Three lists, one screen. useQueries keeps them independent (a failing
    // eligible-budget lookup does not blank out the projects) while still
    // giving one place to ask "are we still loading".
    const [projectsQuery, myBudgetsQuery, eligibleQuery] = useQueries({
        queries: [
            { queryKey: projectKeys.mine(), queryFn: () => api.listMine(), enabled: !!api },
            { queryKey: projectKeys.myBudgets(), queryFn: () => api.listMyBudgets(), enabled: !!api },
            { queryKey: projectKeys.eligibleForMe(), queryFn: () => api.listEligibleForMe(), enabled: !!api },
        ],
    });

    const release = useApiMutation({
        mutationFn: (id) => api.release(id),
        invalidates: [projectKeys.tree()],
    });

    const handleRelease = async (node) => {
        const ok = await confirm({
            title: 'Release project?',
            message: 'Releasing removes the project and its resources from OpenStack. This cannot be undone.',
            confirmLabel: 'Release',
        });
        if (ok) release.mutate(node.id);
    };

    const handleAction = (action, node) => {
        if (action === 'release') return handleRelease(node);
        dlg.open(action, node);
    };

    if (!api || !config || projectsQuery.isPending) return <Loading />;
    if (projectsQuery.isError) return <LoadError query={projectsQuery} title="Could not load your projects" />;

    const resources = config.resources || [];
    const projects = projectsQuery.data ?? { items: [], total: 0 };
    const myBudgets = myBudgetsQuery.data?.items ?? [];
    const eligibleBudgets = eligibleQuery.data?.items ?? [];
    const canRequest = myBudgets.length > 0 || eligibleBudgets.length > 0;
    // The offers are what the user may REQUEST from; budgets they manage live
    // in "My Budgets" and would only repeat themselves here.
    const managedIds = new Set(myBudgets.map(b => b.id));
    const offers = eligibleBudgets.filter(b => !managedIds.has(b.id));
    const budgetRequestTargets = offers.filter(b => b.allow_sub_budget_requests !== false);

    return (
        <Stack>
            <Group justify="space-between" align="center">
                <Text size="sm" c="dimmed">
                    A project is your own space in the DHBW cloud with the resources you request.
                </Text>
                <Button size="xs" leftSection={<Plus size="16" />} onClick={() => setNewProjectBudget('')}>
                    New project
                </Button>
            </Group>

            <BudgetOffers
                budgets={offers}
                resources={resources}
                myProjects={projects.items}
                onNewProject={(b) => setNewProjectBudget(b.id)}
                onRequestBudget={(b) => setBudgetRequestFrom(b)}
            />

            {/* One person's own projects fit in one request. If that ever stops
                being true, say it — a missing project is worse than a long list. */}
            {projects.items.length < projects.total && (
                <Alert color={COLOR.attention} variant="light">
                    Showing {projects.items.length} of your {projects.total} projects.
                </Alert>
            )}

            {projects.items.length === 0 && (
                canRequest ? (
                    <Alert color={COLOR.info} variant="light">
                        You don't have any projects yet. Click “New project” to get started — budgets
                        marked “Instant” create it right away.
                    </Alert>
                ) : (
                    <Alert color={COLOR.attention} variant="light">
                        You don't have any projects yet, and no budget currently accepts requests
                        from you. Ask your lecturer or administrator to add you to a budget.
                    </Alert>
                )
            )}

            <SimpleGrid cols={{ base: 1, sm: 2 }}>
                {projects.items.map(node => (
                    <ProjectCard
                        key={node.id}
                        node={node}
                        resources={resources}
                        parentName={node.parent_name}
                        perspective="owner"
                        onAction={handleAction}
                    />
                ))}
            </SimpleGrid>

            {/* ── Dialogs (one instance per view) ────────────────────────── */}
            <ProjectFormModal
                key={newProjectBudget === null ? 'new-closed' : `new:${newProjectBudget}`}
                opened={newProjectBudget !== null}
                onClose={() => setNewProjectBudget(null)}
                resources={resources}
                openstackRoles={config.openstackRoles}
                myBudgets={myBudgets}
                eligibleBudgets={eligibleBudgets}
                myProjects={projects.items}
                initialBudgetId={newProjectBudget || null}
            />
            {/* The budgets go in here too: they are how the dialog knows what
                the project's budget approves on its own. */}
            <ProjectFormModal
                key={`change:${dlg.key}`}
                opened={dlg.is('change')}
                onClose={dlg.close}
                resources={resources}
                openstackRoles={config.openstackRoles}
                node={dlg.node}
                myBudgets={myBudgets}
                eligibleBudgets={eligibleBudgets}
                myProjects={projects.items}
            />
            <BudgetFormModal
                key={`budget-request:${budgetRequestFrom?.id ?? 'closed'}`}
                opened={!!budgetRequestFrom}
                onClose={() => setBudgetRequestFrom(null)}
                onDone={cloudStatus.refresh}
                resources={resources}
                mode="request"
                parent={budgetRequestFrom}
                eligibleBudgets={budgetRequestTargets}
                currentUserEmail={getAuthUserEmail(user)}
            />
            {/* History is a tab in here, not a button of its own outside. */}
            <NodeInspectModal key={`inspect:${dlg.key}`} opened={dlg.is('details')}
                onClose={dlg.close} node={dlg.node} resources={resources} />
        </Stack>
    );
}
