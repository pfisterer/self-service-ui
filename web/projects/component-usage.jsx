import { lazy, Suspense, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Info } from 'lucide-react';
import { Alert, Button, Group, Paper, Progress, SegmentedControl, Select, SimpleGrid, Stack, Table, Text, Title, Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Loading, LoadError } from '/helper/query-state.jsx';
import { useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { COLOR, isBudget } from './util-project.jsx';
import { averageStorage, GROUPINGS, groupProjects, idleProject, percent, PERIODS, periodRange, toCSV } from './util-usage.js';

// What projects actually used, from the rows the reconciler collects once a
// day: per project and for everything below a budget (UsagePanel), and the
// root admins' evaluation over all of them (UsageReportPanel). Reading only.

const num = (v, digits = 0) => (v === null || v === undefined
    ? '—'
    : Number(v).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 }));

const eur = (v) => (v === null || v === undefined
    ? '—'
    : Number(v).toLocaleString(undefined, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }));

function PeriodPicker({ value, onChange }) {
    const { t } = useTranslation();
    return (
        <SegmentedControl size="xs" value={value} onChange={onChange}
            data={PERIODS.map(p => ({ value: p, label: t(`projects.consumption.period.${p}`) }))} />
    );
}

function Stat({ label, value, hint }) {
    return (
        <Stack gap="2">
            <Text size="xs" c="dimmed">{label}</Text>
            <Text size="lg" fw={600}>{value}</Text>
            {hint && <Text size="xs" c="dimmed">{hint}</Text>}
        </Stack>
    );
}

// UtilizationBar: used ÷ reserved for one resource, or a note that nothing was
// reserved to compare with.
function UtilizationBar({ label, ratio }) {
    const { t } = useTranslation();
    const pct = percent(ratio);
    return (
        <Stack gap="2">
            <Group justify="space-between">
                <Text size="xs">{label}</Text>
                <Text size="xs" c="dimmed">{pct === null ? t('projects.consumption.notReserved') : t('projects.consumption.ofReserved', { pct })}</Text>
            </Group>
            <Progress size="sm" value={Math.min(pct ?? 0, 100)}
                color={pct === null ? 'gray' : pct < 20 ? COLOR.attention : COLOR.positive} />
        </Stack>
    );
}

// The chart library is loaded only when a usage view is opened.
const DailyChart = lazy(() => import('./component-usage-chart.jsx'));

function Totals({ report }) {
    const { t } = useTranslation();
    const avg = averageStorage(report);
    return (
        <>
            <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
                <Stat label={t('projects.consumption.serverHours')} value={num(report.server_hours)} />
                <Stat label={t('projects.consumption.vcpuHours')} value={num(report.vcpu_hours)} />
                <Stat label={t('projects.consumption.ramGbHours')} value={num(report.ram_gb_hours)} />
                <Stat label={t('projects.consumption.storageAvg')} value={avg === null ? '—' : `${num(avg, 1)} GB`}
                    hint={avg === null ? t('projects.consumption.noStorageSample') : null} />
            </SimpleGrid>
            <Stack gap="xs">
                <UtilizationBar label={t('projects.consumption.cores')} ratio={report.utilization?.cores} />
                <UtilizationBar label={t('projects.consumption.ram')} ratio={report.utilization?.ram} />
                <UtilizationBar label={t('projects.consumption.storage')} ratio={report.utilization?.storage} />
            </Stack>
        </>
    );
}

