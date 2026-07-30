import { ChevronDown, ChevronRight, CloudDownload, FileText, Folder, Zap } from 'lucide-react';
import { ActionIcon, Box, Group, Loader, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { isBudget, isImported, nodeTitle, statusLabel, statusStyle } from './util-project.jsx';

// BudgetTree is the navigation side of the "My Budgets" master-detail view:
// a lazily loaded tree of budgets (inner nodes) and projects (leaves), drawn
// with indent guide lines. It is fully controlled by the owning view —
// expansion state, loaded children and the selection live there, so a refresh
// after any action can simply reload them:
//
//   roots        top-level budgets (what the user manages)
//   childrenMap  Map(parentId → children[]) of everything loaded so far
//   expanded     Set(nodeId) of open budgets
//   loadingIds   Set(nodeId) currently fetching children (shows a spinner)
//   selectedId   the node shown in the detail panel
//   onSelect(node)  row clicked
//   onToggle(node)  chevron clicked (expand/collapse)
//   searchActive when true the tree renders a pre-filtered, fully expanded
//                result set: chevrons and the "empty" hint are hidden

const LINE = 'var(--mantine-color-default-border)';

// filterBudgetTree computes the search result: every node whose text matches
// `query` (case-insensitive substring) plus all its ancestors, as new roots +
// childrenMap. Callers must have loaded the full tree into childrenMap first.
export function filterBudgetTree(roots, childrenMap, query) {
    const q = query.toLowerCase();
    const matches = (n) => [
        nodeTitle(n), n.name, n.reason, n.id, n.owner, n.created_by,
        n.os_project_name, n.os_project_id, statusLabel(n.status),
        ...(n.admin_scope || []), ...(n.eligible_requesters || []),
        ...(n.authorized_users || []).map(u => u.token),
    ].filter(Boolean).some(s => String(s).toLowerCase().includes(q));

    const filtered = new Map();
    const walk = (node) => {
        const kids = (childrenMap.get(node.id) || []).map(walk).filter(Boolean);
        if (!matches(node) && kids.length === 0) return null;
        filtered.set(node.id, kids);
        return node;
    };
    return {
        roots: roots.map(walk).filter(Boolean),
        childrenMap: filtered,
    };
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

function TreeRow({ node, depth, childrenMap, expanded, loadingIds, selectedId, onSelect, onToggle, searchActive }) {
    const budget = isBudget(node);
    const isOpen = searchActive || expanded.has(node.id);
    const isLoading = loadingIds.has(node.id);
    const isSelected = node.id === selectedId;
    const kids = childrenMap.get(node.id);

    const Icon = isImported(node) ? CloudDownload : budget ? Folder : FileText;
    const iconColor = isImported(node)
        ? 'var(--mantine-color-violet-6)'
        : budget ? 'var(--mantine-color-yellow-7)' : 'var(--mantine-color-blue-6)';

    return (
        <>
            <UnstyledButton
                onClick={() => onSelect(node)}
                w="100%"
                px="6"
                py="4"
                style={{
                    borderRadius: 'var(--mantine-radius-sm)',
                    backgroundColor: isSelected ? 'var(--mantine-color-blue-light)' : undefined,
                }}
            >
                <Group gap="4" wrap="nowrap">
                    {/* Horizontal connector to the parent's guide line. */}
                    {depth > 0 && (
                        <Box style={{ width: 12, height: 1, backgroundColor: LINE, marginLeft: -12, flexShrink: 0 }} />
                    )}

                    {/* Chevron: only budgets can have children; hidden while a
                        search shows a pre-expanded result. */}
                    {budget && !searchActive ? (
                        <ActionIcon component="div" variant="subtle" color="gray" size="xs"
                            aria-label={isOpen ? 'Collapse' : 'Expand'}
                            onClick={(e) => { e.stopPropagation(); onToggle(node); }}>
                            {isLoading ? <Loader size="12" />
                                : isOpen ? <ChevronDown size="14" /> : <ChevronRight size="14" />}
                        </ActionIcon>
                    ) : (
                        <Box w={22} style={{ flexShrink: 0 }} />
                    )}

                    <Icon size="15" color={iconColor} style={{ flexShrink: 0 }} />
                    <Text size="sm" truncate style={{ flex: 1 }} fw={isSelected ? 600 : 400}>
                        {nodeTitle(node)}
                    </Text>

                    {node.auto_approve?.per_requester_limit && (
                        <Tooltip label="Self-service: small requests are approved automatically.">
                            <Zap size="12" color="var(--mantine-color-teal-6)" style={{ flexShrink: 0 }} />
                        </Tooltip>
                    )}
                    <StatusDot status={node.status} />
                </Group>
            </UnstyledButton>

            {/* Children: an indented block with a vertical guide line the
                horizontal connectors above attach to. */}
            {budget && isOpen && kids && (
                <Box ml={14} pl={6} style={{ borderLeft: `1px solid ${LINE}` }}>
                    {kids.length > 0 ? kids.map(child => (
                        <TreeRow key={child.id} node={child} depth={depth + 1}
                            childrenMap={childrenMap} expanded={expanded} loadingIds={loadingIds}
                            selectedId={selectedId} onSelect={onSelect} onToggle={onToggle}
                            searchActive={searchActive} />
                    )) : (!searchActive && (
                        <Text size="xs" c="dimmed" py="2" pl="28">empty</Text>
                    ))}
                </Box>
            )}
        </>
    );
}

export function BudgetTree({ roots, childrenMap, expanded, loadingIds, selectedId, onSelect, onToggle, searchActive = false }) {
    if (roots.length === 0) {
        return <Text size="sm" c="dimmed" p="xs">No matches.</Text>;
    }
    return (
        <Box>
            {roots.map(node => (
                <TreeRow key={node.id} node={node} depth={0}
                    childrenMap={childrenMap} expanded={expanded} loadingIds={loadingIds}
                    selectedId={selectedId} onSelect={onSelect} onToggle={onToggle}
                    searchActive={searchActive} />
            ))}
        </Box>
    );
}
