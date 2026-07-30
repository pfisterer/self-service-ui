import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Alert, Button, Group, Loader, SimpleGrid, Stack, Text } from '@mantine/core';
import { Delayed } from '/helper/delayed.jsx';
import { useAuth } from '/providers/auth.jsx';
import { useConfirm } from '/providers/confirm.jsx';
import { useErrorModal } from '/providers/error-modal.jsx';
import { fetchParentNames, useNodesApi } from './api-nodes.jsx';
import { ProjectCard } from './card-project.jsx';
import { ProjectFormModal } from './modal-project-form.jsx';
import { NodeDetailsModal } from './modal-details.jsx';
import { NodeHistoryModal } from './modal-history.jsx';
import { useNodeDialog } from './use-node-dialog.jsx';
import { useProjectConfig } from './projects.jsx';
import { formatError, getAuthUserEmail, useAsyncRefresh } from './util-project.jsx';

// MyProjectsView lists the projects the signed-in user owns and lets them
// request new ones, propose changes and release finished projects.
export function MyProjectsView() {
    const api = useNodesApi();
    const { user } = useAuth();
    const { showError } = useErrorModal();
    const confirm = useConfirm();
    const config = useProjectConfig();
    const userEmail = getAuthUserEmail(user);

    const [projects, setProjects] = useState([]);
    const [myBudgets, setMyBudgets] = useState([]);
    const [eligibleBudgets, setEligibleBudgets] = useState([]);
    const [parentNames, setParentNames] = useState(new Map());
    const [showNewModal, setShowNewModal] = useState(false);
    const dlg = useNodeDialog();

    const { loaded, refresh } = useAsyncRefresh(async () => {
        const [mine, budgets, eligible] = await Promise.all([
            api.listMine(),
            api.listMyBudgets(),
            api.listEligibleForMe(),
        ]);
        setProjects(mine);
        setMyBudgets(budgets);
        setEligibleBudgets(eligible);
        setParentNames(await fetchParentNames(api, mine));
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
                <Button size="xs" leftSection={<Plus size="16" />} onClick={() => setShowNewModal(true)}>
                    Request project
                </Button>
            </Group>

            {projects.length === 0 && (
                canRequest ? (
                    <Alert color="blue" variant="light">
                        You don't have any projects yet. Click “Request project” to get started —
                        small requests are often approved instantly.
                    </Alert>
                ) : (
                    <Alert color="yellow" variant="light">
                        You don't have any projects yet, and no budget currently accepts requests
                        from you. Ask your lecturer or administrator to add you to a budget.
                    </Alert>
                )
            )}

            <SimpleGrid cols={{ base: 1, sm: 2 }}>
                {projects.map(node => (
                    <ProjectCard
                        key={node.id}
                        node={node}
                        resources={resources}
                        parentName={parentNames.get(node.parent_id)}
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
            />
            <ProjectFormModal
                opened={dlg.is('change')}
                onClose={dlg.close}
                onDone={refresh}
                resources={resources}
                openstackRoles={config.openstackRoles}
                node={dlg.node}
            />
            <NodeDetailsModal opened={dlg.is('details')} onClose={dlg.close} node={dlg.node} resources={resources} />
            <NodeHistoryModal opened={dlg.is('history')} onClose={dlg.close} node={dlg.node} resources={resources} />
        </Stack>
    );
}
