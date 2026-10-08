import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDebouncedValue } from '@mantine/hooks';
import { Trans, useTranslation } from 'react-i18next';
import {
    Alert, Autocomplete, Badge, Button, Code, Container, Group, Modal, Paper, SegmentedControl,
    Select, Stack, Table, Text, TextInput, Title, Tooltip,
} from '@mantine/core';
import { Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { formatDateTime } from '/format-date.js';
import { LoadError, Loading, useApiMutation } from '/helper/query-state.jsx';
import { useConfirm } from '/providers/confirm.jsx';
import { useLlmApi } from '/llm/api-llm.jsx';
import { llmKeys } from '/llm/query-keys.js';

const ROLES = ['user', 'fleet-admin', 'admin'];
const ROLE_COLOUR = { user: 'gray', 'fleet-admin': 'blue', admin: 'dhbw' };

// A token is "user:<email>" or "group:<id>" — the role-provider's notation.
// The editor splits it into kind and value so nobody has to type the prefix.
const splitToken = (token = '') => {
    const [kind, ...rest] = token.split(':');
    return kind === 'group' || kind === 'user' ? { kind, value: rest.join(':') } : { kind: 'user', value: token };
};
const joinToken = (kind, value) => {
    // A pasted "group:…" or "user:…" must not end up doubled.
    return `${kind}:${value.trim().replace(/^(user|group):/i, '')}`;
};

export function LlmAccessRules() {
    const { t } = useTranslation();
    const api = useLlmApi();
    const confirm = useConfirm();
    const [editing, setEditing] = useState(null);

    const rules = useQuery({ queryKey: llmKeys.accessRules(), queryFn: () => api.listAccessRules() });
    const tiers = useQuery({ queryKey: llmKeys.tiers(), queryFn: () => api.listTiers() });

    const remove = useApiMutation({
        mutationFn: (id) => api.deleteAccessRule(id),
        // `me` too: an admin can remove the rule that made them one.
        invalidates: [llmKeys.accessRules(), llmKeys.me()],
    });

    async function onDelete(rule) {
        const ok = await confirm({
            title: t('llm.access.deleteTitle'),
            confirmLabel: t('llm.access.deleteConfirm'),
            message: t('llm.access.deleteMessage', { token: rule.token }),
        });
        if (ok) remove.mutate(rule.id);
    }

    if (rules.isPending) return <Container size="lg" py="md"><Loading /></Container>;
    if (rules.isError) return <Container size="lg" py="md"><LoadError query={rules} /></Container>;

    return (
        <Container size="lg" py="md">
            <Stack gap="lg">
                <Paper p="lg" radius="md" withBorder>
                    <Group justify="space-between" align="flex-end" wrap="wrap">
                        <div>
                            <Title order={3}>{t('llm.access.title')}</Title>
                            <Text size="xs" c="dimmed" maw={760}>{t('llm.access.hint')}</Text>
                        </div>
                        <Button leftSection={<Plus size={16} />} onClick={() => setEditing({})}>{t('llm.access.add')}</Button>
                    </Group>

                    <Table striped highlightOnHover mt="md">
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>{t('llm.access.token')}</Table.Th>
                                <Table.Th>{t('llm.access.role')}</Table.Th>
                                <Table.Th>{t('llm.access.tier')}</Table.Th>
                                <Table.Th>{t('llm.access.comment')}</Table.Th>
                                <Table.Th>{t('llm.access.changed')}</Table.Th>
                                <Table.Th />
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {(rules.data ?? []).map(r => (
                                <Table.Tr key={r.bootstrap ? `b-${r.token}` : r.id}>
                                    <Table.Td><Text size="sm" ff="monospace">{r.token}</Text></Table.Td>
                                    <Table.Td>
                                        <Badge variant="light" color={ROLE_COLOUR[r.role] ?? 'gray'} style={{ textTransform: 'none' }}>
                                            {t(`llm.roles.${r.role}`)}
                                        </Badge>
                                    </Table.Td>
                                    <Table.Td>{r.tier}</Table.Td>
                                    <Table.Td><Text size="sm" c="dimmed">{r.comment}</Text></Table.Td>
                                    <Table.Td>
                                        {r.bootstrap ? <Text size="xs" c="dimmed">{t('llm.access.fromConfig')}</Text> : (
                                            <>
                                                <Text size="xs">{r.updated_at ? formatDateTime(r.updated_at) : '—'}</Text>
                                                <Text size="xs" c="dimmed">{r.updated_by}</Text>
                                            </>
                                        )}
                                    </Table.Td>
                                    <Table.Td align="right">
                                        {r.bootstrap ? (
                                            <Tooltip label={t('llm.access.bootstrapTip')} multiline w={260} withArrow>
                                                <Lock size={16} style={{ opacity: 0.5 }} />
                                            </Tooltip>
                                        ) : (
                                            <Group gap={4} justify="flex-end" wrap="nowrap">
                                                <Button size="xs" variant="subtle" leftSection={<Pencil size={14} />} onClick={() => setEditing(r)}>
                                                    {t('llm.access.edit')}
                                                </Button>
                                                <Button size="xs" variant="subtle" color="red" leftSection={<Trash2 size={14} />}
                                                    loading={remove.isPending && remove.variables === r.id} onClick={() => onDelete(r)}>
                                                    {t('llm.access.delete')}
                                                </Button>
                                            </Group>
                                        )}
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Paper>

                <Alert variant="light" color="gray" title={t('llm.access.howTitle')}>
                    {['none', 'highest', 'roles'].map(k => (
                        <Text key={k} size="sm" mt={k === 'none' ? 0 : 'xs'}>
                            <Trans i18nKey={`llm.access.how.${k}`} components={{ 1: <b />, 2: <Code /> }} />
                        </Text>
                    ))}
                </Alert>
            </Stack>

            {editing && (
                <RuleEditor rule={editing} tiers={tiers.data ?? []} onClose={() => setEditing(null)} />
            )}
        </Container>
    );
}

function RuleEditor({ rule, tiers, onClose }) {
    const { t } = useTranslation();
    const api = useLlmApi();
    const initial = splitToken(rule.token);
    const [kind, setKind] = useState(initial.kind);
    const [value, setValue] = useState(initial.value);
    const [role, setRole] = useState(rule.role ?? 'user');
    const [tier, setTier] = useState(rule.tier ?? tiers[0] ?? null);
    const [comment, setComment] = useState(rule.comment ?? '');
    const [search] = useDebouncedValue(value.trim(), 300);

    const groups = useQuery({
        queryKey: llmKeys.groups(search),
        queryFn: () => api.searchGroups(search),
        enabled: kind === 'group' && search.length >= 2,
        staleTime: 60_000,
    });

    const save = useApiMutation({
        mutationFn: (body) => (rule.id ? api.updateAccessRule(rule.id, body) : api.createAccessRule(body)),
        invalidates: [llmKeys.accessRules(), llmKeys.me()],
        reportErrors: 'inline',
        onSuccess: onClose,
        onConflict: onClose,
    });

    const valid = kind === 'user' ? /^[^@\s]+@[^@\s]+$/.test(value.trim()) : value.trim().length > 0;
    const options = (groups.data ?? []).map(g => ({
        value: g.token.replace(/^group:/, ''),
        label: g.display_name ? `${g.token.replace(/^group:/, '')} — ${g.display_name}` : g.token.replace(/^group:/, ''),
    }));

    return (
        <Modal opened onClose={onClose} title={t(rule.id ? 'llm.access.editTitle' : 'llm.access.addTitle')} size="lg" centered>
            <Stack gap="sm">
                <SegmentedControl value={kind} onChange={setKind}
                    data={[{ value: 'user', label: t('llm.access.kindUser') }, { value: 'group', label: t('llm.access.kindGroup') }]} />
                {kind === 'user' ? (
                    <TextInput label={t('llm.access.email')} placeholder="vorname.nachname@dhbw.de" value={value}
                        onChange={e => setValue(e.currentTarget.value)} data-autofocus />
                ) : (
                    <Autocomplete label={t('llm.access.group')} description={t('llm.access.groupHint')}
                        placeholder="wwi23seb" value={value} onChange={setValue}
                        data={options} filter={({ options: o }) => o} limit={25}
                        comboboxProps={{ withinPortal: true }} />
                )}
                <Text size="xs" c="dimmed">{t('llm.access.tokenPreview')} <Code>{value.trim() ? joinToken(kind, value) : '—'}</Code></Text>
                <Group grow>
                    <Select label={t('llm.access.role')} value={role} onChange={setRole} allowDeselect={false}
                        data={ROLES.map(r => ({ value: r, label: t(`llm.roles.${r}`) }))} />
                    <Select label={t('llm.access.tier')} value={tier} onChange={setTier} allowDeselect={false} data={tiers} />
                </Group>
                <TextInput label={t('llm.access.comment')} placeholder={t('llm.access.commentPlaceholder')} maxLength={200}
                    value={comment} onChange={e => setComment(e.currentTarget.value)} />
                {save.error && <Alert color="red" variant="light">{save.error.message}</Alert>}
                <Group justify="flex-end" mt="sm">
                    <Button variant="default" onClick={onClose}>{t('llm.access.cancel')}</Button>
                    <Button loading={save.isPending} disabled={!valid || !tier}
                        onClick={() => save.mutate({ token: joinToken(kind, value), role, tier, comment })}>
                        {t('llm.access.save')}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}
