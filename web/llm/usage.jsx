import { useQuery } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import { Alert, Badge, Container, Divider, Group, Paper, Progress, SimpleGrid, Stack, Table, Text } from '@mantine/core';
import { formatDateTime } from '/format-date.js';
import { LoadError, Loading } from '/helper/query-state.jsx';
import { useLlmApi } from '/llm/api-llm.jsx';
import { llmKeys } from '/llm/query-keys.js';
import { useLlmMe } from '/llm/use-llm-me.jsx';
import { barColour, percent, units } from '/llm/format.js';
import { keyLabel } from '/llm/keys.jsx';

export function LlmUsage() {
    const { t, i18n } = useTranslation();
    const api = useLlmApi();
    const { me } = useLlmMe();
    const usage = useQuery({ queryKey: llmKeys.usage(), queryFn: () => api.getUsage() });

    if (usage.isPending) return <Container size="lg" py="md"><Loading /></Container>;
    if (usage.isError) return <Container size="lg" py="md"><LoadError query={usage} /></Container>;

    const u = usage.data ?? {};
    const p = percent(u.spend, u.budget);
    const keys = u.keys ?? [];
    const num = (n) => Number(n).toLocaleString(i18n.resolvedLanguage);

    return (
        <Container size="lg" py="md">
            <Stack gap="lg">
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
                    <Paper p="lg" radius="md" withBorder>
                        <Group justify="space-between">
                            <Text fw={600}>{t('llm.usage.monthly')}</Text>
                            <Group gap={6}>
                                {me?.tier && <Badge variant="light">{me.tier}</Badge>}
                                <Badge variant="default">{u.budget_duration || '—'}</Badge>
                            </Group>
                        </Group>
                        <Text size="xs" c="dimmed">{t('llm.usage.allKeys')}</Text>
                        <Group align="baseline" gap={6} mt="sm">
                            <Text fz={30} fw={650} lh={1}>{units(u.spend)}</Text>
                            <Text c="dimmed">{t('llm.usage.of', { budget: units(u.budget) })}</Text>
                        </Group>
                        {u.budget > 0 && <Progress value={p} color={barColour(p)} size="md" mt="sm" />}
                        <Text size="sm" c="dimmed" mt="xs">
                            {t('llm.usage.resetAt', { date: u.reset_at ? formatDateTime(u.reset_at) : '—' })}
                        </Text>
                        <Text size="xs" c="dimmed" mt={4}>{t('llm.usage.live')}</Text>
                    </Paper>
                    <Paper p="lg" radius="md" withBorder>
                        <Text fw={600}>{t('llm.usage.limits')}</Text>
                        <Text size="xs" c="dimmed">{t('llm.usage.inForce')}</Text>
                        <Stack gap={6} mt="sm">
                            {u.rpm > 0 && <Text size="sm">{t('llm.usage.rpm', { n: num(u.rpm) })}</Text>}
                            {u.tpm > 0 && <Text size="sm">{t('llm.usage.tpm', { n: num(u.tpm) })}</Text>}
                        </Stack>
                        <Divider my="sm" />
                        <Group gap={6}>
                            {(u.models?.length ? u.models : [t('llm.usage.allModels')]).map(m => (
                                <Badge key={m} variant="light" color="gray" style={{ textTransform: 'none' }}>{m}</Badge>
                            ))}
                        </Group>
                    </Paper>
                </SimpleGrid>

                <Paper p="lg" radius="md" withBorder>
                    <Text fw={600}>{t('llm.usage.perKey')}</Text>
                    <Text size="xs" c="dimmed" mb="sm">{t('llm.usage.perKeyHint')}</Text>
                    <Table striped highlightOnHover>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>{t('llm.keys.name')}</Table.Th>
                                <Table.Th>{t('llm.usage.shortTerm')}</Table.Th>
                                <Table.Th>{t('llm.usage.period')}</Table.Th>
                                <Table.Th>{t('llm.keys.reset')}</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {keys.length === 0 && (
                                <Table.Tr><Table.Td colSpan={4}><Text size="sm" c="dimmed">{t('llm.keys.none')}</Text></Table.Td></Table.Tr>
                            )}
                            {keys.map(k => {
                                const kp = percent(k.spend, k.budget);
                                return (
                                    <Table.Tr key={k.id}>
                                        <Table.Td>{keyLabel(k, t)}</Table.Td>
                                        <Table.Td>
                                            <Text size="sm">{units(k.spend, 4)} / {units(k.budget)}</Text>
                                            {k.budget > 0 && <Progress value={kp} color={barColour(kp)} size="xs" mt={4} />}
                                        </Table.Td>
                                        <Table.Td>{k.budget_duration || '—'}</Table.Td>
                                        <Table.Td>{k.reset_at ? formatDateTime(k.reset_at) : '—'}</Table.Td>
                                    </Table.Tr>
                                );
                            })}
                        </Table.Tbody>
                    </Table>
                </Paper>

                <Alert variant="light" color="gray" title={t('llm.usage.explainTitle')}>
                    {['units', 'monthly', 'shortTerm'].map(k => (
                        <Text key={k} size="sm" mt={k === 'units' ? 0 : 'xs'}>
                            <Trans i18nKey={`llm.usage.explain.${k}`} components={{ 1: <b /> }} />
                        </Text>
                    ))}
                </Alert>
            </Stack>
        </Container>
    );
}
