import { useEffect, useState } from 'react';
import { Link, useSearch } from 'wouter';
import { useQueries, useQuery } from '@tanstack/react-query';
import { ArrowUpDown } from 'lucide-react';
import { useLocalStorage } from '@mantine/hooks';
import { Alert, Anchor, Box, Divider, Group, SegmentedControl, Select, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { Loading, LoadError } from '/helper/query-state.jsx';
import { useAuth } from '/providers/auth.jsx';
import { useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { ProjectCard } from './card-project.jsx';
import { ProjectPanel, ProjectsBoard } from './project-tile.jsx';
import { OFFERS_PATH } from '/nav-v2.js';
import { BudgetOffers } from './component-budget-offers.jsx';
import { NewProjectButton } from './component-new-project-button.jsx';
import { BudgetFormModal } from './modal-budget-form.jsx';
import { ProjectFormModal } from './modal-project-form.jsx';
import { NodeInspectModal } from './modal-inspect.jsx';
import { RetireModal } from './modal-retire.jsx';
import { DecisionModal } from './modal-decide.jsx';
import { AllocationModal } from './modal-allocation.jsx';
import { useEndAllocation } from './component-allocations.jsx';
import { useNodeDialog } from './use-node-dialog.jsx';
import { useProjectConfig } from './projects.jsx';
import { useCloudStatus } from './cloud-status.jsx';
import { useTranslation } from 'react-i18next';
import { llmEnabled } from '/features.js';
import { useGpuApi } from '/gpu/api-gpu.jsx';
import { gpuKeys } from '/gpu/query-keys.js';
import { jobMaxHours, projectHasJobs } from '/gpu/jobs.js';
import { GroupChoices } from '/gpu/group-choice.jsx';
import { COLOR, PROJECT_SORTS, budgetKinds, catalogKinds, deletionRequested, getAuthUserEmail, holdsProject, isRetired, mostSpecificFirst, ownerEmail, projectKinds, resourcesOfKinds, sortProjects, pollWhileDeleting } from './util-project.jsx';

// MyProjectsView lists the projects of one area (cloud, workspaces, llm) the
// signed-in user owns or shares, and lets them request new ones, propose changes
// and release finished projects; below them the budgets offering that area.
// Each section of the menu shows its own (see nav.jsx). A project of several
// areas appears in each, its card showing only that area's resources; the
// dialogs keep the whole project.
export function MyProjectsView({ area = 'cloud', v2 = false }) {
    const { t } = useTranslation();
    // The order the viewer picked last; anything the browser kept that is no
    // longer an option falls back to the name.
    const [storedSort, setSort] = useLocalStorage({
        key: 'self-service.my-projects.sort',
        defaultValue: PROJECT_SORTS[0],
        getInitialValueInEffect: false,
    });
    const sort = PROJECT_SORTS.includes(storedSort) ? storedSort : PROJECT_SORTS[0];
    const api = useNodesApi();
    const config = useProjectConfig();
    const { user } = useAuth();
    const cloudStatus = useCloudStatus();
    // The new-project dialog: null = closed, otherwise its kind and the budget
    // to preselect ('' = none, when opened from the page header).
    const [newProject, setNewProject] = useState(null);
    // The budget a sub-budget is being requested from, or null.
    const [budgetRequestFrom, setBudgetRequestFrom] = useState(null);
    const dlg = useNodeDialog();
    // The project a link names (?project=…, from a notification mail via /projects?project=…): its card is marked and scrolled to.
    const linkedProject = new URLSearchParams(useSearch()).get('project');
    // The new layout (v2): cards or list, the viewer's choice kept per browser; the side panel of one project ({ id, tab }), opened on the linked project.
    const [view, setView] = useLocalStorage({ key: 'self-service.projects.view', defaultValue: 'cards', getInitialValueInEffect: false });
    const [panel, setPanel] = useState(v2 && linkedProject ? { id: linkedProject, tab: 'overview' } : null);

    // Three lists, one screen. useQueries keeps them independent (a failing
    // eligible-budget lookup does not blank out the projects) while still
    // giving one place to ask "are we still loading".
    // Workspaces: how the build of each project's environment from Git stands (llm-management-api), shown on its card; followed while one builds.
    const gpuApi = useGpuApi();
    const workspaceProjects = useQuery({
        queryKey: gpuKeys.projects(false),
        queryFn: () => gpuApi.listProjects(false),
        enabled: llmEnabled && (area === 'workspaces' || area === 'all'),
        refetchInterval: (q) => ((q.state.data ?? []).some(p => p.image_build?.status === 'building') ? 10 * 1000 : false),
    });
    const envBuildOf = (node) => {
        const p = (workspaceProjects.data ?? []).find(x => x.tree_node === node.id);
        const status = p?.image_build?.status;
        if (!p?.image_git_url || (status !== 'building' && status !== 'failed')) return null;
        return { status, message: p.image_build?.message || '', hasImage: !!p.project_image };
    };

    // Batch jobs: what a project allows ({perPerson, hours}), on its card; null where it allows none.
    const jobsOf = (node) => {
        const p = (workspaceProjects.data ?? []).find(x => x.tree_node === node.id);
        return projectHasJobs(p) ? { perPerson: p.limits.jobs_per_person, hours: jobMaxHours(p) } : null;
    };

    // Starting a workspace: the start page with the project chosen, for a project the AI service knows with an environment to start; the start page says what is missing beyond that.
    const startOf = (node) => {
        const p = (workspaceProjects.data ?? []).find(x => x.tree_node === node.id);
        if (!p?.slug || !(p.profiles ?? []).length || isRetired(node) || deletionRequested(node)) return null;
        return `/servers/start?project=${encodeURIComponent(p.slug)}`;
    };

    const [projectsQuery, myBudgetsQuery, eligibleQuery] = useQueries({
        queries: [
            { queryKey: projectKeys.mine(), queryFn: () => api.listMine(), enabled: !!api, refetchInterval: pollWhileDeleting },
            { queryKey: projectKeys.myBudgets(), queryFn: () => api.listMyBudgets(), enabled: !!api },
            { queryKey: projectKeys.eligibleForMe(), queryFn: () => api.listEligibleForMe(), enabled: !!api },
        ],
    });

    const endAllocation = useEndAllocation();
    // Scroll the linked card into view once the list is there.
    const listed = !!projectsQuery.data;
    useEffect(() => {
        if (!linkedProject || !listed) return;
        document.getElementById(`project-${linkedProject}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    }, [linkedProject, listed]);
    // Giving back one allocation of a project, or extending it without one, is a confirmation, no dialog; everything else opens one.
    const handleAction = (action, node, tab) => (action === 'allocation-end' || action === 'allocation-end-alone'
        ? endAllocation(node, { holder: holdsProject(node.project, getAuthUserEmail(user)), resources: config?.resources, atEnd: action === 'allocation-end-alone' })
        : dlg.open(action, node, tab));

    if (!api || !config || projectsQuery.isPending) return <Loading />;
    if (projectsQuery.isError) return <LoadError query={projectsQuery} title={t('projects.myProjects.loadError')} />;

    const resources = config.resources || [];
    const projects = projectsQuery.data ?? { items: [], total: 0 };
    // The projects of this area. One that holds nothing yet belongs to every
    // area, so it never goes missing.
    // 'all' (new layout): every project, every kind the catalogue has.
    const kinds = area === 'all' ? catalogKinds(resources) : [area];
    const ofKind = (n) => area === 'all' || projectKinds(n, resources).length === 0 || projectKinds(n, resources).includes(area);
    const shown = projects.items.filter(ofKind);
    const areaResources = resourcesOfKinds(resources, kinds);
    const myBudgets = myBudgetsQuery.data?.items ?? [];
    const eligibleBudgets = eligibleQuery.data?.items ?? [];
    // A project can be started where a budget in reach offers the area: one the
    // viewer manages or may request from.
    const offersArea = (b) => budgetKinds(b, resources).some(k => kinds.includes(k));
    const availableKinds = kinds.filter(k => [...myBudgets, ...eligibleBudgets].some(b => budgetKinds(b, resources).includes(k)));
    // The list also holds projects the viewer only administers. What counts
    // against a per-person share is what they OWN — the server sums by owner —
    // so only those go into the arithmetic below.
    const me = getAuthUserEmail(user).toLowerCase();
    const ownProjects = projects.items.filter(n => ownerEmail(n).toLowerCase() === me);
    // The list also holds projects the viewer only works in, as an authorized user (viewer_relation member): shown after the others, read-only.
    const memberOnly = (n) => n.viewer_relation === 'member';
    const canRequest = myBudgets.length > 0 || eligibleBudgets.length > 0;
    // The offers are what the user may REQUEST from; budgets they manage live
    // in "My Budgets" and would only repeat themselves here.
    const managedIds = new Set(myBudgets.map(b => b.id));
    const offers = mostSpecificFirst(eligibleBudgets).filter(b => !managedIds.has(b.id) && offersArea(b));
    const budgetRequestTargets = offers.filter(b => b.allow_sub_budget_requests !== false);

    // Own projects first, then the ones administered with others, then those the viewer is a member of.
    const ordered = [
        ...sortProjects(ownProjects.filter(ofKind), sort),
        ...sortProjects(shown.filter(n => !ownProjects.includes(n) && !memberOnly(n)), sort),
        ...sortProjects(shown.filter(n => !ownProjects.includes(n) && memberOnly(n)), sort),
    ];
    // What a tile of the new layout needs of a project.
    const slugOf = (node) => (workspaceProjects.data ?? []).find(x => x.tree_node === node.id)?.slug;
    const tileCtx = (node) => ({
        resources: areaResources, filter: area, perspective: memberOnly(node) ? 'member' : 'owner', start: startOf(node), envBuild: envBuildOf(node),
        jobsHref: jobsOf(node) && slugOf(node) ? `/workspaces/jobs?project=${encodeURIComponent(slugOf(node))}` : null,
        managedIds, isRoot: cloudStatus.isRoot,
    });
    const panelNode = panel ? projects.items.find(n => n.id === panel.id) ?? null : null;

    return (
        <Stack>
            {/* Two sections, the projects first: they are what this page is
                about, and the budgets below are where more of them come from.
                Before, the budget cards came first under a small caption and the
                project cards followed without one, so the two read as one list. */}
            <Stack gap="xs">
                {/* One row: the heading, the order, and the way to a new one at its end. */}
                <Group justify="space-between" align="center" gap="sm">
                    <Stack gap={0}>
                        <Title order={v2 ? 3 : 4}>{v2 ? t(`projects.v2.heading_${area}`) : t(`projects.kind.heading_${area}`)}</Title>
                        <Text size="xs" c="dimmed">{v2 ? t('projects.v2.headingHint') : t(`projects.kind.${area}Hint`)}</Text>
                    </Stack>
                    <Group gap="sm" align="center" ml="auto">
                        {v2 && (
                            <SegmentedControl size="xs" value={view} onChange={setView} aria-label={t('projects.v2.viewLabel')}
                                data={[{ value: 'cards', label: t('projects.v2.viewCards') }, { value: 'list', label: t('projects.v2.viewList') }]} />
                        )}
                        {shown.length > 1 && (
                            <Select
                                size="xs"
                                w={190}
                                aria-label={t('projects.myProjects.sortLabel')}
                                leftSection={<ArrowUpDown size={14} />}
                                data={PROJECT_SORTS.map(k => ({ value: k, label: t(`projects.myProjects.sort_${k}`) }))}
                                value={sort}
                                onChange={v => v && setSort(v)}
                                allowDeselect={false}
                            />
                        )}
                        <NewProjectButton kinds={kinds} available={availableKinds} label={area === 'all' ? t('projects.v2.newProject') : t(`projects.kind.${area}Project`)} menu={v2} onPick={(k) => setNewProject({ budget: '', kind: k })} />
                    </Group>
                </Group>

            {/* One person's own projects fit in one request. If that ever stops
                being true, say it — a missing project is worse than a long list. */}
            {projects.items.length < projects.total && (
                <Alert color={COLOR.attention} variant="light">
                    {t('projects.myProjects.shown', { shown: projects.items.length, total: projects.total })}
                </Alert>
            )}

            {shown.length === 0 && (
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

            {/* Workspaces: projects where the person chooses a group themself right now, above the cards, so it is not missed. */}
            {area === 'workspaces' && <GroupChoices projects={workspaceProjects.data} />}

            {v2 ? (
                <ProjectsBoard nodes={ordered} ctxOf={tileCtx} view={view} onAction={handleAction} marked={linkedProject}
                    onOpen={(node, tab) => setPanel({ id: node.id, tab: tab || 'overview' })} />
            ) : (
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
                {/* Own projects first, then the ones administered with others, then those the viewer is a member of. */}
                {ordered.map(node => (
                    <Box key={node.id} id={`project-${node.id}`} style={node.id === linkedProject ? { outline: `2px solid var(--mantine-color-${COLOR.attention}-5)`, borderRadius: 'var(--mantine-radius-sm)' } : undefined}>
                    <ProjectCard
                        node={node}
                        resources={areaResources}
                        perspective={memberOnly(node) ? 'member' : 'owner'}
                        envBuild={envBuildOf(node)}
                        jobs={jobsOf(node)}
                        start={startOf(node)}
                        managedIds={managedIds}
                        isRoot={cloudStatus.isRoot}
                        onAction={handleAction}
                    />
                    </Box>
                ))}
            </SimpleGrid>
            )}
            </Stack>

            {/* The new layout shows what one can get on a page of its own (Projekte › Was ich bekommen kann). */}
            {v2 && offers.length > 0 && (
                <Text size="sm"><Anchor component={Link} href={OFFERS_PATH.replace('/projects', '')}>{t('projects.v2.toOffers')}</Anchor></Text>
            )}
            {!v2 && offers.length > 0 && <Divider my="sm" />}

            {!v2 && <BudgetOffers
                budgets={offers}
                resources={areaResources}
                myProjects={ownProjects}
                kinds={kinds}
                onNewProject={(b, k) => setNewProject({ budget: b.id, kind: k })}
                onRequestBudget={(b) => setBudgetRequestFrom(b)}
            />}

            {v2 && (
                <ProjectPanel node={panelNode} ctx={panelNode ? tileCtx(panelNode) : {}} tab={panel?.tab ?? 'overview'}
                    onTab={(tab) => setPanel(p => (p ? { ...p, tab } : p))} onClose={() => setPanel(null)}
                    onAction={handleAction} onOpen={(node, tab) => setPanel({ id: node.id, tab: tab || 'overview' })} />
            )}

            {/* ── Dialogs (one instance per view) ────────────────────────── */}
            <ProjectFormModal
                key={newProject === null ? 'new-closed' : `new:${newProject.kind}:${newProject.budget}`}
                opened={newProject !== null}
                onClose={() => setNewProject(null)}
                resources={resources}
                roles={config.roles}
                myBudgets={myBudgets}
                eligibleBudgets={eligibleBudgets}
                myProjects={ownProjects}
                isRoot={cloudStatus.isRoot}
                // A budget raised from the dialog: the lists follow by themselves (tree()), the header badge by hand.
                onBudgetChanged={cloudStatus.refresh}
                initialBudgetId={newProject?.budget || null}
                initialKind={newProject?.kind ?? null}
            />
            {/* The budgets go in here too: they are how the dialog knows what
                the project's budget approves on its own. */}
            <ProjectFormModal
                key={`change:${dlg.key}`}
                opened={dlg.is('change')}
                onClose={dlg.close}
                resources={resources}
                roles={config.roles}
                node={dlg.node}
                myBudgets={myBudgets}
                eligibleBudgets={eligibleBudgets}
                myProjects={ownProjects}
                isRoot={cloudStatus.isRoot}
                // A budget raised from the dialog: the lists follow by themselves (tree()), the header badge by hand.
                onBudgetChanged={cloudStatus.refresh}
                initialTab={dlg.tab}
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
                onClose={dlg.close} node={dlg.node} resources={resources} initialTab={dlg.tab} />
            <RetireModal key={`retire:${dlg.key}`} opened={dlg.is('release') || dlg.is('delete-for-good')}
                mode={dlg.is('delete-for-good') ? 'delete' : 'release'} onClose={dlg.close} node={dlg.node} />
            {/* What each budget pays for a project: change it, give it back, or ask another budget for more. */}
            <AllocationModal
                key={`allocations:${dlg.key}:${dlg.tab ?? ''}`}
                opened={dlg.is('allocations')}
                onClose={dlg.close}
                onDone={cloudStatus.refresh}
                project={dlg.is('allocations') ? dlg.node : null}
                initial={dlg.tab}
                resources={resources}
                myBudgets={myBudgets}
                eligibleBudgets={eligibleBudgets}
                myProjects={ownProjects}
                isRoot={cloudStatus.isRoot}
                userEmail={getAuthUserEmail(user)}
            />
            {/* A holder who also manages one of the paying budgets decides on its allocation here too. */}
            <DecisionModal key={`decide:${dlg.key}`} opened={dlg.is('decide')} onClose={dlg.close} onDone={cloudStatus.refresh}
                resources={resources} node={dlg.node} />
        </Stack>
    );
}
