import { Link } from 'wouter';
import { Trans, useTranslation } from 'react-i18next';
import { Alert, Button, Code, Container, Group, List, Paper, SimpleGrid, Stack, Table, Text, ThemeIcon, Title } from '@mantine/core';
import { ArrowRight, KeyRound, LogIn, MessageSquare, Rocket, ShieldCheck } from 'lucide-react';
import { ExternalLink } from '/helper/external-link.jsx';
import { useLlmMe } from '/llm/use-llm-me.jsx';
import { LITELLM_CLIENT_DOCS, STABLE_MODELS, TOOLS } from '/llm/tools.js';

export function LlmOverview() {
    const { t } = useTranslation();
    const { me } = useLlmMe();
    const apiUrl = me?.api_url || '';
    const chatUrl = me?.chat_url || '';

    const steps = [
        { icon: LogIn, color: 'blue', key: 'signIn' },
        { icon: KeyRound, color: 'teal', key: 'key' },
        { icon: Rocket, color: 'indigo', key: 'use' },
    ];

    return (
        <Container size="lg" py="md">
            <Stack gap="lg">
                <Paper p="xl" shadow="sm" radius="md" withBorder>
                    <Stack gap="sm">
                        <Title order={1}>{t('llm.overview.title')}</Title>
                        <Text size="sm" c="dimmed">
                            <Trans i18nKey="llm.overview.serviceOf"
                                components={{ 1: <ExternalLink href="https://dhbw.cloud" fw={600} /> }} />
                        </Text>
                        <Text size="lg" c="dimmed" maw={780}>
                            <Trans i18nKey="llm.overview.intro" components={{ 1: <b /> }} />
                            {chatUrl && <> {t('llm.overview.introChat')}</>}
                        </Text>
                        {/* What the service promises, said once and up front: it is
                            the reason to use it rather than a commercial one. */}
                        <Group gap="xs" wrap="nowrap" align="flex-start" maw={780}>
                            <ShieldCheck size={18} style={{ flexShrink: 0, marginTop: 2, color: 'var(--mantine-color-teal-7)' }} />
                            <Text size="sm">{t('llm.overview.promise')}</Text>
                        </Group>
                        <Group mt="sm">
                            {chatUrl && (
                                <Button component="a" href={chatUrl} target="_blank" size="md" leftSection={<MessageSquare size={18} />}>
                                    {t('llm.overview.openChat')}
                                </Button>
                            )}
                            <Button component={Link} to="/keys" size="md" variant={chatUrl ? 'light' : 'filled'}
                                rightSection={<ArrowRight size={18} />}>
                                {t('llm.overview.createKey')}
                            </Button>
                        </Group>
                    </Stack>
                </Paper>

                <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
                    {steps.map(({ icon: Icon, color, key }) => (
                        <Paper key={key} p="lg" shadow="xs" radius="md" withBorder>
                            <Stack gap="sm">
                                <ThemeIcon size={44} radius="md" variant="light" color={color}><Icon size={24} /></ThemeIcon>
                                <Text fw={600}>{t(`llm.overview.steps.${key}.title`)}</Text>
                                <List size="sm" spacing={6} c="dimmed">
                                    {['a', 'b', 'c'].map(p => <List.Item key={p}>{t(`llm.overview.steps.${key}.${p}`)}</List.Item>)}
                                </List>
                            </Stack>
                        </Paper>
                    ))}
                </SimpleGrid>

                <Alert variant="light" color="blue" title={t('llm.overview.models.title')}>
                    <Text size="sm">
                        <Trans i18nKey="llm.overview.models.stable" values={{ names: STABLE_MODELS.join(', ') }}
                            components={{ 1: <b /> }} />
                    </Text>
                    <Text size="sm" mt="xs">
                        <Trans i18nKey="llm.overview.models.concrete" components={{ 1: <b /> }} />
                    </Text>
                </Alert>

                <Paper p="lg" radius="md" withBorder>
                    <Title order={4}>{t('llm.overview.tools.title')}</Title>
                    <Text size="sm" c="dimmed">
                        {t('llm.overview.tools.hint')}
                        {apiUrl && <> {t('llm.overview.tools.baseUrl')} <Code>{apiUrl}</Code></>}
                    </Text>
                    <Table striped highlightOnHover mt="sm" verticalSpacing={6}>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>{t('llm.overview.tools.tool')}</Table.Th>
                                <Table.Th>{t('llm.overview.tools.kind')}</Table.Th>
                                <Table.Th>{t('llm.overview.tools.description')}</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {TOOLS.map(tool => (
                                <Table.Tr key={tool.id}>
                                    <Table.Td><ExternalLink href={tool.url} fw={600}>{tool.name}</ExternalLink></Table.Td>
                                    <Table.Td><Text size="sm" c="dimmed">{t(`llm.tools.kind.${tool.kind}`)}</Text></Table.Td>
                                    <Table.Td><Text size="sm">{t(`llm.tools.description.${tool.id}`)}</Text></Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                    <Text size="xs" c="dimmed" mt="sm">
                        <Trans i18nKey="llm.overview.tools.ownCode"
                            components={{ 1: <ExternalLink href={LITELLM_CLIENT_DOCS} size="xs" /> }} />
                    </Text>
                </Paper>
            </Stack>
        </Container>
    );
}
