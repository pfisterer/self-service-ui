import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Alert, Anchor, Badge, Code, Container, Group, Modal, Paper, SimpleGrid, Stack, Table, Text, Title, Typography } from '@mantine/core';
import { CodeBlock } from '/helper/codeblock.jsx';
import { ExternalLink } from '/helper/external-link.jsx';
import { markdownToHtml } from '/helper/markdown.js';
import { Loading, LoadError } from '/helper/query-state.jsx';
import { useLlmApi } from '/llm/api-llm.jsx';
import { useLlmMe } from '/llm/use-llm-me.jsx';
import { llmKeys } from '/llm/query-keys.js';
import { contextLabel, curlExample, healthState, summaryOf } from '/llm/usable-models.js';

// The model names the person can use (llm-management-api getUsableModels): the base aliases and what their projects were granted, each with a short description, its context, how it is doing and the projects it comes through. A row opens the details: the description of each model behind it, origin, licence, facts, the configuration per device class and an example call. Never a machine or site: the service names only device classes.

const HEALTH_COLOR = { ok: 'teal', partial: 'yellow', down: 'red', none: 'gray', unknown: 'gray' };

function HealthBadge({ entry, healthKnown }) {
    const { t } = useTranslation();
    const state = healthState(entry, healthKnown);
    return (
        <Badge size="sm" variant="light" color={HEALTH_COLOR[state]} tt="none" style={{ overflow: 'visible' }} styles={{ label: { overflow: 'visible' } }}>
            {t(`llm.available.health.${state}`, { healthy: entry.healthy, count: entry.deployments })}
        </Badge>
    );
}

function KindBadge({ kind }) {
    const { t } = useTranslation();
    return <Badge size="sm" variant="outline" color={kind === 'model' ? 'grape' : 'blue'} tt="none" style={{ overflow: 'visible' }} styles={{ label: { overflow: 'visible' } }}>{t(`llm.available.kinds.${kind === 'model' ? 'model' : 'alias'}`)}</Badge>;
}

function ProjectsText({ entry }) {
    const { t } = useTranslation();
    if (entry.base) return <Text size="sm" c="dimmed">{t('llm.available.allProjects')}</Text>;
    return <Text size="sm">{(entry.projects ?? []).map(p => p.name || p.slug).join(', ')}</Text>;
}

// yes, no or unknown for a fact that may be null.
function flag(t, v) {
    if (v === true) return t('llm.available.yes');
    if (v === false) return t('llm.available.no');
    return t('llm.available.unknown');
}

function Fact({ label, children }) {
    return (
        <div>
            <Text size="xs" c="dimmed">{label}</Text>
            <Text size="sm">{children}</Text>
        </div>
    );
}

