import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import { ActionIcon, Button, Code, Container, CopyButton, Group, Paper, Stack, Text, Title, Tooltip } from '@mantine/core';
import { ArrowRight, Check, Copy, MessageSquare, ShieldCheck } from 'lucide-react';
import { ExternalLink } from '/helper/external-link.jsx';
import { useLlmApi } from '/llm/api-llm.jsx';
import { useLlmMe } from '/llm/use-llm-me.jsx';
import { llmKeys } from '/llm/query-keys.js';
import { LITELLM_CLIENT_DOCS, STABLE_MODELS, TOOLS, grantedModels } from '/llm/tools.js';
import { LlmPoolWarnings } from '/projects/component-llm-limits.jsx';

// One alias with the model that serves it most often underneath, dimmed; the tooltip lists every model behind it with its count. Nothing underneath while the list is loading or not readable: the alias itself stays usable either way.
function AliasChip({ alias, info, healthKnown }) {
    const { t } = useTranslation();
    const models = info?.models;
    let line = null;
    if (models && models.length === 0) {
        line = <Text size="xs" c="dimmed">{t('llm.overview.aliasEmpty')}</Text>;
    } else if (models) {
        const [top, ...rest] = models;
        const label = rest.length > 0 ? t('llm.overview.aliasMore', { model: top.model, count: rest.length }) : t('llm.overview.aliasMostly', { model: top.model });
        const tip = (
            <Stack gap={2}>
                {models.map(m => (
                    <span key={m.model}>{t(healthKnown ? 'llm.overview.aliasModel' : 'llm.overview.aliasModelNoHealth', { model: m.model, count: m.deployments, healthy: m.healthy })}</span>
                ))}
            </Stack>
        );
        line = (
            <Tooltip label={tip} withArrow multiline maw={420}>
                <Text size="xs" c="dimmed" style={{ cursor: 'help' }}>{label}</Text>
            </Tooltip>
        );
    }
    return (
        <Stack gap={2} align="flex-start">
            <Code>{alias}</Code>
            {line}
        </Stack>
    );
}

// What the LLM service is and what a tool needs to use it: the chat, a key, the base URL and the stable model names.
export function LlmOverview() {
    const { t } = useTranslation();
    const { me, hasAccess } = useLlmMe();
    const api = useLlmApi();
    // Which models stand behind the aliases right now; the server keeps it for a minute, so asking more often shows nothing new.
    const aliases = useQuery({ queryKey: llmKeys.aliases(), queryFn: () => api.getModelAliases(), enabled: hasAccess, refetchInterval: 60_000 });
    // The pools with their rate limits: a project whose limits are too low to pass a request is said here, next to the chat button, rather than found out by a rejected request.
    const usage = useQuery({ queryKey: llmKeys.usage(), queryFn: () => api.getUsage(), enabled: hasAccess });
    const byAlias = Object.fromEntries((aliases.data?.aliases ?? []).map(a => [a.alias, a]));
    const apiUrl = me?.api_url || '';
    const chatUrl = me?.chat_url || '';

    return (
        <Container size="lg" py="md">
            <Stack gap="md">
                <Paper p="lg" radius="md" withBorder>
                    <Stack gap="sm">
                        <Title order={2}>{t('llm.overview.title')}</Title>
                        <Text c="dimmed" maw={780}>{t('llm.overview.intro')}</Text>
                        <Group gap="xs" wrap="nowrap" align="flex-start" maw={780}>
                            <ShieldCheck size={18} style={{ flexShrink: 0, marginTop: 2, color: 'var(--mantine-color-teal-7)' }} />
                            <Text size="sm">{t('llm.overview.promise')}</Text>
                        </Group>
                        <Group mt={4}>
                            {chatUrl && (
                                <Button component="a" href={chatUrl} target="_blank" leftSection={<MessageSquare size={18} />}>
                                    {t('llm.overview.openChat')}
                                </Button>
                            )}
                            <Button component={Link} to="/keys" variant={chatUrl ? 'light' : 'filled'} rightSection={<ArrowRight size={18} />}>
                                {t('llm.overview.createKey')}
                            </Button>
                        </Group>
                    </Stack>
                </Paper>

                <LlmPoolWarnings projects={usage.data?.projects} />

                <Paper p="lg" radius="md" withBorder>
                    <Stack gap="xs">
                        <Title order={4}>{t('llm.overview.connect')}</Title>
                        {apiUrl && (
                            <Group gap="xs" wrap="nowrap">
                                <Text size="sm" w={110}>{t('llm.overview.baseUrl')}</Text>
                                <Code>{apiUrl}</Code>
                                <CopyButton value={apiUrl} timeout={1500}>
                                    {({ copied, copy }) => (
                                        <Tooltip label={copied ? t('llm.overview.copied') : t('llm.overview.copy')} withArrow>
                                            <ActionIcon variant="subtle" color="gray" size="sm" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />}</ActionIcon>
                                        </Tooltip>
                                    )}
                                </CopyButton>
                            </Group>
                        )}
                        <Group gap="xs" wrap="nowrap" align="flex-start">
                            <Text size="sm" w={110} style={{ flexShrink: 0 }}>{t('llm.overview.models')}</Text>
                            <div>
                                <Group gap="md" align="flex-start">
                                    {[...STABLE_MODELS, ...grantedModels(aliases.data)].map(m => <AliasChip key={m} alias={m} info={byAlias[m]} healthKnown={!!aliases.data?.health_known} />)}
                                </Group>
                                <Text size="xs" c="dimmed" mt={4} maw={780}>
                                    <Trans i18nKey="llm.overview.modelsHint" components={{ 1: <Code fz="xs" /> }} />
                                </Text>
                            </div>
                        </Group>
                        <Group gap="xs" wrap="nowrap" align="flex-start">
                            <Text size="sm" w={110} style={{ flexShrink: 0 }}>{t('llm.overview.tools')}</Text>
                            <Text size="sm">
                                {TOOLS.map((tool, i) => <span key={tool.id}>{i > 0 && ' · '}<ExternalLink href={tool.url}>{tool.name}</ExternalLink></span>)}
                                {' · '}
                                <Trans i18nKey="llm.overview.ownCode" components={{ 1: <ExternalLink href={LITELLM_CLIENT_DOCS} /> }} />
                            </Text>
                        </Group>
                    </Stack>
                </Paper>
            </Stack>
        </Container>
    );
}
