import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Alert, Anchor, Badge, Code, Collapse, Container, Divider, Group, Modal, Paper, SimpleGrid, Stack, Table, Text, Title, Tooltip, Typography, UnstyledButton } from '@mantine/core';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { ExternalLink } from '/helper/external-link.jsx';
import { markdownToHtml } from '/helper/markdown.js';
import { Loading, LoadError } from '/helper/query-state.jsx';
import { useLlmApi } from '/llm/api-llm.jsx';
import { useLlmMe } from '/llm/use-llm-me.jsx';
import { llmKeys } from '/llm/query-keys.js';
import { ModelToolSetup } from '/llm/tool-setup.jsx';
import { contextLabel, healthState, summaryOf } from '/llm/usable-models.js';

// The model names the person can use (llm-management-api getUsableModels): the base aliases and what their projects were granted, each with a short description, its context, how it is doing and the projects it comes through. A row opens the details: the short description, origin and licence, the longer description of each model behind it on request, and the setup of the tools on this name (the same as after a new key). Never a machine or site: the service names only device classes.

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
            <Text size="sm" component="div">{children}</Text>
        </div>
    );
}

// The description of the first model behind the name that has one: the same model summaryOf takes the short description from.
const describedModel = (entry) => (entry.models ?? []).find(m => m.description);

// One model behind the name, folded away under "more": its description and facts. Origin and licence of the first described model are in the header already; for a further one they come here.
function ModelDetails({ model, withOrigin }) {
    const { t } = useTranslation();
    const d = model.description;
    const html = markdownToHtml(d?.description);
    return (
        <Paper withBorder radius="md" p="sm">
            <Stack gap="xs">
                <Code style={{ alignSelf: 'flex-start' }}>{model.model}</Code>
                {!d && <Text size="sm" c="dimmed">{t('llm.available.noDescription')}</Text>}
                {html && (
                    <Typography>
                        {/* Sanitised by markdownToHtml (DOMPurify). */}
                        <div data-testid="model-description" dangerouslySetInnerHTML={{ __html: html }} />
                    </Typography>
                )}
                {d && (
                    <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs" verticalSpacing="xs">
                        {withOrigin && <Fact label={t('llm.available.facts.source')}>{d.source_url ? <ExternalLink href={d.source_url}>{t('llm.available.facts.sourceLink')}</ExternalLink> : '–'}</Fact>}
                        {withOrigin && <Fact label={t('llm.available.facts.license')}>{d.license || '–'}</Fact>}
                        <Fact label={t('llm.available.facts.parameters')}>{d.parameters || '–'}</Fact>
                        <Fact label={t('llm.available.facts.quantisation')}>{d.quantisation || '–'}</Fact>
                        <Fact label={t('llm.available.facts.toolCalls')}>{flag(t, d.tool_calls)}</Fact>
                        <Fact label={t('llm.available.facts.reasoning')}>{flag(t, d.reasoning)}</Fact>
                    </SimpleGrid>
                )}
            </Stack>
        </Paper>
    );
}

// The dialog of one usable name: a compact header (short description, origin, licence, context, state, projects), the longer description folded away, and below the setup of the tools on this name, made by the same code as after a new key.
export function UsableNameModal({ entry, healthKnown, apiUrl, onClose }) {
    const { t } = useTranslation();
    const [more, setMore] = useState(false);
    const context = contextLabel(entry.limits);
    const summary = summaryOf(entry);
    const described = describedModel(entry);
    const d = described?.description;
    const models = entry.models ?? [];
    return (
        <Modal opened onClose={onClose} size={900} title={<Group gap="xs"><Code fz="md">{entry.name}</Code><KindBadge kind={entry.kind} /></Group>}>
            <Stack gap="sm">
                {summary ? <Text size="sm">{summary}</Text> : <Text size="sm" c="dimmed">{t('llm.available.noSummary')}</Text>}
                <Group gap="xl" align="flex-start">
                    {d?.source_url && <Fact label={t('llm.available.facts.source')}><ExternalLink href={d.source_url}>{t('llm.available.facts.sourceLink')}</ExternalLink></Fact>}
                    {d?.license && <Fact label={t('llm.available.facts.license')}>{d.license}</Fact>}
                    <Fact label={t('llm.available.context')}>
                        <Tooltip label={t('llm.available.contextHint')} multiline w={340} withArrow><span style={{ cursor: 'help', borderBottom: '1px dotted' }}>{context || '–'}</span></Tooltip>
                    </Fact>
                    <Fact label={t('llm.available.state')}><HealthBadge entry={entry} healthKnown={healthKnown} /></Fact>
                    <Fact label={t('llm.available.project')}><ProjectsText entry={entry} /></Fact>
                </Group>
                <Text size="xs" c="dimmed">{t(entry.kind === 'model' ? 'llm.available.kindHintModel' : 'llm.available.kindHintAlias')}</Text>
                {models.length === 0 && <Alert color="gray" variant="light">{t('llm.available.noModels')}</Alert>}
                {models.length > 0 && (
                    <div>
                        <UnstyledButton onClick={() => setMore(o => !o)} aria-expanded={more}>
                            <Group gap={4}>
                                {more ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                <Text size="sm" c="dimmed">{t(more ? 'llm.available.less' : 'llm.available.more')}</Text>
                            </Group>
                        </UnstyledButton>
                        <Collapse expanded={more}>
                            <Stack gap="xs" mt="xs">
                                {entry.kind !== 'model' && models.length > 1 && <Text size="sm">{t('llm.available.severalModels', { count: models.length })}</Text>}
                                {models.map(m => <ModelDetails key={m.model} model={m} withOrigin={m !== described} />)}
                            </Stack>
                        </Collapse>
                    </div>
                )}
                <Divider />
                <Text size="sm" fw={600}>{t('llm.tools.title')}</Text>
                <ModelToolSetup apiUrl={apiUrl} entry={entry} />
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
                                <Table.Th style={{ whiteSpace: 'nowrap' }}>{t('llm.available.context')}</Table.Th>
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
