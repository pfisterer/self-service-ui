import { Group, Text, UnstyledButton } from '@mantine/core';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

// SortButton is one sortable label in a header cell: the label, then the direction once it is the active sort, a quiet double arrow otherwise. `sort` is { key, order } with order 'asc' or 'desc'; a click hands sortKey to onSort, which decides the new order. A cell may hold two when the column shows two values stacked; `dimmed` marks the second one, the value on the quieter line below.
export function SortButton({ label, sortKey, sort, onSort, dimmed = false }) {
    const active = sort.key === sortKey;
    const Icon = !active ? ArrowUpDown : sort.order === 'asc' ? ArrowUp : ArrowDown;
    return (
        <UnstyledButton onClick={() => onSort(sortKey)}
            aria-sort={active ? (sort.order === 'asc' ? 'ascending' : 'descending') : undefined}>
            <Group gap="4" wrap="nowrap">
                <Text size="sm" fw={dimmed ? 500 : 600} c={dimmed && !active ? 'dimmed' : undefined}
                    style={{ whiteSpace: 'nowrap' }}>{label}</Text>
                <Icon size="12" color={active ? undefined : 'var(--mantine-color-gray-5)'} />
            </Group>
        </UnstyledButton>
    );
}

// validSort is what the browser kept for a table's sort if it still has the shape it was written in and names one of `keys`, the fallback otherwise.
export function validSort(stored, keys, fallback) {
    return stored && keys.includes(stored.key) && (stored.order === 'asc' || stored.order === 'desc') ? stored : fallback;
}
