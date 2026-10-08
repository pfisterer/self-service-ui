import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Container, Group, Modal, Paper, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { Plus, Trash2 } from 'lucide-react';
import { formatDateTime } from '/format-date.js';
import { CodeBlock } from '/helper/codeblock.jsx';
import { LoadError, Loading, useApiMutation } from '/helper/query-state.jsx';
import { useConfirm } from '/providers/confirm.jsx';
import { useLlmApi } from '/llm/api-llm.jsx';
import { llmKeys } from '/llm/query-keys.js';
import { useLlmMe } from '/llm/use-llm-me.jsx';
import { units } from '/llm/format.js';
import { VscodeSetup } from '/llm/vscode-setup.jsx';

// Names that contain at least one letter or digit, as the API requires.
const NAME_OK = /[\p{L}\p{N}]/u;

export function keyLabel(k, t) {
    return k.chat ? t('llm.keys.chatKey') : (k.name || '—');
}

export function LlmKeys() {
    const { t } = useTranslation();
    const api = useLlmApi();
    const confirm = useConfirm();
    const { me } = useLlmMe();
    const [name, setName] = useState('');
    const [fresh, setFresh] = useState(null);

    const usage = useQuery({ queryKey: llmKeys.usage(), queryFn: () => api.getUsage() });

    const create = useApiMutation({
        mutationFn: () => api.createKey(name.trim()),
        invalidates: [llmKeys.usage()],
        onSuccess: (created) => { setFresh(created?.key ?? null); setName(''); },
    });
    const remove = useApiMutation({
        mutationFn: (id) => api.deleteKey(id),
        invalidates: [llmKeys.usage()],
    });

    async function onDelete(k) {
        const ok = await confirm({
            title: t('llm.keys.deleteTitle'),
            confirmLabel: t('llm.keys.deleteConfirm'),
            message: k.chat ? t('llm.keys.deleteChatMessage') : t('llm.keys.deleteMessage', { name: keyLabel(k, t) }),
        });
        if (ok) remove.mutate(k.id);
    }

    if (usage.isPending) return <Container size="lg" py="md"><Loading /></Container>;
    if (usage.isError) return <Container size="lg" py="md"><LoadError query={usage} /></Container>;

    const u = usage.data ?? {};
    const keys = u.keys ?? [];
    const own = u.own_keys ?? keys.filter(k => !k.chat).length;
    const full = u.max_keys > 0 && own >= u.max_keys;
    const apiUrl = me?.api_url || '';
    const env = `export OPENAI_BASE_URL=${apiUrl}\nexport OPENAI_API_KEY=${fresh ?? ''}`;

    return (
        <Container size="lg" py="md">
            <Stack gap="lg">
                <Paper p="lg" radius="md" withBorder>
                    <Group justify="space-between" align="flex-end" wrap="wrap">
                        <div>
                            <Title order={3}>{t('llm.keys.title')}</Title>
                            <Text size="xs" c="dimmed">
                                {t('llm.keys.count', { own, max: u.max_keys })}
                                {own < keys.length && <> · {t('llm.keys.chatNotCounted')}</>}
                            </Text>
                        </div>
                        <Group gap="xs" wrap="nowrap">
                            <TextInput w={260} maxLength={40} value={name}
                                placeholder={t('llm.keys.namePlaceholder')}
                                onChange={e => setName(e.currentTarget.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && NAME_OK.test(name) && !full) create.mutate(); }} />
                            <Button leftSection={<Plus size={16} />} loading={create.isPending}
                                disabled={full || !NAME_OK.test(name)} onClick={() => create.mutate()}>
                                {t('llm.keys.create')}
                            </Button>
                        </Group>
                    </Group>
                    {full && <Text size="xs" c="orange" mt="xs">{t('llm.keys.full')}</Text>}

                    <Table striped highlightOnHover mt="md">
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>{t('llm.keys.name')}</Table.Th>
                                <Table.Th>{t('llm.keys.spend')}</Table.Th>
                                <Table.Th>{t('llm.keys.reset')}</Table.Th>
                                <Table.Th />
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {keys.length === 0 && (
                                <Table.Tr><Table.Td colSpan={4}><Text size="sm" c="dimmed">{t('llm.keys.none')}</Text></Table.Td></Table.Tr>
                            )}
                            {keys.map(k => (
                                <Table.Tr key={k.id}>
                                    <Table.Td>{keyLabel(k, t)}</Table.Td>
                                    <Table.Td>{units(k.spend, 4)} / {units(k.budget)}</Table.Td>
                                    <Table.Td>{k.reset_at ? formatDateTime(k.reset_at) : '—'}</Table.Td>
                                    <Table.Td align="right">
                                        <Button size="xs" variant="subtle" color="red" leftSection={<Trash2 size={14} />}
                                            loading={remove.isPending && remove.variables === k.id} onClick={() => onDelete(k)}>
                                            {t('llm.keys.delete')}
                                        </Button>
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Paper>
            </Stack>

            <Modal opened={!!fresh} onClose={() => setFresh(null)} title={t('llm.keys.newTitle')} size={900} centered>
                <Alert color="dhbw" variant="light" title={t('llm.keys.onceTitle')} mb="sm">
                    {t('llm.keys.onceText')}
                </Alert>
                <CodeBlock language="plaintext" code={fresh ?? ''} />

                {apiUrl && (
                    <>
                        <Text size="sm" fw={600} mt="lg">{t('llm.keys.shellTitle')}</Text>
                        <Text size="xs" c="dimmed" mb={4}>{t('llm.keys.shellHint')}</Text>
                        <CodeBlock language="bash" code={env} />
                        <VscodeSetup apiUrl={apiUrl} />
                    </>
                )}

                <Group mt="lg" justify="flex-end">
                    <Button variant="default" onClick={() => setFresh(null)}>{t('llm.keys.close')}</Button>
                </Group>
            </Modal>
        </Container>
    );
}
