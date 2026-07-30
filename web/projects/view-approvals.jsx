import { useEffect, useState } from 'react';
import { Alert, Loader, Stack } from '@mantine/core';
import { Delayed } from '/helper/delayed.jsx';
import { useAuth } from '/providers/auth.jsx';
import { useErrorModal } from '/providers/error-modal.jsx';
import { fetchParentNames, useNodesApi } from './api-nodes.jsx';
import { ApprovalsTable } from './table-approvals.jsx';
import { AdoptModal } from './modal-adopt.jsx';
import { ApproveModal } from './modal-approve.jsx';
import { NodeDetailsModal } from './modal-details.jsx';
import { NodeHistoryModal } from './modal-history.jsx';
import { RejectModal } from './modal-reject.jsx';
import { useNodeDialog } from './use-node-dialog.jsx';
import { useProjectConfig } from './projects.jsx';
import { getAuthUserEmail, useAsyncRefresh } from './util-project.jsx';

// ApprovalsView is the manager's inbox: everything in their budgets that waits
// for a decision — new project and budget requests, proposed changes, and
// OpenStack projects imported by the synchronization that should be adopted.
export function ApprovalsView() {
    const api = useNodesApi();
    const { user } = useAuth();
    const { showError } = useErrorModal();
    const config = useProjectConfig();
    const userEmail = getAuthUserEmail(user);

    const [items, setItems] = useState([]);
    const [myBudgets, setMyBudgets] = useState([]);
    const [parentNames, setParentNames] = useState(new Map());
    const dlg = useNodeDialog();

    const { loaded, refresh } = useAsyncRefresh(async () => {
        const [toManage, budgets] = await Promise.all([
            api.listToManage(),
            api.listMyBudgets(),
        ]);
        // Newest first — managers usually care about the most recent request.
        const sorted = [...toManage].sort((a, b) =>
            new Date(b.created_at || 0) - new Date(a.created_at || 0));
        setItems(sorted);
        setMyBudgets(budgets);
        setParentNames(await fetchParentNames(api, sorted));
    }, showError);

    useEffect(() => { if (api) refresh(); }, [api, userEmail]);

    if (!config || !loaded) return (<Delayed><Loader /></Delayed>);

    const resources = config.resources || [];

    return (
        <Stack>
            {items.length === 0 && (
                <Alert color="green" variant="light">
                    Nothing to decide right now — all requests in your budgets are handled.
                </Alert>
            )}

            {/* One flat, filterable and sortable table, one row per request; a
                type icon marks what kind of request each row is. Everything
                beyond the key facts (members, end date, policies, the full
                change diff) is behind Details/History. */}
            {items.length > 0 && (
                <ApprovalsTable
                    items={items}
                    resources={resources}
                    parentNames={parentNames}
                    onAction={dlg.open}
                />
            )}

            {/* ── Dialogs (one instance per view) ────────────────────────── */}
            <ApproveModal opened={dlg.is('approve')} onClose={dlg.close} onDone={refresh}
                resources={resources} node={dlg.node} />
            <RejectModal opened={dlg.is('reject')} onClose={dlg.close} onDone={refresh} node={dlg.node} />
            <AdoptModal opened={dlg.is('adopt')} onClose={dlg.close} onDone={refresh}
                resources={resources} node={dlg.node} myBudgets={myBudgets} />
            <NodeDetailsModal opened={dlg.is('details')} onClose={dlg.close} node={dlg.node} resources={resources} />
            <NodeHistoryModal opened={dlg.is('history')} onClose={dlg.close} node={dlg.node} resources={resources} />
        </Stack>
    );
}
