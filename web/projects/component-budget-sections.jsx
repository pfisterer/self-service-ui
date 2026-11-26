import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Badge, Box, Checkbox, Collapse, Group, Paper, Stack, Table, Text, UnstyledButton } from '@mantine/core';
import { ResourceBar } from './component-common.jsx';
import { UNLIMITED_QUOTA, gpuClassResource, isAvailability, kindOfResource, resourceName } from './util-project.jsx';

// BudgetResourceSections (new layout) is a budget's resources in sections — Cloud, Workspaces, GPU, Sprachmodelle, Freigaben — each folded to one line that sums it up. Every quantity is one bar of two tones (what is used, and what is handed out but not used), the GPU classes one small table, the availabilities chips. Rows nothing is granted, handed out or used of are left out unless "leere Zeilen anzeigen" is ticked.

export const SECTION_IDS = ['cloud', 'workspaces', 'gpu', 'llm', 'free'];

// sectionOf sorts a resource into its section.
export function sectionOf(r) {
    if (isAvailability(r)) return 'free';
    if (gpuClassResource(r)) return 'gpu';
    const kind = kindOfResource(r);
    return kind === 'cloud' || kind === 'workspaces' || kind === 'llm' ? kind : 'cloud';
}

// barFigures are a quantity's numbers on a budget, as NodeUsageBars (component-common.jsx) takes them from the server's rollup.
export function barFigures(node, r) {
    const usage = node.usage ?? {};
    const retired = (usage.released?.limit?.[r.id] ?? 0) + (usage.archived?.limit?.[r.id] ?? 0);
    return {
        limit: node.limit?.[r.id] ?? 0,
        approved: (usage.approved?.limit?.[r.id] ?? 0) + retired,
        retired,
        changePending: usage.change_pending?.limit?.[r.id] ?? 0,
        used: (node.subtree_in_use ?? {})[r.id],
    };
}

// isEmptyRow: nothing granted, handed out, asked for or used.
export function isEmptyRow(node, r) {
    const f = barFigures(node, r);
    return f.limit === 0 && f.approved === 0 && f.changePending === 0 && !(f.used > 0);
}

export function BudgetResourceSections({ node, resources }) {
    const { t } = useTranslation();
    const [showEmpty, setShowEmpty] = useState(false);
    const [open, setOpen] = useState({ cloud: true, gpu: true });
    const rows = (resources || []).filter(r => showEmpty || (isAvailability(r) ? node.limit?.[r.id] === 1 : !isEmptyRow(node, r)));
    const by = Object.fromEntries(SECTION_IDS.map(id => [id, rows.filter(r => sectionOf(r) === id)]));
    const fmt = (v) => (v === UNLIMITED_QUOTA ? '∞' : typeof v === 'number' ? v.toLocaleString() : '–');
    const summaryOf = (id) => {
        const list = by[id];
        if (id === 'free') return t('projects.v2.budget.grants', { count: list.length });
        const first = id === 'gpu' ? list.find(r => gpuClassResource(r).kind === 'hours') : list[0];
        if (!first) return '';
        const f = barFigures(node, first);
        return t('projects.v2.budget.summary', { used: fmt(f.used ?? 0), given: fmt(f.approved), name: resourceName(t, first) });
    };

    return (
        <Stack gap="sm">
            <Group gap="lg" wrap="wrap">
                <Group gap={6}><Box w={14} h={8} bg="blue" style={{ borderRadius: 2 }} /><Text size="xs" c="dimmed">{t('projects.v2.budget.legendUsed')}</Text></Group>
                <Group gap={6}><Box w={14} h={8} bg="blue.3" style={{ borderRadius: 2 }} /><Text size="xs" c="dimmed">{t('projects.v2.budget.legendGiven')}</Text></Group>
                <Checkbox ml="auto" size="xs" label={t('projects.v2.budget.showEmpty')} checked={showEmpty} onChange={(e) => setShowEmpty(e.currentTarget.checked)} />
            </Group>
            {SECTION_IDS.filter(id => by[id].length > 0).map(id => (
                <Paper key={id} withBorder radius="md" style={{ overflow: 'hidden' }}>
                    <UnstyledButton w="100%" px="md" py="sm" bg="var(--mantine-color-default-hover)" aria-expanded={!!open[id]}
                        onClick={() => setOpen(o => ({ ...o, [id]: !o[id] }))}>
                        <Group gap={8} wrap="nowrap">
                            {open[id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            <Text fw={600} size="sm">{t(`projects.v2.budget.section.${id}`)}</Text>
                            <Text size="xs" c="dimmed" ml="auto" ta="right">{summaryOf(id)}</Text>
                        </Group>
                    </UnstyledButton>
                    <Collapse in={!!open[id]}>
                        <Box p="md">
                            {id === 'gpu' ? <GpuTable node={node} resources={by.gpu} fmt={fmt} />
                                : id === 'free' ? (
                                    <Group gap={6} wrap="wrap">
                                        {by.free.map(r => <Badge key={r.id} variant="light" color="gray" tt="none" size="lg">{resourceName(t, r)}</Badge>)}
                                    </Group>
                                ) : (
                                    <Stack gap="sm">
                                        {by[id].map(r => {
                                            const f = barFigures(node, r);
                                            return <ResourceBar key={r.id} resource={r} limit={f.limit} approved={f.approved} retired={f.retired} changePending={f.changePending} used={f.used} />;
                                        })}
                                    </Stack>
                                )}
                        </Box>
                    </Collapse>
                </Paper>
            ))}
            {SECTION_IDS.every(id => by[id].length === 0) && <Text size="xs" c="dimmed">{t('projects.budgetCard.nothingGranted')}</Text>}
        </Stack>
    );
}

// GpuTable is one row per GPU class: how many at the same time, GPU hours per window, and the hours used.
function GpuTable({ node, resources, fmt }) {
    const { t } = useTranslation();
    const classes = new Map();
    for (const r of resources) {
        const g = gpuClassResource(r);
        const c = classes.get(g.classId) ?? { id: g.classId, name: g.name || g.classId };
        c[g.kind] = barFigures(node, r);
        classes.set(g.classId, c);
    }
    return (
        <Table verticalSpacing={6} fz="sm">
            <Table.Thead>
                <Table.Tr>
                    <Table.Th>{t('projects.v2.budget.gpuClass')}</Table.Th>
                    <Table.Th ta="right">{t('projects.v2.budget.gpuConcurrent')}</Table.Th>
                    <Table.Th ta="right">{t('projects.v2.budget.gpuHours')}</Table.Th>
                    <Table.Th ta="right">{t('projects.v2.budget.gpuUsed')}</Table.Th>
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
                {[...classes.values()].map(c => (
                    <Table.Tr key={c.id}>
                        <Table.Td>{c.name}</Table.Td>
                        <Table.Td ta="right">{fmt(c.gpus?.limit)}</Table.Td>
                        <Table.Td ta="right">{fmt(c.hours?.limit)}</Table.Td>
                        <Table.Td ta="right">{fmt(c.hours?.used ?? 0)}</Table.Td>
                    </Table.Tr>
                ))}
            </Table.Tbody>
        </Table>
    );
}
