import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, CloudDownload, FileText, Folder, Zap } from 'lucide-react';
import { Box, Group, Loader, Text, Tooltip, Tree, UnstyledButton } from '@mantine/core';
import { COLOR, isBudget, isImported, nodeTitle, statusLabel, statusStyle } from './util-project.jsx';

// BudgetTree is the navigation side of the "My Budgets" master-detail view: a
// lazily loaded tree of budgets (inner nodes) and projects (leaves).
//
// Built on Mantine's Tree, which brings what this used to hand-roll: expansion
// state, the guide lines, keyboard navigation and ARIA roles, and — the reason
// for the rewrite — first-class lazy loading via useTree({ onLoadChildren }),
// including the per-node loading and error state surfaced below.
//
// Children arrive one page at a time. A budget with more children than fit in a
// page ends in a "show more" row instead of silently stopping: a course budget
// with 600 student projects must not look like it has 50.
//
// The owning view keeps the data (roots + loaded pages) and the selection, so a
// refresh after any action can simply reload them; expansion lives in the Tree
// controller passed in as `tree`.

// The value of the synthetic row that loads the next page. Suffixed onto the
// parent's ID so it is unique, and recognisable when the tree hands it back.
const MORE_SUFFIX = '::more';

// budgetsToTreeData converts the loaded pages into Mantine's node shape.
//
// hasChildren comes from the server's child_count, NOT from the children loaded
// so far: children arrive on demand, so without it every budget would offer an
// expand control and half of them would turn out empty.
export function budgetsToTreeData(roots, childrenMap) {
    const toData = (node) => {
        const page = childrenMap.get(node.id);
        const loaded = page?.items || [];
        const rows = loaded.map(toData);
        // One more page to go: the row that fetches it is part of the tree, so
        // it sits with its siblings and scrolls with them.
        if (page && loaded.length < page.total) {
            rows.push({
                value: node.id + MORE_SUFFIX,
                label: 'Show more',
                nodeProps: { more: { parentId: node.id, loaded: loaded.length, total: page.total } },
            });
        }
        return {
            value: node.id,
            label: nodeTitle(node),
            hasChildren: isBudget(node) && node.child_count > 0,
            // An EMPTY loaded list must stay undefined: Mantine derives
            // "has children" from `Array.isArray(node.children)`, so handing it
            // `[]` produces an expand control that opens nothing.
            children: rows.length ? rows : undefined,
            nodeProps: { node },
        };
    };
    return (roots || []).map(toData);
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

// The markers to the right of a row's title, shared by the tree and the flat
// result lists: what auto-approves, and what is not plainly active.
function NodeMarkers({ node }) {
    return (
        <>
            {node.auto_approve?.per_requester_limit && (
                <Tooltip label="Auto-approve: small requests are approved automatically.">
                    <Zap size="12" color="var(--mantine-color-green-6)" style={{ flexShrink: 0 }} />
                </Tooltip>
            )}
            <StatusDot status={node.status} />
        </>
    );
}

function NodeIcon({ node, size = '15' }) {
    const Icon = isImported(node) ? CloudDownload : isBudget(node) ? Folder : FileText;
    // The icon says WHAT a row is, and the shape already says it — so only the
    // one row that is not part of the managed world gets a colour.
    const color = isImported(node)
        ? `var(--mantine-color-${COLOR.outside}-6)`
        : 'var(--mantine-color-gray-6)';
    return <Icon size={size} color={color} style={{ flexShrink: 0 }} />;
}

// Row styling shared by the tree and the flat lists, so a selected search hit
// looks exactly like a selected tree row.
function rowStyle(selected) {
    return {
        borderRadius: 'var(--mantine-radius-sm)',
        backgroundColor: selected ? 'var(--mantine-color-blue-light)' : undefined,
        cursor: 'pointer',
    };
}

// The last row under a partly loaded budget. It reports how much is still
// hidden — a page boundary that says nothing is indistinguishable from the end
// of the list.
function MoreRow({ more, elementProps, onLoadMore }) {
    const [loading, setLoading] = useState(false);

    const load = async (event) => {
        // Neither select nor collapse the parent: this row only fetches.
        event.stopPropagation();
        if (loading) return;
        setLoading(true);
        try {
            await onLoadMore(more.parentId);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Group {...elementProps} gap="4" wrap="nowrap" pr="6" py="4"
            style={{ ...elementProps.style, cursor: 'default' }}
            onClick={(event) => event.stopPropagation()}>
            <Box w={14} style={{ flexShrink: 0 }} />
            {loading ? <Loader size="12" /> : <ChevronDown size="14" color="var(--mantine-color-gray-6)" style={{ flexShrink: 0 }} />}
            <UnstyledButton onClick={load} disabled={loading}>
                <Text size="xs" c={COLOR.info} fw={500}>
                    {loading ? 'Loading…' : 'Show more'}
                    <Text span size="xs" c="dimmed" fw={400}> — {more.loaded} of {more.total} loaded</Text>
                </Text>
            </UnstyledButton>
        </Group>
    );
}

// One row: chevron (only where there is something to expand), type icon, title,
// auto-approve marker and status dot.
function TreeRow({ payload, selectedId, onSelect, onLoadMore }) {
    const { node: treeNode, expanded, hasChildren, isLoading, loadError, elementProps } = payload;

    if (treeNode.nodeProps?.more) {
        return <MoreRow more={treeNode.nodeProps.more} elementProps={elementProps} onLoadMore={onLoadMore} />;
    }

    const node = treeNode.nodeProps.node;
    const isSelected = node.id === selectedId;

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
            style={{ ...elementProps.style, ...rowStyle(isSelected) }}
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

            <NodeIcon node={node} />
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
            <NodeMarkers node={node} />
        </Group>
    );
}

export function BudgetTree({ data, tree, selectedId, onSelect, onLoadMore }) {
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
                <TreeRow payload={payload} selectedId={selectedId}
                    onSelect={onSelect} onLoadMore={onLoadMore} />
            )}
        />
    );
}

