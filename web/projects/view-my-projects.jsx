import { useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Alert, Button, Divider, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { Loading, LoadError } from '/helper/query-state.jsx';
import { useAuth } from '/providers/auth.jsx';
import { useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { ProjectCard } from './card-project.jsx';
import { BudgetOffers } from './component-budget-offers.jsx';
import { BudgetFormModal } from './modal-budget-form.jsx';
import { ProjectFormModal } from './modal-project-form.jsx';
import { NodeInspectModal } from './modal-inspect.jsx';
import { AllocationModal } from './modal-allocation.jsx';
import { RetireModal } from './modal-retire.jsx';
import { useNodeDialog } from './use-node-dialog.jsx';
import { useProjectConfig } from './projects.jsx';
import { useCloudStatus } from './cloud-status.jsx';
import { useTranslation } from 'react-i18next';
import { COLOR, getAuthUserEmail, ownerEmail } from './util-project.jsx';

// MyProjectsView lists the projects the signed-in user owns and lets them
// request new ones, propose changes and release finished projects. Above them
// sit the budgets the user may draw from — for somebody without budgets of
// their own this is the whole cloud section (see nav.jsx).
export function MyProjectsView() {
    const { t } = useTranslation();
    const api = useNodesApi();
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

    const handleAction = (action, node) => dlg.open(action, node);

    if (!api || !config || projectsQuery.isPending) return <Loading />;
    if (projectsQuery.isError) return <LoadError query={projectsQuery} title={t('projects.myProjects.loadError')} />;

    const resources = config.resources || [];
    const projects = projectsQuery.data ?? { items: [], total: 0 };
    const myBudgets = myBudgetsQuery.data?.items ?? [];
    const eligibleBudgets = eligibleQuery.data?.items ?? [];
    // The list also holds projects the viewer only administers. What counts
    // against a per-person share is what they OWN — the server sums by owner —
    // so only those go into the arithmetic below.
    const me = getAuthUserEmail(user).toLowerCase();
    const ownProjects = projects.items.filter(n => ownerEmail(n).toLowerCase() === me);
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
                    {t('projects.myProjects.intro')}
                </Text>
                <Button size="xs" leftSection={<Plus size="16" />} onClick={() => setNewProjectBudget('')}>
                    {t('projects.actions.newProject')}
                </Button>
            </Group>

            {/* Two sections, the projects first: they are what this page is
                about, and the budgets below are where more of them come from.
                Before, the budget cards came first under a small caption and the
                project cards followed without one, so the two read as one list. */}
            <Stack gap="xs">
                <Title order={4}>{t('projects.myProjects.heading', { count: projects.total })}</Title>

            {/* One person's own projects fit in one request. If that ever stops
                being true, say it — a missing project is worse than a long list. */}
            {projects.items.length < projects.total && (
                <Alert color={COLOR.attention} variant="light">
                    {t('projects.myProjects.shown', { shown: projects.items.length, total: projects.total })}
                </Alert>
            )}

            {projects.items.length === 0 && (
                canRequest ? (
                    <Alert color={COLOR.info} variant="light">
                        {t('projects.myProjects.noneCanRequest')}
                    </Alert>
                ) : (
                    <Alert color={COLOR.attention} variant="light">
                        {t('projects.myProjects.none')}
                    </Alert>
                )
            )}

            <SimpleGrid cols={{ base: 1, sm: 2 }}>
                {/* Own projects first, the shared ones after them. */}
                {[...ownProjects, ...projects.items.filter(n => !ownProjects.includes(n))].map(node => (
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
            </Stack>

            {offers.length > 0 && <Divider my="sm" />}

            <BudgetOffers
                budgets={offers}
                resources={resources}
                myProjects={ownProjects}
                onNewProject={(b) => setNewProjectBudget(b.id)}
                onRequestBudget={(b) => setBudgetRequestFrom(b)}
            />

            {/* ── Dialogs (one instance per view) ────────────────────────── */}
            <ProjectFormModal
                key={newProjectBudget === null ? 'new-closed' : `new:${newProjectBudget}`}
                opened={newProjectBudget !== null}
                onClose={() => setNewProjectBudget(null)}
                resources={resources}
                openstackRoles={config.openstackRoles}
                myBudgets={myBudgets}
                eligibleBudgets={eligibleBudgets}
                myProjects={ownProjects}
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
                myProjects={ownProjects}
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
            {/* Here only to give an allocation back. */}
            <AllocationModal key={`allocate:${dlg.key}`} opened={dlg.is('allocate')}
                onClose={dlg.close} node={dlg.node} resources={resources} />
            <RetireModal key={`retire:${dlg.key}`} opened={dlg.is('release') || dlg.is('delete-for-good')}
                mode={dlg.is('delete-for-good') ? 'delete' : 'release'} onClose={dlg.close} node={dlg.node} />
        </Stack>
    );
}
