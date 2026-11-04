import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Code, Container, Group, Modal, NumberInput, Paper, Select, SimpleGrid, Stack, Table, Text, TextInput, Textarea, Title, Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Loading, LoadError } from '/helper/query-state.jsx';
import { useLlmApi } from '/llm/api-llm.jsx';
import { llmKeys } from '/llm/query-keys.js';

// For admins: the models the platform runs itself on its GPUs (llm-management-api, /v1/inference; docs/bauplan.md 10.16). The inference gap fillers of the GPU nodes run them: each tier's default, or the model chosen at a node (Workspaces → GPUs), with vLLM or, for large MoE models on little GPU memory (the GB10), Strata. The state comes from the replicas' pods, so arguments that do not fit the GPU (context length, memory share) show up here as restarts.

const EMPTY = { key: '', engine: 'vllm', model: '', args: [], cpu: '', memory_request: '', memory_limit: '', min_gb: 0, category: 'general' };

export const MODEL_ENGINES = ['vllm', 'strata'];

export const MODEL_CATEGORIES = ['chat', 'code', 'fast', 'general'];
const CATEGORY_COLOR = { chat: 'blue', code: 'grape', fast: 'teal', general: 'gray' };

// The category of a model: the measured one (alias classification, once the model ran) before the stated one.
export function CategoryBadge({ stated, measured, reason }) {
    const { t } = useTranslation();
    const cat = measured || stated;
    if (!cat) return null;
    const label = t(`llm.models.categories.${cat}`);
    return (
        <Tooltip label={measured ? `${t('llm.models.measured')}${reason ? `: ${reason}` : ''}` : t('llm.models.stated')} openDelay={300}>
            <Badge size="sm" variant={measured ? 'filled' : 'light'} color={CATEGORY_COLOR[cat] || 'gray'}>{label}</Badge>
        </Tooltip>
    );
}

function ModelState({ state }) {
    const { t } = useTranslation();
    if (!state?.replicas) return <Text size="xs" c="dimmed">{t('llm.models.unused')}</Text>;
    return (
        <Group gap={4} wrap="wrap">
            {state.ready > 0 && <Badge color="teal" variant="light">{t('llm.models.ready', { count: state.ready })}</Badge>}
            {state.starting > 0 && <Badge color="blue" variant="light">{t('llm.models.starting', { count: state.starting })}</Badge>}
            {state.waiting > 0 && <Badge color="gray" variant="light">{t('llm.models.waiting', { count: state.waiting })}</Badge>}
            {state.restarts > 0 && <Badge color={state.problem ? 'red' : 'orange'} variant="light" tt="none">{t('llm.models.restarts', { count: state.restarts })}{state.problem ? ` · ${state.problem}` : ''}</Badge>}
        </Group>
    );
}

function ModelForm({ initial, onSave, onClose, saving, error }) {
    const { t } = useTranslation();
    const editing = !!initial.key;
    const [m, setM] = useState({ ...EMPTY, ...initial });
    const [args, setArgs] = useState((initial.args || []).join(' '));
    const set = (k) => (v) => setM({ ...m, [k]: v?.currentTarget ? v.currentTarget.value : v });
    // The labels of the model and its arguments follow the engine (Strata: the served name and its settings).
    const strata = m.engine === 'strata';
    return (
        <Modal opened onClose={onClose} title={editing ? t('llm.models.edit', { key: initial.key }) : t('llm.models.add')} size="lg">
            <Stack gap="sm">
                {error && <Alert color="red" variant="light">{error}</Alert>}
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                    <TextInput label={t('llm.models.key')} description={t('llm.models.keyHint')} value={m.key} disabled={editing} onChange={e => setM({ ...m, key: e.currentTarget.value.toLowerCase() })} />
                    <Select label={t('llm.models.engine')} description={t('llm.models.engineHint')} allowDeselect={false} value={m.engine || 'vllm'}
                        data={MODEL_ENGINES.map(e => ({ value: e, label: t(`llm.models.engines.${e}`) }))} onChange={v => setM({ ...m, engine: v })} />
                    <TextInput label={t(strata ? 'llm.models.repoStrata' : 'llm.models.repo')} description={t(strata ? 'llm.models.repoHintStrata' : 'llm.models.repoHint')} value={m.model} onChange={set('model')} />
                    <Select label={t('llm.models.category')} description={t('llm.models.categoryHint')} allowDeselect={false} value={m.category || 'general'}
                        data={MODEL_CATEGORIES.map(c => ({ value: c, label: t(`llm.models.categories.${c}`) }))} onChange={v => setM({ ...m, category: v })} />
                </SimpleGrid>
                <Textarea label={t(strata ? 'llm.models.argsStrata' : 'llm.models.args')} description={t(strata ? 'llm.models.argsHintStrata' : 'llm.models.argsHint')} autosize minRows={2} ff="monospace" value={args} onChange={e => setArgs(e.currentTarget.value)} />
                <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
                    <NumberInput label={t('llm.models.minGb')} min={0} decimalScale={1} value={m.min_gb} onChange={v => setM({ ...m, min_gb: Number(v) || 0 })} />
                    <TextInput label={t('llm.models.cpu')} placeholder="1" value={m.cpu} onChange={set('cpu')} />
                    <TextInput label={t('llm.models.memRequest')} placeholder="3Gi" value={m.memory_request} onChange={set('memory_request')} />
                    <TextInput label={t('llm.models.memLimit')} placeholder="5Gi" value={m.memory_limit} onChange={set('memory_limit')} />
                </SimpleGrid>
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>{t('llm.models.cancel')}</Button>
                    <Button loading={saving} disabled={!m.key || !m.model}
                        onClick={() => onSave({ ...m, args: args.split(/\s+/).filter(Boolean) })}>{t('llm.models.save')}</Button>
                </Group>
            </Stack>
        </Modal>
    );
}