// One model behind the name: its description and facts, and per device class how it runs.
function ModelDetails({ model, healthKnown }) {
    const { t } = useTranslation();
    const d = model.description;
    const html = markdownToHtml(d?.description);
    return (
        <Paper withBorder radius="md" p="sm">
            <Stack gap="xs">
                <Group gap="xs">
                    <Code>{model.model}</Code>
                    {d?.summary && <Text size="sm" c="dimmed">{d.summary}</Text>}
                </Group>
                {!d && <Text size="sm" c="dimmed">{t('llm.available.noDescription')}</Text>}
                {html && (
                    <Typography>
                        {/* Sanitised by markdownToHtml (DOMPurify). */}
                        <div data-testid="model-description" dangerouslySetInnerHTML={{ __html: html }} />
                    </Typography>
                )}
                {d && (
                    <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="xs" verticalSpacing="xs">
                        <Fact label={t('llm.available.facts.source')}>
                            {d.source_url ? <ExternalLink href={d.source_url}>{t('llm.available.facts.sourceLink')}</ExternalLink> : '–'}
                        </Fact>
                        <Fact label={t('llm.available.facts.license')}>{d.license || '–'}</Fact>
                        <Fact label={t('llm.available.facts.parameters')}>{d.parameters || '–'}</Fact>
                        <Fact label={t('llm.available.facts.quantisation')}>{d.quantisation || '–'}</Fact>
                        <Fact label={t('llm.available.facts.toolCalls')}>{flag(t, d.tool_calls)}</Fact>
                        <Fact label={t('llm.available.facts.reasoning')}>{flag(t, d.reasoning)}</Fact>
                    </SimpleGrid>
                )}
                {model.devices?.length > 0 && (
                    <Table verticalSpacing={4} fz="sm">
                        <Table.Thead><Table.Tr>
                            <Table.Th>{t('llm.available.device')}</Table.Th>
                            <Table.Th>{t('llm.available.engine')}</Table.Th>
                            <Table.Th>{t('llm.available.context')}</Table.Th>
                            <Table.Th>{t('llm.available.deployments')}</Table.Th>
                        </Table.Tr></Table.Thead>
                        <Table.Tbody>
                            {model.devices.map(dc => (
                                <Table.Tr key={`${dc.device}|${dc.engine}`}>
                                    <Table.Td>{t(`llm.available.devices.${dc.device}`, { defaultValue: dc.device })}</Table.Td>
                                    <Table.Td>{dc.engine ? t(`llm.available.engines.${dc.engine}`, { defaultValue: dc.engine }) : '–'}</Table.Td>
                                    <Table.Td>{contextLabel(dc.limits) || '–'}</Table.Td>
                                    <Table.Td>{healthKnown ? t('llm.available.deployed', { healthy: dc.healthy, count: dc.deployments }) : t('llm.available.deployedNoHealth', { count: dc.deployments })}</Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                )}
            </Stack>
        </Paper>
    );
}

export function UsableNameModal({ entry, healthKnown, apiUrl, onClose }) {
    const { t } = useTranslation();
    const context = contextLabel(entry.limits);
    return (
        <Modal opened onClose={onClose} size="xl" title={<Group gap="xs"><Code fz="md">{entry.name}</Code><KindBadge kind={entry.kind} /></Group>}>
            <Stack gap="sm">
                <Text size="sm" c="dimmed">{t(entry.kind === 'model' ? 'llm.available.kindHintModel' : 'llm.available.kindHintAlias')}</Text>
                <Group gap="xl" align="flex-start">
                    <Fact label={t('llm.available.project')}>{entry.base ? t('llm.available.allProjects') : (entry.projects ?? []).map(p => p.name || p.slug).join(', ')}</Fact>
                    <Fact label={t('llm.available.context')}>{context || '–'}</Fact>
                    <div>
                        <Text size="xs" c="dimmed">{t('llm.available.state')}</Text>
                        <HealthBadge entry={entry} healthKnown={healthKnown} />
                    </div>
                </Group>
                {entry.kind !== 'model' && entry.models?.length > 1 && <Text size="sm">{t('llm.available.severalModels', { count: entry.models.length })}</Text>}
                {(entry.models ?? []).length === 0 && <Alert color="gray" variant="light">{t('llm.available.noModels')}</Alert>}
                {(entry.models ?? []).map(m => <ModelDetails key={m.model} model={m} healthKnown={healthKnown} />)}
                <div>
                    <Text size="sm" fw={500} mb={4}>{t('llm.available.example')}</Text>
                    <CodeBlock code={curlExample(apiUrl, entry.name)} language="bash" />
                </div>
            </Stack>
        </Modal>
    );
}

export function LlmAvailableModels() {
    const { t } = useTranslation();
    const api = useLlmApi();
    const { me } = useLlmMe();
    // The server keeps the model list for a minute.
    const query = useQuery({ queryKey: llmKeys.usable(), queryFn: () => api.getUsableModels(), refetchInterval: 60_000 });
    const [open, setOpen] = useState(null);

    if (query.isPending) return <Container size="lg" py="md"><Loading /></Container>;
    if (query.isError) return <Container size="lg" py="md"><LoadError query={query} /></Container>;
    const names = query.data?.names ?? [];
    const healthKnown = !!query.data?.health_known;
    const selected = names.find(n => n.name === open);

    return (
        <Container size="lg" py="md">
            <Stack gap="md">
                <div>
                    <Title order={2}>{t('llm.available.title')}</Title>
                    <Text size="sm" c="dimmed" maw={780}>{t('llm.available.intro')}</Text>
                </div>
                <Alert color="blue" variant="light">{t('llm.available.stability')}</Alert>
                <Paper withBorder radius="md" p="md">
                    <Table.ScrollContainer minWidth={720}>
                        <Table verticalSpacing="xs" highlightOnHover>
                            <Table.Thead><Table.Tr>
                                <Table.Th>{t('llm.available.name')}</Table.Th>
                                <Table.Th>{t('llm.available.kind')}</Table.Th>
                                <Table.Th>{t('llm.available.description')}</Table.Th>
                                <Table.Th>{t('llm.available.context')}</Table.Th>
                                <Table.Th>{t('llm.available.state')}</Table.Th>
                                <Table.Th>{t('llm.available.project')}</Table.Th>
                            </Table.Tr></Table.Thead>
                            <Table.Tbody>
                                {names.map(n => (
                                    <Table.Tr key={n.name} style={{ cursor: 'pointer' }} onClick={() => setOpen(n.name)}>
                                        <Table.Td>
                                            <Anchor component="button" type="button" ff="monospace" fz="sm" ta="left" style={{ wordBreak: 'break-all' }} onClick={(e) => { e.stopPropagation(); setOpen(n.name); }}>{n.name}</Anchor>
                                        </Table.Td>
                                        <Table.Td style={{ whiteSpace: 'nowrap' }}><KindBadge kind={n.kind} /></Table.Td>
                                        <Table.Td><Text size="sm" lineClamp={2} c={summaryOf(n) ? undefined : 'dimmed'}>{summaryOf(n) || t('llm.available.noSummary')}</Text></Table.Td>
                                        <Table.Td><Text size="sm" style={{ whiteSpace: 'nowrap' }}>{contextLabel(n.limits) || '–'}</Text></Table.Td>
                                        <Table.Td style={{ whiteSpace: 'nowrap' }}><HealthBadge entry={n} healthKnown={healthKnown} /></Table.Td>
                                        <Table.Td style={{ whiteSpace: 'nowrap' }}><ProjectsText entry={n} /></Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                    <Text size="xs" c="dimmed" mt="xs">{t('llm.available.contextHint')}</Text>
                </Paper>
            </Stack>
            {selected && <UsableNameModal entry={selected} healthKnown={healthKnown} apiUrl={me?.api_url} onClose={() => setOpen(null)} />}
        </Container>
    );
}
