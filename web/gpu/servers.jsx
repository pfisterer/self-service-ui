import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Container, Group, Paper, Stack, Table, Text, Title } from '@mantine/core';
import { ExternalLink, Square } from 'lucide-react';
import { LoadError, Loading, useApiMutation } from '/helper/query-state.jsx';
import { useConfirm } from '/providers/confirm.jsx';
import { useGpuApi } from '/gpu/api-gpu.jsx';
import { gpuKeys } from '/gpu/query-keys.js';
import { profileLabel, usesGpu } from '/gpu/profiles.js';

// The person's JupyterHub servers (also those started on the hub page itself).
export function GpuServers() {
    const { t } = useTranslation();
    const api = useGpuApi();
    const confirm = useConfirm();

    const servers = useQuery({ queryKey: gpuKeys.servers(), queryFn: () => api.listServers(), refetchInterval: 10000 });
    const stop = useApiMutation({ mutationFn: (name) => api.stopServer(name), invalidates: [gpuKeys.servers()] });

    async function onStop(s) {
        const ok = await confirm({
            title: t('gpu.servers.stopTitle'),
            confirmLabel: t('gpu.servers.stopConfirm'),
            message: t('gpu.servers.stopMessage', { name: s.name || t('gpu.servers.default') }),
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
                    <Title order={3}>{t('gpu.servers.title')}</Title>
                    <Text size="sm" c="dimmed" mt={4}>{t('gpu.servers.intro')}</Text>
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
                                        <Text size="sm" fw={500}>{s.name || t('gpu.servers.default')}</Text>
                                        {s.image && <Text size="xs" c="dimmed" ff="monospace">{s.image.split('/').pop()}</Text>}
                                    </Table.Td>
                                    <Table.Td>
                                        <Badge variant="light" color={usesGpu(s.profile) ? 'grape' : 'gray'} style={{ textTransform: 'none' }}>
                                            {profileLabel(s.profile, t)}
                                        </Badge>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm">{s.ready ? t('gpu.servers.ready') : s.pending === 'stop' ? t('gpu.servers.stopping') : t('gpu.servers.starting')}</Text>
                                    </Table.Td>
                                    <Table.Td align="right">
                                        <Group gap={4} justify="flex-end" wrap="nowrap">
                                            <Button size="xs" variant="light" component="a" href={s.url} target="_blank" rel="noreferrer"
                                                rightSection={<ExternalLink size={14} />} disabled={!s.ready}>
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
