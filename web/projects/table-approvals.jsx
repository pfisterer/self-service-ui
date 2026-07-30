import { useMemo, useState } from 'react';
import {
    AlertTriangle, Check, ChevronDown, ChevronUp, ChevronsUpDown, CloudDownload,
    Eye, FileDiff, FilePlus2, FolderPlus, History, Rocket, X,
} from 'lucide-react';
import {
    ActionIcon, Badge, Group, SegmentedControl, Stack, Table, Text, ThemeIcon,
    Tooltip, UnstyledButton,
} from '@mantine/core';
import {
    UNLIMITED_QUOTA,
    isBudget,
    isImported,
    nodeTitle,
    ownerEmail,
    resourceSummaryText,
} from './util-project.jsx';

// ApprovalsTable renders the manager's inbox as ONE flat, sortable table.
// A type icon in the first column tells what kind of request each row is, a
// filter above the table narrows it down to one type, and every column header
// (except Resources/Actions) toggles ascending/descending sort. Everything
// beyond the key facts lives behind the Details/History dialogs.
// Like ProjectCard it reports each action via onAction(actionId, node) and the
// owning view opens the matching dialog.

// ── Request types ───────────────────────────────────────────────────────────
// One place defines icon, color and wording per request type; `order` is the
// sort order when sorting by type.

const TYPE_META = {
    project: { label: 'New project', icon: FilePlus2, color: 'blue', order: 0 },
    budget: { label: 'New budget', icon: FolderPlus, color: 'cyan', order: 1 },
    change: { label: 'Change request', icon: FileDiff, color: 'orange', order: 2 },
    imported: { label: 'Imported from OpenStack', icon: CloudDownload, color: 'violet', order: 3 },
};

// Classifies a node into one of the TYPE_META keys.
export function requestType(node) {
    if (isImported(node)) return 'imported';
    if (node.status === 'change_pending') return 'change';
    return isBudget(node) ? 'budget' : 'project';
}

function TypeCell({ type }) {
    const meta = TYPE_META[type];
    return (
        <Tooltip label={meta.label}>
            <ThemeIcon variant="light" color={meta.color} size="md" style={{ cursor: 'default' }}>
                <meta.icon size="15" />
            </ThemeIcon>
        </Tooltip>
    );
}

// ── Resources column ────────────────────────────────────────────────────────

// Resource summary of a change request: the proposed values, each with its
// delta, e.g. "12 Cores (+4) · 48 GB RAM (+16)".
function proposedSummaryText(resources, from, to) {
    return (resources || [])
        .filter(r => (to?.[r.id] ?? 0) !== 0 || (from?.[r.id] ?? 0) !== 0)
        .map(r => {
            const a = from?.[r.id] ?? 0;
            const b = to?.[r.id] ?? 0;
            const v = b === UNLIMITED_QUOTA ? '∞' : b;
            const base = r.unit ? `${v} ${r.unit} ${r.name}` : `${v} ${r.name}`;
            if (a === b || a === UNLIMITED_QUOTA || b === UNLIMITED_QUOTA) return base;
            const d = b - a;
            return `${base} (${d > 0 ? '+' : ''}${d})`;
        })
        .join(' · ');
}

function ResourcesCell({ node, resources }) {
    const proposed = node.status === 'change_pending' ? node.pending?.limit : null;
    if (proposed) {
        return (
            <Tooltip label={`Currently: ${resourceSummaryText(resources, node.limit) || 'nothing'}`}>
                <Text size="xs" c="orange.8" style={{ cursor: 'default' }}>
                    {proposedSummaryText(resources, node.limit, proposed)}
                </Text>
            </Tooltip>
        );
    }
    return <Text size="xs">{resourceSummaryText(resources, node.limit)}</Text>;
}

// ── Rows ────────────────────────────────────────────────────────────────────

function ApprovalRow({ node, resources, parentName, onAction }) {
    const act = (action) => onAction?.(action, node);

    const imported = isImported(node);
    const decidable = node.status === 'pending' || node.status === 'change_pending';
    const queued = imported && (node.flags || []).includes('promote_on_reconcile');
    const hasHistory = (node.history || []).length > 0;

    // The tooltip may explain more; the aria-label stays the short action name.
    const iconButton = (label, icon, color, onClick, { disabled = false, tooltip } = {}) => (
        <Tooltip label={tooltip || label}>
            <ActionIcon variant="light" color={color} disabled={disabled} onClick={onClick}
                aria-label={label}>
                {icon}
            </ActionIcon>
        </Tooltip>
    );

    // Clicking anywhere on the row opens Details; the action buttons in the
    // last cell stop propagation so they don't ALSO trigger the row click.
    return (
        <Table.Tr onClick={() => act('details')} style={{ cursor: 'pointer' }}>
            <Table.Td><TypeCell type={requestType(node)} /></Table.Td>
            <Table.Td>
                <Group gap="6" wrap="nowrap">
                    <Text size="sm" fw={600} lineClamp={1}>{nodeTitle(node)}</Text>
                    {node.os_overcommitted && (
                        <Tooltip label="The project currently uses more in OpenStack than was granted.">
                            <AlertTriangle size="14" color="var(--mantine-color-red-7)" />
                        </Tooltip>
                    )}
                </Group>
            </Table.Td>
            {/* Budgets have no owner — show who filed the request instead. */}
            <Table.Td><Text size="xs" c="dimmed">{ownerEmail(node) || node.created_by || '—'}</Text></Table.Td>
            <Table.Td><Text size="xs">{parentName || '—'}</Text></Table.Td>
            <Table.Td><ResourcesCell node={node} resources={resources} /></Table.Td>
            <Table.Td>
                <Text size="xs" c="dimmed">
                    {node.created_at ? new Date(node.created_at).toLocaleDateString() : '—'}
                </Text>
            </Table.Td>
            <Table.Td onClick={(e) => e.stopPropagation()}>
                <Group gap="4" justify="flex-end" wrap="nowrap">
                    {iconButton('Details', <Eye size="15" />, 'blue', () => act('details'))}
                    {iconButton('History', <History size="15" />, 'gray', () => act('history'), { disabled: !hasHistory })}
                    {decidable && iconButton('Approve', <Check size="15" />, 'green', () => act('approve'))}
                    {decidable && iconButton('Reject', <X size="15" />, 'red', () => act('reject'))}
                    {imported && !queued &&
                        iconButton('Adopt', <Rocket size="15" />, 'violet', () => act('adopt'),
                            { tooltip: 'Adopt — place this project under a budget' })}
                    {queued && (
                        <Tooltip label="The next synchronization run will bring this project under management.">
                            <Badge size="xs" variant="light" color="gray" style={{ cursor: 'default' }}>
                                Queued
                            </Badge>
                        </Tooltip>
                    )}
                </Group>
            </Table.Td>
        </Table.Tr>
    );
}

