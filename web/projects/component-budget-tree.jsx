import { AlertTriangle, ChevronRight, CloudDownload, FileText, Folder, Zap } from 'lucide-react';
import { Box, Group, Loader, Text, Tooltip, Tree } from '@mantine/core';
import { COLOR, isBudget, isImported, nodeTitle, statusLabel, statusStyle } from './util-project.jsx';

// BudgetTree is the navigation side of the "My Budgets" master-detail view: a
// lazily loaded tree of budgets (inner nodes) and projects (leaves).
//
// Built on Mantine's Tree, which brings what this used to hand-roll: expansion
// state, the guide lines, keyboard navigation and ARIA roles, and — the reason
// for the rewrite — first-class lazy loading via useTree({ onLoadChildren }),
// including the per-node loading and error state surfaced below.
//
// The owning view keeps the data (roots + loaded children) and the selection,
// so a refresh after any action can simply reload them; expansion lives in the
// Tree controller passed in as `tree`.

// budgetsToTreeData converts the loaded tree into Mantine's node shape.
//
// hasChildren comes from the server's child_count, NOT from the children loaded
// so far: children arrive on demand, so without it every budget would offer an
// expand control and half of them would turn out empty.
export function budgetsToTreeData(roots, childrenMap) {
    const toData = (node) => {
        const kids = childrenMap.get(node.id);
        return {
            value: node.id,
            label: nodeTitle(node),
            hasChildren: isBudget(node) && node.child_count > 0,
            // An EMPTY loaded list must stay undefined: Mantine derives
            // "has children" from `Array.isArray(node.children)`, so handing it
            // `[]` produces an expand control that opens nothing. Loading all
            // children (search, "expand all") fills the map for every budget,
            // empty ones included — which is exactly where that would bite.
            children: kids?.length ? kids.map(toData) : undefined,
            nodeProps: { node },
        };
    };
    return (roots || []).map(toData);
}

// budgetNodeFilter powers the search box: it matches the underlying node, not
// just the rendered label, so searching for an owner, a group token or an
// OpenStack project name finds the row too.
export function budgetNodeFilter(query, treeNode) {
    const n = treeNode.nodeProps?.node;
    if (!n) return false;
    const q = query.toLowerCase();
    return [
        nodeTitle(n), n.name, n.reason, n.id, n.owner, n.created_by,
        n.os_project_name, n.os_project_id, statusLabel(n.status),
        ...(n.admin_scope || []), ...(n.eligible_requesters || []),
        ...(n.authorized_users || []).map(u => u.token),
    ].filter(Boolean).some(s => String(s).toLowerCase().includes(q));
}

// Small colored dot for any status that deviates from plain "approved".
function StatusDot({ status }) {
    if (status === 'approved') return null;
    return (
        <Tooltip label={statusLabel(status)}>
            <Box w={8} h={8} style={{
                borderRadius: '50%', flexShrink: 0,
                backgroundColor: `var(--mantine-color-${statusStyle(status).color}-6)`,
            }} />
        </Tooltip>
    );
}

// One row: chevron (only where there is something to expand), type icon, title,
// auto-approve marker and status dot.
function TreeRow({ payload, selectedId, onSelect }) {
    const { node: treeNode, expanded, hasChildren, isLoading, loadError, elementProps } = payload;
    const node = treeNode.nodeProps.node;
    const isSelected = node.id === selectedId;

    const Icon = isImported(node) ? CloudDownload : isBudget(node) ? Folder : FileText;
    // The icon says WHAT a row is, and the shape already says it — so only the
    // one row that is not part of the managed world gets a colour.
    const iconColor = isImported(node)
        ? `var(--mantine-color-${COLOR.outside}-6)`
        : 'var(--mantine-color-gray-6)';

    return (
        <Group
            {...elementProps}
            gap="4"
            wrap="nowrap"
            // No horizontal padding prop here: Mantine indents this very element
            // with `padding-inline-start: var(--label-offset)`, and an inline
            // padding-left from `px` would silently flatten the whole tree.
            // Right-side spacing only, which does not collide.
            pr="6"
            py="4"
            onClick={(event) => { elementProps.onClick(event); onSelect(node); }}
            style={{
                ...elementProps.style,
                borderRadius: 'var(--mantine-radius-sm)',
                backgroundColor: isSelected ? 'var(--mantine-color-blue-light)' : undefined,
                cursor: 'pointer',
            }}
        >
            {hasChildren ? (
                isLoading
                    ? <Loader size="12" style={{ flexShrink: 0 }} />
                    : <ChevronRight
                        size="14"
                        style={{
                            flexShrink: 0,
                            transform: expanded ? 'rotate(90deg)' : 'none',
                            transition: 'transform 150ms ease',
                        }} />
            ) : (
                <Box w={14} style={{ flexShrink: 0 }} />
            )}

            <Icon size="15" color={iconColor} style={{ flexShrink: 0 }} />
            <Text size="sm" truncate style={{ flex: 1 }} fw={isSelected ? 600 : 400}>
                {nodeTitle(node)}
            </Text>

            {/* A failed child fetch stays on the row it belongs to instead of
                popping an error modal that loses the context. */}
            {loadError && (
                <Tooltip label={`Could not load contents: ${loadError.message}`}>
                    <AlertTriangle size="12" color="var(--mantine-color-red-6)" style={{ flexShrink: 0 }} />
                </Tooltip>
            )}
            {node.auto_approve?.per_requester_limit && (
                <Tooltip label="Auto-approve: small requests are approved automatically.">
                    <Zap size="12" color="var(--mantine-color-green-6)" style={{ flexShrink: 0 }} />
                </Tooltip>
            )}
            <StatusDot status={node.status} />
        </Group>
    );
}

export function BudgetTree({ data, tree, selectedId, onSelect }) {
    if (!data || data.length === 0) {
        return <Text size="sm" c="dimmed" p="xs">No matches.</Text>;
    }
    return (
        <Tree
            data={data}
            tree={tree}
            withLines
            levelOffset={20}
            renderNode={(payload) => (
                <TreeRow payload={payload} selectedId={selectedId} onSelect={onSelect} />
            )}
        />
    );
}
