import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import { Alert, Anchor, Badge, Button, Container, Group, Loader, Modal, Paper, Stack, Table, Text, TextInput, Title, Tooltip } from '@mantine/core';
import { Cpu, ExternalLink, FileText, Play, Plus, RotateCcw, Trash2, Zap } from 'lucide-react';
import { formatDateTime } from '/format-date.js';
import { CodeBlock } from '/helper/codeblock.jsx';
import { LoadError, Loading, useApiMutation } from '/helper/query-state.jsx';
import { useConfirm } from '/providers/confirm.jsx';
import { useLlmMe } from '/llm/use-llm-me.jsx';
import { useGpuApi } from '/gpu/api-gpu.jsx';
import { gpuKeys } from '/gpu/query-keys.js';

const STATUS_COLOUR = { building: 'yellow', ready: 'green', failed: 'red' };
const URL_OK = /^https:\/\/\S+\/\S+\/\S+$/;

export function GpuEnvironments() {
    const { t } = useTranslation();
    const api = useGpuApi();
    const confirm = useConfirm();
    const { me } = useLlmMe();
    const [gitUrl, setGitUrl] = useState('');
    const [ref, setRef] = useState('');
    const [name, setName] = useState('');
    const [logOf, setLogOf] = useState(null);
    const [started, setStarted] = useState(null);

    // While something builds, ask again every 5 s; otherwise the list only changes through this page.
    const envs = useQuery({
        queryKey: gpuKeys.environments(),
        queryFn: () => api.listEnvironments(),
        refetchInterval: (q) => ((q.state.data ?? []).some(e => e.status === 'building') ? 5000 : false),
    });

    const create = useApiMutation({
        mutationFn: () => api.createEnvironment({ git_url: gitUrl.trim(), ref: ref.trim(), name: name.trim() }),
        invalidates: [gpuKeys.environments()],
        reportErrors: 'inline',
        onSuccess: () => { setGitUrl(''); setRef(''); setName(''); },
    });
    const remove = useApiMutation({ mutationFn: (id) => api.deleteEnvironment(id), invalidates: [gpuKeys.environments()] });
    const rebuild = useApiMutation({ mutationFn: (id) => api.rebuildEnvironment(id), invalidates: [gpuKeys.environments()] });
    const start = useApiMutation({
        mutationFn: ({ id, gpu }) => api.startEnvironment(id, gpu),
        invalidates: [gpuKeys.servers()],
        onSuccess: (res, vars) => setStarted({ ...res, gpu: vars.gpu }),
    });

    async function onDelete(e) {
        const ok = await confirm({
            title: t('gpu.envs.deleteTitle'),
            confirmLabel: t('gpu.envs.deleteConfirm'),
            message: t('gpu.envs.deleteMessage', { name: e.name }),
        });
        if (ok) remove.mutate(e.id);
    }

    if (envs.isPending) return <Container size="lg" py="md"><Loading /></Container>;
    if (envs.isError) return <Container size="lg" py="md"><LoadError query={envs} /></Container>;

    const list = envs.data ?? [];
    return (
        <Container size="lg" py="md">
            <Stack gap="lg">
                <Paper p="lg" radius="md" withBorder>
                    <Group justify="space-between" align="flex-start" wrap="wrap">
                        <div style={{ maxWidth: 640 }}>
                            <Title order={3}>{t('gpu.envs.title')}</Title>
                            <Text size="sm" c="dimmed" mt={4}>{t('gpu.envs.intro')}</Text>
                        </div>
                        {me?.jupyter_url && (
                            <Button component="a" href={me.jupyter_url} target="_blank" rel="noreferrer" variant="light" rightSection={<ExternalLink size={14} />}>
                                {t('gpu.envs.openHub')}
                            </Button>
                        )}
                    </Group>

                    <Group align="flex-end" mt="md" gap="xs" wrap="wrap">
                        <TextInput label={t('gpu.envs.gitUrl')} placeholder={t('gpu.envs.gitUrlPlaceholder')} w={360}
                            value={gitUrl} onChange={e => setGitUrl(e.currentTarget.value)} />
                        <TextInput label={t('gpu.envs.ref')} placeholder={t('gpu.envs.refPlaceholder')} w={150}
                            value={ref} onChange={e => setRef(e.currentTarget.value)} />
                        <TextInput label={t('gpu.envs.name')} placeholder={t('gpu.envs.namePlaceholder')} w={200} maxLength={60}
                            value={name} onChange={e => setName(e.currentTarget.value)} />
                        <Button leftSection={<Plus size={16} />} loading={create.isPending}
                            disabled={!URL_OK.test(gitUrl.trim())} onClick={() => create.mutate()}>
                            {t('gpu.envs.add')}
                        </Button>
                    </Group>
                    <Text size="xs" c="dimmed" mt={6}>{t('gpu.envs.addHint')}</Text>
                    {create.error && <Alert color="red" variant="light" mt="sm">{create.error.message}</Alert>}

                    <Table striped highlightOnHover mt="md">
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>{t('gpu.envs.name')}</Table.Th>
                                <Table.Th>{t('gpu.envs.version')}</Table.Th>
                                <Table.Th>{t('gpu.envs.status')}</Table.Th>
                                <Table.Th />
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {list.length === 0 && (
                                <Table.Tr><Table.Td colSpan={4}><Text size="sm" c="dimmed">{t('gpu.envs.none')}</Text></Table.Td></Table.Tr>
                            )}
                            {list.map(e => (
                                <Table.Tr key={e.id}>
                                    <Table.Td>
                                        <Text size="sm" fw={500}>{e.name}</Text>
                                        <Anchor size="xs" href={e.git_url} target="_blank" rel="noreferrer">{e.git_url.replace(/^https:\/\//, '')}</Anchor>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm">{e.branch || '—'}</Text>
                                        <Text size="xs" c="dimmed" ff="monospace">{(e.commit || '').slice(0, 12)}</Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Group gap={6} wrap="nowrap">
                                            {e.status === 'building' && <Loader size={12} />}
                                            <Badge variant="light" color={STATUS_COLOUR[e.status] ?? 'gray'} style={{ textTransform: 'none' }}>
                                                {t(`gpu.envs.statuses.${e.status}`, { defaultValue: e.status })}
                                            </Badge>
                                        </Group>
                                        {e.message && <Text size="xs" c="dimmed">{e.message}</Text>}
                                        <Text size="xs" c="dimmed">{formatDateTime(e.updated_at)}</Text>
                                    </Table.Td>
                                    <Table.Td align="right">
                                        <Group gap={4} justify="flex-end" wrap="nowrap">
                                            <Tooltip label={t('gpu.envs.startCpuHint')}>
                                                <Button size="xs" variant="light" leftSection={<Cpu size={14} />} disabled={e.status !== 'ready'}
                                                    loading={start.isPending && start.variables?.id === e.id && !start.variables?.gpu}
                                                    onClick={() => start.mutate({ id: e.id, gpu: false })}>{t('gpu.envs.startCpu')}</Button>
                                            </Tooltip>
                                            <Tooltip label={t('gpu.envs.startGpuHint')}>
                                                <Button size="xs" variant="light" color="grape" leftSection={<Zap size={14} />} disabled={e.status !== 'ready'}
                                                    loading={start.isPending && start.variables?.id === e.id && start.variables?.gpu}
                                                    onClick={() => start.mutate({ id: e.id, gpu: true })}>{t('gpu.envs.startGpu')}</Button>
                                            </Tooltip>
                                            <Button size="xs" variant="subtle" leftSection={<FileText size={14} />} onClick={() => setLogOf(e)}>
                                                {t('gpu.envs.log')}
                                            </Button>
                                            {e.status === 'failed' && (
                                                <Button size="xs" variant="subtle" leftSection={<RotateCcw size={14} />}
                                                    loading={rebuild.isPending && rebuild.variables === e.id} onClick={() => rebuild.mutate(e.id)}>
                                                    {t('gpu.envs.rebuild')}
                                                </Button>
                                            )}
                                            <Button size="xs" variant="subtle" color="red" leftSection={<Trash2 size={14} />}
                                                loading={remove.isPending && remove.variables === e.id} onClick={() => onDelete(e)}>
                                                {t('gpu.envs.delete')}
                                            </Button>
                                        </Group>
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                    {start.error && <Alert color="orange" variant="light" mt="sm" title={t('gpu.envs.startFailed')}>{start.error.message}</Alert>}
                </Paper>
            </Stack>

            {logOf && <BuildLog env={logOf} onClose={() => setLogOf(null)} />}

            <Modal opened={!!started} onClose={() => setStarted(null)} title={t('gpu.envs.startedTitle')} centered>
                <Stack gap="sm">
                    <Text size="sm">{t(started?.gpu ? 'gpu.envs.startedGpu' : 'gpu.envs.startedCpu')}</Text>
                    <Text size="sm"><Trans i18nKey="gpu.envs.startedHome" components={{ 1: <code /> }} /></Text>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setStarted(null)}>{t('gpu.envs.close')}</Button>
                        <Button component="a" href={started?.url} target="_blank" rel="noreferrer" leftSection={<Play size={14} />} onClick={() => setStarted(null)}>
                            {t('gpu.envs.open')}
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Container>
    );
}

function BuildLog({ env, onClose }) {
    const { t } = useTranslation();
    const api = useGpuApi();
    const log = useQuery({
        queryKey: gpuKeys.log(env.id),
        queryFn: () => api.environmentLog(env.id),
        refetchInterval: env.status === 'building' ? 5000 : false,
        retry: false,
    });
    return (
        <Modal opened onClose={onClose} title={t('gpu.envs.logTitle', { name: env.name })} size={1000} centered>
            {log.isPending && <Loading />}
            {log.isError && <Text size="sm" c="dimmed">{t('gpu.envs.logNone')}</Text>}
            {log.isSuccess && <CodeBlock language="plaintext" code={log.data || t('gpu.envs.logEmpty')} />}
        </Modal>
    );
}
