import { useState } from 'react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Alert, Anchor, Badge, Button, Container, Group, Modal, Paper, Select, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { Plus, Trash2 } from 'lucide-react';
import { formatDateTime } from '/format-date.js';
import { CodeBlock } from '/helper/codeblock.jsx';
import { LoadError, Loading, useApiMutation } from '/helper/query-state.jsx';
import { NoProject } from '/projects/no-project.jsx';
import { useConfirm } from '/providers/confirm.jsx';
import { useLlmApi } from '/llm/api-llm.jsx';
import { llmKeys } from '/llm/query-keys.js';
import { useLlmMe } from '/llm/use-llm-me.jsx';
import { units } from '/llm/format.js';
import { ToolSetup } from '/llm/tool-setup.jsx';
import { LlmPoolWarnings } from '/projects/component-llm-limits.jsx';

// Names that contain at least one letter or digit, as the API requires.
const NAME_OK = /[\p{L}\p{N}]/u;

export function keyLabel(k, t) {
    if (k.chat) return t('llm.keys.chatKey');
    // The key of the person's servers in a workspace project, named after that project.
    if (k.workspace) return t('llm.keys.workspaceKey', { project: k.workspace_name || k.workspace });
    return k.name || t('llm.keys.unnamed');
}

export function LlmKeys() {
    const { t } = useTranslation();
    const api = useLlmApi();
    const confirm = useConfirm();
    const { me } = useLlmMe();
    const [name, setName] = useState('');
    // The project the next key draws from; null = the default project.
    const [project, setProject] = useState(null);
    const [fresh, setFresh] = useState(null);

    const usage = useQuery({ queryKey: llmKeys.usage(), queryFn: () => api.getUsage() });

    const create = useApiMutation({
        mutationFn: () => api.createKey(name.trim(), project),
        invalidates: [llmKeys.usage()],
        onSuccess: (created) => { setFresh(created?.key ?? null); setName(''); },
    });
    const remove = useApiMutation({
        mutationFn: (id) => api.deleteKey(id),
        invalidates: [llmKeys.usage()],
    });
    const setDefault = useApiMutation({
        mutationFn: (slug) => api.setDefaultProject(slug),
        invalidates: [llmKeys.usage()],
        onSuccess: () => setProject(null),
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
    // No LLM tokens through any project: the way to get some, instead of an error.
    if (usage.isError && usage.error?.status === 403) {
        return <NoProject area="llm" title={t('llm.noAccess.title')} text={t('llm.noAccess.text')} />;
    }
    if (usage.isError) return <Container size="lg" py="md"><LoadError query={usage} /></Container>;

    const u = usage.data ?? {};
    const keys = u.keys ?? [];
    // Every key spends from one project's pool. The picker only where there is
    // something to pick; its first choice is the default project.
    const projects = u.projects ?? [];
    const defaultProject = projects.find(p => p.default) ?? projects[0];
    const chosenProject = project ?? defaultProject?.slug ?? null;
    const own = u.own_keys ?? keys.filter(k => !k.chat).length;
    const full = u.max_keys > 0 && own >= u.max_keys;
    const apiUrl = me?.api_url || '';
    const env = `export OPENAI_BASE_URL=${apiUrl}\nexport OPENAI_API_KEY=${fresh ?? ''}`;

    return (
        <Container size="lg" py="md">
            <Stack gap="lg">
                <LlmPoolWarnings projects={projects} />
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
                            {projects.length > 1 && (
                                <Select w={220} aria-label={t('llm.keys.project')} allowDeselect={false}
                                    value={chosenProject} onChange={setProject}
                                    data={projects.map(p => ({ value: p.slug, label: p.name || p.slug }))} />
                            )}
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
                    {/* The default project: where a key without a chosen project and the workspaces of a project without LLM tokens draw from. */}
                    {defaultProject && (
                        <Group gap="xs" mt="sm" align="center" wrap="wrap">
                            <Text size="sm" fw={500}>{t('llm.keys.defaultProject')}</Text>
                            {projects.length > 1 ? (
                                <Select size="xs" w={240} aria-label={t('llm.keys.defaultProject')} allowDeselect={false}
                                    value={defaultProject.slug} disabled={setDefault.isPending}
                                    onChange={(v) => v && v !== defaultProject.slug && setDefault.mutate(v)}
                                    data={projects.map(p => ({ value: p.slug, label: p.name || p.slug }))} />
                            ) : (
                                <Text size="sm">{defaultProject.name || defaultProject.slug}</Text>
                            )}
                            <Text size="xs" c="dimmed">{t('llm.keys.defaultProjectHint')}</Text>
                        </Group>
                    )}
                    <Text size="xs" c="dimmed" mt="xs">
                        {t('llm.keys.poolsHint')} <Anchor component={Link} to="/usage" size="xs">{t('llm.keys.toUsage')}</Anchor>
                    </Text>

                    <Table striped highlightOnHover mt="md">
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>{t('llm.keys.name')}</Table.Th>
                                <Table.Th>{t('llm.keys.project')}</Table.Th>
                                <Table.Th>{t('llm.keys.shortTerm')}</Table.Th>
                                <Table.Th>{t('llm.keys.reset')}</Table.Th>
                                <Table.Th />
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {keys.length === 0 && (
                                <Table.Tr><Table.Td colSpan={5}><Text size="sm" c="dimmed">{t('llm.keys.none')}</Text></Table.Td></Table.Tr>
                            )}
                            {keys.map(k => (
                                <Table.Tr key={k.id}>
                                    <Table.Td>{keyLabel(k, t)}</Table.Td>
                                    <Table.Td>
                                        <Group gap={6} wrap="nowrap">
                                            {k.project_name || <Text span size="sm" c="dimmed">{t('llm.keys.noProject')}</Text>}
                                            {projects.length > 1 && k.project === defaultProject?.slug && <Badge size="xs" variant="light" color="teal">{t('llm.usage.default')}</Badge>}
                                        </Group>
                                    </Table.Td>
                                    <Table.Td>{units(k.spend, 4)} / {units(k.budget)}{k.budget_duration && <Text span size="xs" c="dimmed"> {t('llm.keys.per', { window: k.budget_duration })}</Text>}</Table.Td>
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
                        <ToolSetup apiUrl={apiUrl} apiKey={fresh ?? ''} />
                    </>
                )}

                <Group mt="lg" justify="flex-end">
                    <Button variant="default" onClick={() => setFresh(null)}>{t('llm.keys.close')}</Button>
                </Group>
            </Modal>
        </Container>
    );
}