// ── Sortable header cell ────────────────────────────────────────────────────

function SortableTh({ children, active, dir, onSort, width }) {
    const Chevron = active ? (dir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
    return (
        <Table.Th w={width}>
            <UnstyledButton onClick={onSort}
                style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%' }}>
                <Text size="sm" fw={700}>{children}</Text>
                <Chevron size="13" style={{ opacity: active ? 1 : 0.4 }} />
            </UnstyledButton>
        </Table.Th>
    );
}

// ── Table ───────────────────────────────────────────────────────────────────

// The value a row is sorted by, per column key.
function sortValue(node, parentNames, column) {
    switch (column) {
        case 'type': return TYPE_META[requestType(node)].order;
        case 'request': return nodeTitle(node).toLowerCase();
        case 'owner': return (ownerEmail(node) || node.created_by || '').toLowerCase();
        case 'budget': return (parentNames?.get(node.parent_id) || '').toLowerCase();
        case 'requested': return node.created_at || '';
        default: return '';
    }
}

export function ApprovalsTable({ items, resources, parentNames, onAction }) {
    const [filter, setFilter] = useState('all');
    // Newest first by default — managers usually care about the latest request.
    const [sortBy, setSortBy] = useState('requested');
    const [sortDir, setSortDir] = useState('desc');

    const toggleSort = (column) => {
        if (column === sortBy) {
            setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortBy(column);
            setSortDir(column === 'requested' ? 'desc' : 'asc');
        }
    };

    const rows = useMemo(() => {
        const filtered = filter === 'all' ? items : items.filter(n => requestType(n) === filter);
        const sign = sortDir === 'asc' ? 1 : -1;
        return [...filtered].sort((a, b) => {
            const va = sortValue(a, parentNames, sortBy);
            const vb = sortValue(b, parentNames, sortBy);
            return va < vb ? -sign : va > vb ? sign : 0;
        });
    }, [items, parentNames, filter, sortBy, sortDir]);

    const count = (type) => items.filter(n => requestType(n) === type).length;
    const th = (column, label, width) => (
        <SortableTh active={sortBy === column} dir={sortDir} width={width}
            onSort={() => toggleSort(column)}>
            {label}
        </SortableTh>
    );

    return (
        <Stack gap="sm">
            <SegmentedControl
                value={filter}
                onChange={setFilter}
                data={[
                    { value: 'all', label: `All (${items.length})` },
                    ...Object.entries(TYPE_META).map(([value, meta]) => ({
                        value,
                        label: (
                            <Group gap="6" wrap="nowrap">
                                <meta.icon size="13" />
                                <span>{value === 'imported' ? 'Imported' : `${meta.label}s`} ({count(value)})</span>
                            </Group>
                        ),
                    })),
                ]}
            />

            <Table.ScrollContainer minWidth={820}>
                <Table verticalSpacing="6" highlightOnHover>
                    <Table.Thead>
                        <Table.Tr>
                            {th('type', 'Type', 60)}
                            {th('request', 'Request')}
                            {th('owner', 'Owner')}
                            {th('budget', 'Budget')}
                            <Table.Th>Resources</Table.Th>
                            {th('requested', 'Requested', 110)}
                            <Table.Th style={{ textAlign: 'right' }}>Actions</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {rows.map(n => (
                            <ApprovalRow key={n.id} node={n} resources={resources}
                                parentName={parentNames?.get(n.parent_id)} onAction={onAction} />
                        ))}
                        {rows.length === 0 && (
                            <Table.Tr>
                                <Table.Td colSpan={7}>
                                    <Text size="sm" c="dimmed" ta="center" py="sm">
                                        No requests of this type.
                                    </Text>
                                </Table.Td>
                            </Table.Tr>
                        )}
                    </Table.Tbody>
                </Table>
            </Table.ScrollContainer>
        </Stack>
    );
}