export function LlmModels() {
    const { t } = useTranslation();
    const api = useLlmApi();
    const qc = useQueryClient();
    const query = useQuery({ queryKey: llmKeys.models(), queryFn: api.getModels, refetchInterval: 15000 });
    const [editing, setEditing] = useState(null);
    const [error, setError] = useState('');
    const done = (data) => { setError(''); setEditing(null); qc.setQueryData(llmKeys.models(), data); };
    const fail = (e) => setError(e?.message || String(e));
    const save = useMutation({ mutationFn: (m) => api.saveModel(m), onSuccess: done, onError: fail });
    const remove = useMutation({ mutationFn: (key) => api.deleteModel(key), onSuccess: done, onError: fail });
    const tier = useMutation({ mutationFn: ({ tier: tr, model }) => api.setTierModel(tr, model), onSuccess: done, onError: fail });

    if (query.isPending) return <Container size="lg" py="md"><Loading /></Container>;
    if (query.isError) return <Container size="lg" py="md"><LoadError query={query} /></Container>;
    const { models = [], tier_models: tierModels = {}, tiers = [], states = {}, enabled } = query.data ?? {};
    const used = new Set(Object.values(tierModels));

    return (
        <Container size="lg" py="md">
            <Stack gap="md">
                <div>
                    <Title order={2}>{t('llm.models.title')}</Title>
                    <Text size="sm" c="dimmed">{t('llm.models.intro')}</Text>
                </div>
                {!enabled && <Alert color="gray" variant="light">{t('llm.models.disabled')}</Alert>}
                {error && !editing && <Alert color="red" variant="light" withCloseButton onClose={() => setError('')}>{error}</Alert>}

                <Paper withBorder radius="md" p="md">
                    <Stack gap="xs">
                        <Title order={4}>{t('llm.models.tierDefaults')}</Title>
                        <Text size="xs" c="dimmed">{t('llm.models.tierDefaultsHint')}</Text>
                        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
                            {tiers.map(tr => (
                                <Select key={tr.id} label={tr.name} allowDeselect={false} disabled={!enabled} value={tierModels[tr.id] ?? ''}
                                    data={[{ value: '', label: t('llm.models.none') }, ...models.map(m => ({ value: m.key, label: `${m.key} · ${t(`llm.models.categories.${states[m.key]?.category || m.category || 'general'}`)}` }))]}
                                    onChange={v => tier.mutate({ tier: tr.id, model: v ?? '' })} />
                            ))}
                        </SimpleGrid>
                    </Stack>
                </Paper>

                <Paper withBorder radius="md" p="md">
                    <Stack gap="xs">
                        <Group justify="space-between">
                            <Title order={4}>{t('llm.models.catalogue')}</Title>
                            <Button size="xs" variant="light" disabled={!enabled} onClick={() => { setError(''); setEditing(EMPTY); }}>{t('llm.models.add')}</Button>
                        </Group>
                        <Table verticalSpacing="xs">
                            <Table.Thead><Table.Tr>
                                <Table.Th>{t('llm.models.model')}</Table.Th><Table.Th>{t('llm.models.needs')}</Table.Th><Table.Th>{t('llm.models.state')}</Table.Th><Table.Th />
                            </Table.Tr></Table.Thead>
                            <Table.Tbody>
                                {models.map(m => (
                                    <Table.Tr key={m.key}>
                                        <Table.Td>
                                            <Group gap={6}>
                                                <Badge variant="light" color="gray" tt="none">{m.key}</Badge>
                                                <CategoryBadge stated={m.category} measured={states[m.key]?.category} reason={states[m.key]?.reason} />
                                                <Text size="sm">{m.model}</Text>
                                                {m.engine === 'strata' && <Badge size="sm" variant="outline" color="violet">{t('llm.models.engines.strata')}</Badge>}
                                            </Group>
                                            {m.args?.length > 0 && <Code fz="xs" mt={4} block style={{ whiteSpace: 'pre-wrap' }}>{m.args.join(' ')}</Code>}
                                        </Table.Td>
                                        <Table.Td>
                                            <Text size="xs">{t('llm.models.gpuMemory', { gb: m.min_gb || 0 })}</Text>
                                            <Text size="xs" c="dimmed">{t('llm.models.resources', { cpu: m.cpu || '1', req: m.memory_request || '3Gi', lim: m.memory_limit || '5Gi' })}</Text>
                                        </Table.Td>
                                        <Table.Td><ModelState state={states[m.key]} /></Table.Td>
                                        <Table.Td align="right">
                                            <Group gap={4} justify="flex-end" wrap="nowrap">
                                                <Button size="xs" variant="subtle" disabled={!enabled} onClick={() => { setError(''); setEditing(m); }}>{t('llm.models.change')}</Button>
                                                {!used.has(m.key) && (
                                                    <Button size="xs" variant="subtle" color="red" disabled={!enabled} loading={remove.isPending && remove.variables === m.key}
                                                        onClick={() => remove.mutate(m.key)}>{t('llm.models.delete')}</Button>
                                                )}
                                            </Group>
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Stack>
                </Paper>
            </Stack>
            {editing && <ModelForm initial={editing} saving={save.isPending} error={error} onClose={() => setEditing(null)} onSave={(m) => save.mutate(m)} />}
        </Container>
    );
}
