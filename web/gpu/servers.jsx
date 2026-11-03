import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Container, Group, Paper, Stack, Table, Text, Title, Tooltip } from '@mantine/core';
import { Link } from 'wouter';
import { ArrowRight, Play, Square } from 'lucide-react';
import { LoadError, Loading, useApiMutation } from '/helper/query-state.jsx';
import { useConfirm } from '/providers/confirm.jsx';
import { useGpuApi } from '/gpu/api-gpu.jsx';
import { gpuKeys } from '/gpu/query-keys.js';
import { profileLabel, usesGpu } from '/gpu/profiles.js';
import { formatDuration } from '/helper/duration.js';
import { oneDot, releaseIdle, releaseOf } from '/gpu/release.js';

// The person's JupyterHub servers (also those started on the hub page itself).
export function GpuServers() {
    const { t, i18n } = useTranslation();
    const api = useGpuApi();
    const confirm = useConfirm();

    const servers = useQuery({ queryKey: gpuKeys.servers(), queryFn: () => api.listServers(), refetchInterval: 10000 });
    // The names of the person's projects, so a server shows its project instead of the generated server name.
    const options = useQuery({ queryKey: gpuKeys.startOptions(), queryFn: () => api.startOptions() });
    const projectName = (slug) => options.data?.projects?.find(p => p.slug === slug)?.name || slug;
    // The release times of the server, as the hub enforces them: the project's (budget and project, idle time with and without an open tab, upper bound), else the profile's from before; how long until its latest end (from its start, counted from the list's last refresh every 10 s), the time of day on hover. The countdown to the idle release itself is shown in JupyterLab, which knows the activity.
    const ends = (s) => {
        const project = options.data?.projects?.find(p => p.slug === s.project);
        const r = releaseOf(project, s.profile);
        if (r) {
            const idle = releaseIdle(r, t, i18n.language);
            if (!r.max || !s.started) return { text: oneDot(r.max ? `${idle}.` : t('gpu.release.noMax', { idle })), at: null };
            const end = new Date(s.started).getTime() + r.max * 1000;
            return {
                text: oneDot(t('gpu.release.left', { idle, left: formatDuration(end - servers.dataUpdatedAt, i18n.language) })),
                at: new Date(end).toLocaleString(i18n.language, { weekday: 'short', hour: '2-digit', minute: '2-digit' }),
            };
        }
        const p = options.data?.profiles?.find(x => x.slug === s.profile);
        if (!p?.idle_minutes || !p?.max_hours || !s.started) return null;
        const end = new Date(s.started).getTime() + p.max_hours * 3600 * 1000;
        return {
            text: oneDot(t('gpu.servers.ends', { idle: formatDuration(p.idle_minutes * 60000, i18n.language), left: formatDuration(end - servers.dataUpdatedAt, i18n.language) })),
            at: new Date(end).toLocaleString(i18n.language, { weekday: 'short', hour: '2-digit', minute: '2-digit' }),
        };
    };
    const stop = useApiMutation({ mutationFn: (name) => api.stopServer(name), invalidates: [gpuKeys.servers()] });

    async function onStop(s) {
        const ok = await confirm({
            title: t('gpu.servers.stopTitle'),
            confirmLabel: t('gpu.servers.stopConfirm'),
            message: t('gpu.servers.stopMessage', { name: s.project ? projectName(s.project) : s.name || t('gpu.servers.default') }),
        });
        if (ok) stop.mutate(s.name);
    }

    if (servers.isPending) return <Container size="lg" py="md"><Loading /></Container>;
    if (servers.isError) return <Container size="lg" py="md"><LoadError query={servers} /></Container>;

    const list = servers.data ?? [];
    return (
        <Container size="lg" py="md">
            <Stack gap="lg">
                <Paper p="lg" radius="md" withBorder>
                    <Group justify="space-between" align="flex-start" wrap="wrap">
                        <div style={{ maxWidth: 640 }}>
                            <Title order={3}>{t('gpu.servers.title')}</Title>
                            <Text size="sm" c="dimmed" mt={4}>{t('gpu.servers.intro')}</Text>
                        </div>
                        <Button size="xs" component={Link} href="/servers/start" variant="light" leftSection={<Play size={14} />}>
                            {t('gpu.servers.startServer')}
                        </Button>
                    </Group>
                    <Table striped highlightOnHover mt="md">
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>{t('gpu.servers.name')}</Table.Th>
                                <Table.Th>{t('gpu.servers.profile')}</Table.Th>
                                <Table.Th>{t('gpu.servers.state')}</Table.Th>
                                <Table.Th />
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {list.length === 0 && (
                                <Table.Tr><Table.Td colSpan={4}><Text size="sm" c="dimmed">{t('gpu.servers.none')}</Text></Table.Td></Table.Tr>
                            )}
                            {list.map(s => (
                                <Table.Tr key={s.name || '-'}>
                                    <Table.Td>
                                        <Text size="sm" fw={500}>{s.project ? projectName(s.project) : s.name || t('gpu.servers.default')}</Text>
                                        {s.project && <Text size="xs" c="dimmed">{s.name}</Text>}
                                        {s.image && <Text size="xs" c="dimmed" ff="monospace">{s.image.split('/').pop()}</Text>}
                                    </Table.Td>
                                    <Table.Td>
                                        <Badge variant="light" color={usesGpu(s.profile) ? 'grape' : 'gray'} style={{ textTransform: 'none' }}>
                                            {profileLabel(s.profile, t)}
                                        </Badge>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm">{s.ready ? t('gpu.servers.ready') : s.pending === 'stop' ? t('gpu.servers.stopping') : t('gpu.servers.starting')}</Text>
                                        {s.ready && ends(s) && <Tooltip label={ends(s).at} withArrow disabled={!ends(s).at}><Text size="xs" c="dimmed">{ends(s).text}</Text></Tooltip>}
                                    </Table.Td>
                                    <Table.Td align="right">
                                        <Group gap={4} justify="flex-end" wrap="nowrap">
                                            {/* In this tab, like after a start: a new tab per click piles up, and a named tab would need the opener, which the notebook's page must not get. */}
                                            <Button size="xs" variant="light" component="a" href={s.url}
                                                rightSection={<ArrowRight size={14} />} disabled={!s.ready}>
                                                {t('gpu.servers.open')}
                                            </Button>
                                            <Button size="xs" variant="subtle" color="red" leftSection={<Square size={14} />}
                                                loading={stop.isPending && stop.variables === s.name} onClick={() => onStop(s)}>
                                                {t('gpu.servers.stop')}
                                            </Button>
                                        </Group>
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Paper>
            </Stack>
        </Container>
    );
}
