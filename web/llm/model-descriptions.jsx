import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Autocomplete, Badge, Button, Group, Modal, Paper, SegmentedControl, SimpleGrid, Stack, Table, Tabs, Text, TextInput, Textarea, Title, Typography } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { firstParagraph, markdownToHtml } from '/helper/markdown.js';
import { Loading, LoadError } from '/helper/query-state.jsx';
import { useLlmApi } from '/llm/api-llm.jsx';
import { llmKeys } from '/llm/query-keys.js';

// For admins: the descriptions of the served models (llm-management-api /v1/models/descriptions), one per model name as the deployments serve it, GPU catalogue and Mac fleet alike. Everybody who can use a model sees its description under Available models. A served model without one is listed so it stands out.

const EMPTY = { model: '', summary: '', description: '', source_url: '', license: '', parameters: '', quantisation: '', tool_calls: null, reasoning: null };

// A fact that may be unknown: yes, no or unknown (null).
function TriState({ label, value, onChange }) {
    const { t } = useTranslation();
    const v = value === true ? 'yes' : value === false ? 'no' : 'unknown';
    return (
        <Stack gap={2}>
            <Text size="sm" fw={500}>{label}</Text>
            <SegmentedControl size="xs" value={v} onChange={(x) => onChange(x === 'yes' ? true : x === 'no' ? false : null)}
                data={[{ value: 'yes', label: t('llm.available.yes') }, { value: 'no', label: t('llm.available.no') }, { value: 'unknown', label: t('llm.available.unknown') }]} />
        </Stack>
    );
}

function DescriptionForm({ initial, served, onSave, onClose, saving, error }) {
    const { t } = useTranslation();
    const editing = !!initial.updated_at;
    const [d, setD] = useState({ ...EMPTY, ...initial });
    const set = (k) => (e) => setD({ ...d, [k]: e?.currentTarget ? e.currentTarget.value : e });
    const preview = markdownToHtml(d.description);
    return (
        <Modal opened onClose={onClose} size="xl" title={editing ? t('llm.descriptions.edit', { model: initial.model }) : t('llm.descriptions.add')}>
            <Stack gap="sm">
                {error && <Alert color="red" variant="light">{error}</Alert>}
                <Autocomplete label={t('llm.descriptions.model')} description={t('llm.descriptions.modelHint')} value={d.model} disabled={editing} data={served} onChange={set('model')} />
                <TextInput label={t('llm.descriptions.summary')} description={t('llm.descriptions.summaryHint')} maxLength={300} value={d.summary} onChange={set('summary')} />
                <Tabs defaultValue="write">
                    <Tabs.List>
                        <Tabs.Tab value="write">{t('llm.descriptions.write')}</Tabs.Tab>
                        <Tabs.Tab value="preview">{t('llm.descriptions.preview')}</Tabs.Tab>
                    </Tabs.List>
                    <Tabs.Panel value="write" pt="xs">
                        <Textarea aria-label={t('llm.descriptions.text')} description={t('llm.descriptions.textHint')} autosize minRows={6} maxRows={18} ff="monospace" value={d.description} onChange={set('description')} />
                    </Tabs.Panel>
                    <Tabs.Panel value="preview" pt="xs">
                        {preview ? <Typography><div dangerouslySetInnerHTML={{ __html: preview }} /></Typography> : <Text size="sm" c="dimmed">{t('llm.descriptions.empty')}</Text>}
                    </Tabs.Panel>
                </Tabs>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                    <TextInput label={t('llm.descriptions.source')} placeholder="https://huggingface.co/…" value={d.source_url} onChange={set('source_url')} />
                    <TextInput label={t('llm.available.facts.license')} placeholder="Apache-2.0" value={d.license} onChange={set('license')} />
                    <TextInput label={t('llm.available.facts.parameters')} placeholder="35B (3B aktiv)" value={d.parameters} onChange={set('parameters')} />
                    <TextInput label={t('llm.available.facts.quantisation')} placeholder="FP8, NVFP4, IQ3_S" value={d.quantisation} onChange={set('quantisation')} />
                    <TriState label={t('llm.available.facts.toolCalls')} value={d.tool_calls} onChange={set('tool_calls')} />
                    <TriState label={t('llm.available.facts.reasoning')} value={d.reasoning} onChange={set('reasoning')} />
                </SimpleGrid>
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>{t('llm.models.cancel')}</Button>
                    <Button loading={saving} disabled={!d.model.trim()} onClick={() => onSave({ ...EMPTY, ...d })}>{t('llm.models.save')}</Button>
                </Group>
            </Stack>
        </Modal>
    );
}

