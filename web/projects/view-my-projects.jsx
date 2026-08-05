import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Alert, Button, Group, Loader, SimpleGrid, Stack, Text } from '@mantine/core';
import { Delayed } from '/helper/delayed.jsx';
import { useAuth } from '/providers/auth.jsx';
import { useConfirm } from '/providers/confirm.jsx';
import { useErrorModal } from '/providers/error-modal.jsx';
import { useNodesApi } from './api-nodes.jsx';
import { ProjectCard } from './card-project.jsx';
import { ProjectFormModal } from './modal-project-form.jsx';
import { RoleSwitchButton } from './component-group-role-switcher.jsx';
import { NodeInspectModal, TAB_DETAILS, TAB_HISTORY } from './modal-inspect.jsx';
import { useNodeDialog } from './use-node-dialog.jsx';
import { useProjectConfig } from './projects.jsx';
import { COLOR, formatError, getAuthUserEmail, useAsyncRefresh } from './util-project.jsx';

// MyProjectsView lists the projects the signed-in user owns and lets them
// request new ones, propose changes and release finished projects.
export function MyProjectsView() {
    const api = useNodesApi();
    const { user } = useAuth();
    const { showError } = useErrorModal();
    const confirm = useConfirm();
    const config = useProjectConfig();
    const userEmail = getAuthUserEmail(user);

    const [projects, setProjects] = useState({ items: [], total: 0 });
    const [myBudgets, setMyBudgets] = useState([]);
    const [eligibleBudgets, setEligibleBudgets] = useState([]);
    const [showNewModal, setShowNewModal] = useState(false);
    const dlg = useNodeDialog();

    const { loaded, refresh } = useAsyncRefresh(async () => {
        const [mine, budgets, eligible] = await Promise.all([
            api.listMine(),
            api.listMyBudgets(),
            api.listEligibleForMe(),
        ]);
        setProjects(mine);
        setMyBudgets(budgets.items);
        setEligibleBudgets(eligible.items);
    }, showError);

    useEffect(() => { if (api) refresh(); }, [api, userEmail]);

    const handleRelease = async (node) => {
        const ok = await confirm({
            title: 'Release project?',
            message: 'Releasing removes the project and its resources from OpenStack. This cannot be undone.',
            confirmLabel: 'Release',
        });
        if (!ok) return;
        try {
            await api.release(node.id);
            refresh();
        } catch (e) {
            showError(formatError(e));
        }
    };

    const handleAction = (action, node) => {
        if (action === 'release') return handleRelease(node);
        dlg.open(action, node);
    };

    if (!config || !loaded) return (<Delayed><Loader /></Delayed>);

    const resources = config.resources || [];
    const canRequest = myBudgets.length > 0 || eligibleBudgets.length > 0;

    return (
        <Stack>
            <Group justify="space-between" align="center">
                <Text size="sm" c="dimmed">
                    A project is your own space in the DHBW cloud with the resources you request.
                </Text>
                <Group gap="xs" wrap="nowrap">
                    <Button size="xs" leftSection={<Plus size="16" />} onClick={() => setShowNewModal(true)}>
                        Request project
                    </Button>
                    <RoleSwitchButton />
                </Group>
            </Group>

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
                        You don't have any projects yet. Click “Request project” to get started —
                        small requests are often approved instantly.
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
                opened={showNewModal}
                onClose={() => setShowNewModal(false)}
                onDone={refresh}
                resources={resources}
                openstackRoles={config.openstackRoles}
                myBudgets={myBudgets}
                eligibleBudgets={eligibleBudgets}
                myProjects={projects.items}
            />
            <ProjectFormModal
                opened={dlg.is('change')}
                onClose={dlg.close}
                onDone={refresh}
                resources={resources}
                openstackRoles={config.openstackRoles}
                node={dlg.node}
            />
            {/* One modal for both triggers: the History button opens it on that tab. */}
            <NodeInspectModal opened={dlg.is('details') || dlg.is('history')}
                initialTab={dlg.is('history') ? TAB_HISTORY : TAB_DETAILS}
                onClose={dlg.close} node={dlg.node} resources={resources} />
        </Stack>
    );
}
