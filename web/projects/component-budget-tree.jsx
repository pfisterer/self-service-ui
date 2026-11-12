import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CloudDownload, CornerLeftUp, Eye, FileText, Folder, Zap } from 'lucide-react';
import { Box, Group, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { NavTree } from '/helper/tree.jsx';
import { COLOR, isBudget, isImported, nodeTitle, statusDescription, statusLabel, statusStyle } from './util-project.jsx';
import { budgetPathText } from './component-budget-path.jsx';

// BudgetTree is the navigation side of the "My Budgets" master-detail view: a lazily loaded tree of budgets, the one tree of the master-detail pages (helper/tree.jsx's NavTree, on Mantine's Tree): its expansion, guide lines, keyboard and ARIA, and the loading of a branch as it opens (onLoadChildren) with its spinner and its failure on the row.
//
// Children arrive one page at a time. A budget with more children than fit in a page ends in a "show more" row instead of silently stopping: a course budget with 600 student projects must not look like it has 50.
//
// The owning view keeps the data (roots + loaded pages), the selection and the expansion (useTreeExpansion), so a refresh after any action can simply reload them.

// The id of the synthetic row that loads the next page, suffixed onto the parent's id so it is unique.
const MORE_SUFFIX = '::more';

// budgetChildCount is how many budgets sit under this one — what the tree can
// expand into, now that projects are listed in a table instead. child_count
// stands in while the API does not split the count yet.
export function budgetChildCount(node) {
    return node?.child_budget_count ?? node?.child_count ?? 0;
}

// budgetsToTreeData converts the loaded pages into the tree's nodes (helper/tree.jsx).
//
// hasChildren comes from the server's child_count, NOT from the children loaded so far: children arrive on demand, so without it every budget would offer an expand control and half of them would turn out empty.
//
// `childrenById` is a plain object keyed by node id, and that is load-bearing rather than a matter of taste — see childrenById() in the owning view. `onLoadMore(parentId)` fetches a branch's next page.
export function budgetsToTreeData(t, roots, childrenById, onLoadMore) {
    const toData = (node) => {
        const page = childrenById[node.id];
        const loaded = page?.items || [];
        const rows = loaded.map(toData);
        // One more page to go: the row that fetches it is part of the tree, so it sits with its siblings and scrolls with them.
        if (page && loaded.length < page.total) {
            rows.push({ id: node.id + MORE_SUFFIX, label: t('projects.actions.showMore'), more: { loaded: loaded.length, total: page.total, onLoad: () => onLoadMore(node.id) } });
        }
        return {
            id: node.id,
            label: nodeTitle(node),
            node,
            icon: <NodeIcon node={node} />,
            badge: (
                <>
                    {/* How many projects the budget pays for — listed in the table beside the tree, so the row only counts them. */}
                    {isBudget(node) && node.child_project_count > 0 && (
                        <Tooltip label={t('projects.tree.projectCount', { count: node.child_project_count })}>
                            <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>{node.child_project_count}</Text>
                        </Tooltip>
                    )}
                    <NodeMarkers node={node} />
                </>
            ),
            hasChildren: isBudget(node) && budgetChildCount(node) > 0,
            children: rows.length ? rows : undefined,
        };
    };
    return (roots || []).map(toData);
}

// Small colored dot for any status that deviates from plain "approved".
// A dot carries no words at all, so the tooltip does double duty here: it names
// the status and explains it, in that order.
function StatusDot({ status }) {
    const { t } = useTranslation();
    if (status === 'approved') return null;
    const description = statusDescription(t, status);
    return (
        <Tooltip
            label={description
                ? t('projects.tree.statusTooltip', { status: statusLabel(t, status), description })
                : statusLabel(t, status)}
            multiline={Boolean(description)}
            w={description ? 300 : undefined}
        >
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
    const { t } = useTranslation();
    return (
        <>
            {/* Set by the owning view on budgets the user may request from but
                does not manage — the row is a window, not a workplace. */}
            {node.request_only && (
                <Tooltip label={t('projects.tree.requestOnly')}>
                    <Eye size="12" color="var(--mantine-color-gray-6)" style={{ flexShrink: 0 }} />
                </Tooltip>
            )}
            {node.inherits_limit && (
                <Tooltip label={t('projects.tree.inheritsLimit')}>
                    <CornerLeftUp size="12" color="var(--mantine-color-gray-6)" style={{ flexShrink: 0 }} />
                </Tooltip>
            )}
            {node.auto_approve && (
                <Tooltip label={t('projects.tree.autoApprove')}>
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

// BudgetTree: the budgets as NavTree. A click on a row selects it and opens it, but never closes it: looking at a budget's details used to close it, and the tree remembered it closed. Only the arrow closes a branch.
export function BudgetTree({ data, expansion, selectedId, onSelect, onLoadChildren }) {
    const { t } = useTranslation();
    return (
        <NavTree label={t('nav.myBudgets')} nodes={data} expansion={expansion} withLines openOnSelect selectedId={selectedId} onSelect={(n) => onSelect(n.node)} onLoadChildren={onLoadChildren}
            empty={<Text size="sm" c="dimmed" p="xs">{t('projects.budgets.noMatches')}</Text>} />
    );
}

// NodeResultList shows nodes outside their place in the tree: search hits and
// the requests waiting for a decision. Both answer "which ones", not "where" —
// and unfolding a paginated tree down to a handful of matches would be both
// slow and harder to read. The funding budget is named on each row instead.
export function NodeResultList({ nodes, selectedId, onSelect, total, onMore, emptyText }) {
    const { t } = useTranslation();
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
                                <Text size="xs" c="dimmed" truncate>{t('projects.tree.inBudget', { name: budgetPathText(node.parent_path, node.parent_name) })}</Text>
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
                                {loading ? t('projects.actions.loading') : t('projects.actions.showMore')}
                                <Text span size="xs" c="dimmed" fw={400}>{` (${nodes.length}/${total})`}</Text>
                            </Text>
                        </UnstyledButton>
                    ) : (
                        <Text size="xs" c="dimmed">{`${nodes.length}/${total}`}</Text>
                    )}
                </Group>
            )}
        </Box>
    );
}