export function ModelDescriptionsAdmin() {
    const { t } = useTranslation();
    const api = useLlmApi();
    const qc = useQueryClient();
    const query = useQuery({ queryKey: llmKeys.descriptions(), queryFn: api.getModelDescriptions });
    const [editing, setEditing] = useState(null);
    const [error, setError] = useState('');
    const done = (data) => {
        setError(''); setEditing(null);
        qc.setQueryData(llmKeys.descriptions(), data);
        // The person's view carries the descriptions too.
        qc.invalidateQueries({ queryKey: llmKeys.usable() });
    };
    const fail = (e) => setError(e?.message || String(e));
    const save = useMutation({ mutationFn: (d) => api.saveModelDescription(d), onSuccess: done, onError: fail });
    const remove = useMutation({ mutationFn: (model) => api.deleteModelDescription(model), onSuccess: done, onError: fail });

    let body;
    if (query.isPending) body = <Loading />;
    else if (query.isError) body = <LoadError query={query} />;
    else {
        const descriptions = query.data?.descriptions ?? [];
        const served = query.data?.served ?? [];
        const described = new Set(descriptions.map(d => d.model));
        const rows = [...descriptions.map(d => ({ model: d.model, d })), ...served.filter(m => !described.has(m)).map(m => ({ model: m, d: null }))]
            .sort((a, b) => a.model.localeCompare(b.model));
        body = (
            <Table verticalSpacing="xs">
                <Table.Thead><Table.Tr>
                    <Table.Th>{t('llm.descriptions.model')}</Table.Th><Table.Th>{t('llm.descriptions.summary')}</Table.Th><Table.Th>{t('llm.descriptions.state')}</Table.Th><Table.Th />
                </Table.Tr></Table.Thead>
                <Table.Tbody>
                    {rows.map(({ model, d }) => (
                        <Table.Tr key={model}>
                            <Table.Td><Text size="sm" ff="monospace">{model}</Text></Table.Td>
                            <Table.Td><Text size="sm" lineClamp={2}>{d ? (d.summary || firstParagraph(d.description) || '–') : '–'}</Text></Table.Td>
                            <Table.Td>
                                <Group gap={4}>
                                    {!d && <Badge size="sm" variant="light" color="orange" tt="none">{t('llm.descriptions.missing')}</Badge>}
                                    {d && !served.includes(model) && <Badge size="sm" variant="light" color="gray" tt="none">{t('llm.descriptions.notServed')}</Badge>}
                                    {d && served.includes(model) && <Badge size="sm" variant="light" color="teal" tt="none">{t('llm.descriptions.described')}</Badge>}
                                </Group>
                            </Table.Td>
                            <Table.Td align="right">
                                <Group gap={4} justify="flex-end" wrap="nowrap">
                                    <Button size="xs" variant="subtle" onClick={() => { setError(''); setEditing(d ?? { ...EMPTY, model }); }}>{t(d ? 'llm.models.change' : 'llm.descriptions.write')}</Button>
                                    {d && (
                                        <Button size="xs" variant="subtle" color="red" loading={remove.isPending && remove.variables === model}
                                            onClick={() => remove.mutate(model)}>{t('llm.models.delete')}</Button>
                                    )}
                                </Group>
                            </Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
        );
    }

    return (
        <Paper withBorder radius="md" p="md">
            <Stack gap="xs">
                <Group justify="space-between">
                    <Title order={4}>{t('llm.descriptions.title')}</Title>
                    <Button size="xs" variant="light" onClick={() => { setError(''); setEditing(EMPTY); }}>{t('llm.descriptions.add')}</Button>
                </Group>
                <Text size="xs" c="dimmed">{t('llm.descriptions.intro')}</Text>
                {error && !editing && <Alert color="red" variant="light" withCloseButton onClose={() => setError('')}>{error}</Alert>}
                {body}
            </Stack>
            {editing && <DescriptionForm initial={editing} served={query.data?.served ?? []} saving={save.isPending} error={error} onClose={() => setEditing(null)} onSave={(d) => save.mutate(d)} />}
        </Paper>
    );
}