// The projects of a budget that stand out: who used most, and who reserved a
// lot and used little.
function BudgetProjects({ projects }) {
    const { t } = useTranslation();
    const top = projects.slice(0, 5);
    const lowest = projects
        .filter(p => p.utilization?.cores !== undefined && p.utilization?.cores !== null)
        .sort((a, b) => a.utilization.cores - b.utilization.cores)
        .slice(0, 5);
    const table = (rows, title) => (
        <Stack gap="2">
            <Text size="sm" fw={600}>{title}</Text>
            <Table striped fz="xs">
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>{t('projects.consumption.project')}</Table.Th>
                        <Table.Th ta="right">{t('projects.consumption.vcpuHours')}</Table.Th>
                        <Table.Th ta="right">{t('projects.consumption.coresUsed')}</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {rows.map(p => (
                        <Table.Tr key={p.node_id}>
                            <Table.Td>{p.project_name || p.node_id}</Table.Td>
                            <Table.Td ta="right">{num(p.vcpu_hours)}</Table.Td>
                            <Table.Td ta="right">{percent(p.utilization?.cores) === null ? '—' : `${percent(p.utilization.cores)} %`}</Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
        </Stack>
    );
    if (!projects.length) return null;
    return (
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            {table(top, t('projects.consumption.topProjects'))}
            {lowest.length > 0 && table(lowest, t('projects.consumption.lowestUtilization'))}
        </SimpleGrid>
    );
}

/**
 * UsagePanel shows what a project used, or everything below a budget, over a
 * chosen period. Mounted only while its tab is open, so nothing is fetched for
 * someone who never looks.
 */
export function UsagePanel({ node }) {
    const { t } = useTranslation();
    const api = useNodesApi();
    const [periodKey, setPeriodKey] = useState('30');
    const period = useMemo(() => periodRange(periodKey, new Date(), node?.created_at), [periodKey, node?.created_at]);

    const query = useQuery({
        queryKey: projectKeys.usage(node?.id, period),
        queryFn: () => api.nodeUsage(node.id, period),
        enabled: !!api && !!node?.id,
        staleTime: 10 * 60 * 1000,
    });

    const budget = isBudget(node);
    return (
        <Stack gap="md">
            <Group justify="space-between">
                <Text size="xs" c="dimmed">{t('projects.consumption.range', period)}</Text>
                <PeriodPicker value={periodKey} onChange={setPeriodKey} />
            </Group>
            {query.isPending ? <Loading size="sm" />
                : query.isError ? <LoadError query={query} title={t('projects.consumption.loadError')} />
                    : query.data.days.length === 0 ? (
                        <Text size="sm" c="dimmed">{t('projects.consumption.empty')}</Text>
                    ) : (
                        <>
                            {!budget && idleProject(query.data, node) && (
                                <Alert variant="light" color={COLOR.attention} icon={<Info size="16" />} p="xs">
                                    <Text size="xs">{t('projects.consumption.idle')}</Text>
                                </Alert>
                            )}
                            <Totals report={query.data} />
                            <Suspense fallback={<Loading size="sm" />}><DailyChart days={query.data.days} /></Suspense>
                            {budget && <BudgetProjects projects={query.data.projects} />}
                            {query.data.backfilled_days > 0 && (
                                <Text size="xs" c="dimmed">{t('projects.consumption.backfilled', { count: query.data.backfilled_days })}</Text>
                            )}
                        </>
                    )}
        </Stack>
    );
}

/**
 * UsageReportPanel is the root admins' evaluation: every project's consumption,
 * summed by location, faculty, budget or per project, with a CSV export and —
 * where list prices are configured — a value in euro.
 */
export function UsageReportPanel() {
    const { t } = useTranslation();
    const api = useNodesApi();
    const [periodKey, setPeriodKey] = useState('30');
    const [by, setBy] = useState('level1');
    const period = useMemo(() => periodRange(periodKey === 'lifetime' ? '1098' : periodKey), [periodKey]);

    const query = useQuery({
        queryKey: projectKeys.usageReport(period),
        queryFn: () => api.usageReport(period),
        enabled: !!api,
        staleTime: 10 * 60 * 1000,
    });

    const report = query.data;
    const rows = useMemo(() => groupProjects(report?.projects, by), [report, by]);
    const withValue = !!report?.prices;

    const columns = [
        { label: t(`projects.consumption.groupBy.${by}`), value: r => r.name },
        { label: t('projects.consumption.projects'), value: r => r.projects },
        { label: t('projects.consumption.serverHours'), value: r => r.server_hours },
        { label: t('projects.consumption.vcpuHours'), value: r => r.vcpu_hours },
        { label: t('projects.consumption.ramGbHours'), value: r => r.ram_gb_hours },
        { label: t('projects.consumption.storageGbDays'), value: r => r.storage_gb_days },
        { label: t('projects.consumption.coresUsed'), value: r => percent(r.utilization.cores) },
        ...(withValue ? [{ label: t('projects.consumption.valueEur'), value: r => r.value_eur }] : []),
    ];

    const download = () => {
        const blob = new Blob([toCSV(columns, rows)], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `usage-${by}-${period.from}-${period.to}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <Paper withBorder p="md" radius="sm">
            <Stack gap="md">
                <Group justify="space-between" align="center">
                    <Title order={5}>{t('projects.consumption.reportTitle')}</Title>
                    <Group gap="xs">
                        <Select size="xs" w={180} value={by} onChange={(v) => v && setBy(v)} allowDeselect={false}
                            data={GROUPINGS.map(g => ({ value: g, label: t(`projects.consumption.groupBy.${g}`) }))} />
                        <PeriodPicker value={periodKey} onChange={setPeriodKey} />
                        <Tooltip label={t('projects.consumption.csvHint')}>
                            <Button size="xs" variant="light" leftSection={<Download size="14" />}
                                onClick={download} disabled={!rows.length}>CSV</Button>
                        </Tooltip>
                    </Group>
                </Group>
                <Text size="xs" c="dimmed">{t('projects.consumption.reportText', period)}</Text>
                {query.isPending ? <Loading size="sm" />
                    : query.isError ? <LoadError query={query} title={t('projects.consumption.loadError')} />
                        : !rows.length ? <Text size="sm" c="dimmed">{t('projects.consumption.empty')}</Text>
                            : (
                                <>
                                    <SimpleGrid cols={{ base: 2, sm: withValue ? 5 : 4 }} spacing="md">
                                        <Stat label={t('projects.consumption.projects')} value={num(report.projects.length)} />
                                        <Stat label={t('projects.consumption.vcpuHours')} value={num(report.vcpu_hours)} />
                                        <Stat label={t('projects.consumption.ramGbHours')} value={num(report.ram_gb_hours)} />
                                        <Stat label={t('projects.consumption.coresUsed')}
                                            value={percent(report.utilization?.cores) === null ? '—' : `${percent(report.utilization.cores)} %`} />
                                        {withValue && <Stat label={t('projects.consumption.valueEur')} value={eur(report.value_eur)}
                                            hint={t('projects.consumption.valueHint')} />}
                                    </SimpleGrid>
                                    <Table.ScrollContainer minWidth={640}>
                                        <Table striped fz="xs">
                                            <Table.Thead>
                                                <Table.Tr>
                                                    {columns.map((c, i) => <Table.Th key={c.label} ta={i ? 'right' : undefined}>{c.label}</Table.Th>)}
                                                </Table.Tr>
                                            </Table.Thead>
                                            <Table.Tbody>
                                                {rows.map(r => (
                                                    <Table.Tr key={r.id || '—'}>
                                                        <Table.Td>{r.name || '—'}</Table.Td>
                                                        <Table.Td ta="right">{r.projects}</Table.Td>
                                                        <Table.Td ta="right">{num(r.server_hours)}</Table.Td>
                                                        <Table.Td ta="right">{num(r.vcpu_hours)}</Table.Td>
                                                        <Table.Td ta="right">{num(r.ram_gb_hours)}</Table.Td>
                                                        <Table.Td ta="right">{num(r.storage_gb_days)}</Table.Td>
                                                        <Table.Td ta="right">{percent(r.utilization.cores) === null ? '—' : `${percent(r.utilization.cores)} %`}</Table.Td>
                                                        {withValue && <Table.Td ta="right">{eur(r.value_eur)}</Table.Td>}
                                                    </Table.Tr>
                                                ))}
                                            </Table.Tbody>
                                        </Table>
                                    </Table.ScrollContainer>
                                    {report.backfilled_days > 0 && (
                                        <Text size="xs" c="dimmed">{t('projects.consumption.backfilled', { count: report.backfilled_days })}</Text>
                                    )}
                                </>
                            )}
            </Stack>
        </Paper>
    );
}