// NodeResultList shows nodes outside their place in the tree: search hits and
// the requests waiting for a decision. Both answer "which ones", not "where" —
// and unfolding a paginated tree down to a handful of matches would be both
// slow and harder to read. The funding budget is named on each row instead.
export function NodeResultList({ nodes, selectedId, onSelect, total, onMore, emptyText }) {
    const [loading, setLoading] = useState(false);

    if (!nodes || nodes.length === 0) {
        return <Text size="sm" c="dimmed" ta="center" py="md">{emptyText}</Text>;
    }

    const loadMore = async () => {
        setLoading(true);
        try {
            await onMore();
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box>
            {nodes.map(node => {
                const isSelected = node.id === selectedId;
                return (
                    <Group key={node.id} gap="6" wrap="nowrap" px="6" py="4"
                        onClick={() => onSelect(node)}
                        style={rowStyle(isSelected)}>
                        <NodeIcon node={node} />
                        <Box style={{ flex: 1, minWidth: 0 }}>
                            <Text size="sm" truncate fw={isSelected ? 600 : 400}>{nodeTitle(node)}</Text>
                            {node.parent_name && (
                                <Text size="xs" c="dimmed" truncate>in {node.parent_name}</Text>
                            )}
                        </Box>
                        <NodeMarkers node={node} />
                    </Group>
                );
            })}
            {typeof total === 'number' && nodes.length < total && (
                <Group justify="center" py="xs">
                    {onMore ? (
                        <UnstyledButton onClick={loadMore} disabled={loading}>
                            <Text size="xs" c={COLOR.info} fw={500}>
                                {loading ? 'Loading…' : `Show more`}
                                <Text span size="xs" c="dimmed" fw={400}> — {nodes.length} of {total}</Text>
                            </Text>
                        </UnstyledButton>
                    ) : (
                        <Text size="xs" c="dimmed">Showing {nodes.length} of {total}</Text>
                    )}
                </Group>
            )}
        </Box>
    );
}
