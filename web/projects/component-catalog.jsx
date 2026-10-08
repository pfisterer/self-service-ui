import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import {
    Alert, Autocomplete, Badge, Button, Group, List, Paper, Select, Stack, Table, Text, TextInput, Title,
} from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Loading, LoadError, useApiMutation } from '/helper/query-state.jsx';
import { formatError } from '/helper/api-error.js';
import { useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { FormModal } from './component-form-modal.jsx';
import { COLOR } from './util-project.jsx';
import { formatDateTime } from '../format-date.js';

// The availabilities of the resource catalogue — networks, images, flavours a
// project may be granted — are managed here, by root admins, instead of in the
// deployment. Taking one out goes in two steps on purpose: withdrawing sets it
// to 0 everywhere and lets the reconciler revoke it in OpenStack (and can be
// undone); removing forgets it, and is only possible once nothing holds it any
// more — from then on nothing would ever revoke a grant left behind.

const GRANT_TYPES = ['network', 'image', 'flavor'];

// Every change here changes what is offered (config) and the stored limits.
const INVALIDATES = [projectKeys.catalog(), projectKeys.config(), projectKeys.tree()];

const STATE_COLOR = { active: COLOR.positive, withdrawn: COLOR.attention };

export function CatalogPanel() {
    const { t } = useTranslation();
    const api = useNodesApi();
    const [dialog, setDialog] = useState(null); // { kind, entry }

    const list = useQuery({
        queryKey: projectKeys.catalog(),
        queryFn: () => api.listCatalog(),
        enabled: !!api,
    });

    const restore = useApiMutation({
        mutationFn: (id) => api.restoreCatalogEntry(id),
        invalidates: INVALIDATES,
    });

    if (!api || list.isPending) return <Loading size="sm" />;
    if (list.isError) return <LoadError query={list} title={t('projects.catalog.loadError')} />;

    const entries = list.data;
    const groups = [...new Set(entries.map(e => e.group).filter(Boolean))].sort();
    const close = () => setDialog(null);

    return (
        <Stack gap="md">
            <Group justify="space-between" align="center">
                <Title order={4}>{t('projects.catalog.title')}</Title>
                <Button size="sm" leftSection={<Plus size="14" />} onClick={() => setDialog({ kind: 'add' })}>
                    {t('projects.catalog.add')}
                </Button>
            </Group>
            <Text size="sm" c="dimmed">{t('projects.catalog.intro')}</Text>

            {entries.length === 0 ? (
                <Text size="sm" c="dimmed">{t('projects.catalog.empty')}</Text>
            ) : (
                <Paper withBorder radius="sm">
                    <Table.ScrollContainer minWidth={760}>
                        <Table striped fz="sm" verticalSpacing="xs">
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>{t('projects.catalog.name')}</Table.Th>
                                    <Table.Th>{t('projects.catalog.group')}</Table.Th>
                                    <Table.Th>{t('projects.catalog.target')}</Table.Th>
                                    <Table.Th>{t('projects.catalog.state')}</Table.Th>
                                    <Table.Th>{t('projects.catalog.holders')}</Table.Th>
                                    <Table.Th />
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {entries.map(e => (
                                    <Table.Tr key={e.id}>
                                        <Table.Td>
                                            <Text size="sm" fw={500}>{e.name}</Text>
                                            <Text size="xs" c="dimmed" ff="monospace">{e.id}</Text>
                                        </Table.Td>
                                        <Table.Td>{e.group || '—'}</Table.Td>
                                        <Table.Td>
                                            <Text size="xs">{t(`projects.catalog.type_${e.grant?.type}`)}</Text>
                                            <Text size="xs" c="dimmed" ff="monospace">{e.grant?.target}</Text>
                                        </Table.Td>
                                        <Table.Td>
                                            <Badge size="sm" variant="light" color={STATE_COLOR[e.state]}>
                                                {t(`projects.catalog.state_${e.state}`)}
                                            </Badge>
                                            {/* Who changed it last: with several root admins the
                                                question after "why is it withdrawn?" is "by whom?". */}
                                            <Text size="xs" c="dimmed">{formatDateTime(e.changed_at)} · {e.changed_by}</Text>
                                        </Table.Td>
                                        <Table.Td>{e.holders}</Table.Td>
                                        <Table.Td>
                                            <Group gap="xs" justify="flex-end" wrap="nowrap">
                                                <Button size="compact-xs" variant="subtle"
                                                    onClick={() => setDialog({ kind: 'edit', entry: e })}>
                                                    {t('projects.catalog.edit')}
                                                </Button>
                                                {e.state === 'active' ? (
                                                    <Button size="compact-xs" variant="light" color={COLOR.attention}
                                                        onClick={() => setDialog({ kind: 'withdraw', entry: e })}>
                                                        {t('projects.catalog.withdraw')}
                                                    </Button>
                                                ) : (
                                                    <>
                                                        <Button size="compact-xs" variant="subtle"
                                                            loading={restore.isPending && restore.variables === e.id}
                                                            onClick={() => restore.mutate(e.id)}>
                                                            {t('projects.catalog.restore')}
                                                        </Button>
                                                        <Button size="compact-xs" variant="light" color={COLOR.negative}
                                                            onClick={() => setDialog({ kind: 'remove', entry: e })}>
                                                            {t('projects.catalog.remove')}
                                                        </Button>
                                                    </>
                                                )}
                                            </Group>
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                </Paper>
            )}

            {dialog?.kind === 'add' && <EntryModal groups={groups} onClose={close} />}
            {dialog?.kind === 'edit' && <EntryModal groups={groups} entry={dialog.entry} onClose={close} />}
            {(dialog?.kind === 'withdraw' || dialog?.kind === 'remove') && (
                <ChangeModal kind={dialog.kind} entry={dialog.entry} onClose={close} />
            )}
        </Stack>
    );
}

// EntryModal adds an availability, or changes how one is presented. The id
// and the grant are fixed once it exists: pointing an id at another network
// would move every grant with it.
function EntryModal({ entry, groups, onClose }) {
    const { t } = useTranslation();
    const api = useNodesApi();
    const editing = !!entry;
    const [form, setForm] = useState({
        id: entry?.id ?? '',
        name: entry?.name ?? '',
        group: entry?.group ?? '',
        message: entry?.message ?? '',
        type: entry?.grant?.type ?? 'network',
        target: entry?.grant?.target ?? '',
    });
    const set = (k) => (v) => setForm(f => ({ ...f, [k]: v?.currentTarget ? v.currentTarget.value : v }));

    const save = useApiMutation({
        mutationFn: () => {
            const body = {
                id: form.id.trim(), name: form.name.trim(), group: form.group.trim(), message: form.message.trim(),
                grant: { type: form.type, target: form.target.trim() },
            };
            return editing ? api.updateCatalogEntry(entry.id, body) : api.addCatalogEntry(body);
        },
        invalidates: INVALIDATES,
        reportErrors: 'inline',
        onSuccess: onClose,
    });

    const complete = form.name.trim() && (editing || (form.id.trim() && form.target.trim()));
    const submit = (e) => {
        e.preventDefault();
        if (complete) save.mutate();
    };

    return (
        <FormModal
            opened
            onClose={onClose}
            size="md"
            title={editing ? t('projects.catalog.editTitle', { name: entry.name }) : t('projects.catalog.addTitle')}
            onSubmit={submit}
            submitting={save.isPending}
            submitError={save.error && formatError(save.error)}
            submitLabel={t(editing ? 'projects.catalog.save' : 'projects.catalog.add')}
            submitDisabled={!complete}
        >
            <TextInput label={t('projects.catalog.id')} description={t('projects.catalog.idHelp')}
                value={form.id} onChange={set('id')} disabled={editing} ff="monospace" required data-autofocus />
            <TextInput label={t('projects.catalog.name')} value={form.name} onChange={set('name')} required />
            <Autocomplete label={t('projects.catalog.group')} description={t('projects.catalog.groupHelp')}
                data={groups} value={form.group} onChange={set('group')} />
            <TextInput label={t('projects.catalog.message')} description={t('projects.catalog.messageHelp')}
                value={form.message} onChange={set('message')} />
            <Select label={t('projects.catalog.type')} disabled={editing} allowDeselect={false}
                data={GRANT_TYPES.map(v => ({ value: v, label: t(`projects.catalog.type_${v}`) }))}
                value={form.type} onChange={set('type')} />
            <TextInput label={t('projects.catalog.target')} disabled={editing} ff="monospace" required
                description={t(`projects.catalog.targetHelp_${form.type}`)}
                value={form.target} onChange={set('target')} />
        </FormModal>
    );
}

// ChangeModal withdraws or removes, after showing who is affected: the nodes
// holding the availability, and the projects OpenStack still grants it to.
function ChangeModal({ kind, entry, onClose }) {
    const { t } = useTranslation();
    const api = useNodesApi();
    const status = useQuery({
        queryKey: projectKeys.catalogEntry(entry.id),
        queryFn: () => api.catalogEntry(entry.id),
        enabled: !!api,
    });
    const run = useApiMutation({
        mutationFn: () => kind === 'withdraw' ? api.withdrawCatalogEntry(entry.id) : api.removeCatalogEntry(entry.id),
        invalidates: [...INVALIDATES, projectKeys.catalogEntry(entry.id)],
        reportErrors: 'inline',
        onSuccess: onClose,
    });

    const st = status.data;
    const holders = st?.holders ?? [];
    const managed = st?.openstack?.managed ?? [];
    const blocked = kind === 'remove' && (holders.length > 0 || managed.length > 0 || !!st?.openstack?.error);

    return (
        <FormModal
            opened
            onClose={onClose}
            size="lg"
            title={t(`projects.catalog.${kind}Title`, { name: entry.name })}
            onSubmit={(e) => { e.preventDefault(); if (!blocked) run.mutate(); }}
            submitting={run.isPending}
            submitError={run.error && formatError(run.error)}
            submitLabel={t(`projects.catalog.${kind}`)}
            submitColor={kind === 'remove' ? COLOR.negative : COLOR.attention}
            submitDisabled={status.isPending || blocked}
        >
            <Text size="sm">{t(`projects.catalog.${kind}Text`)}</Text>
            {status.isPending ? <Loading size="sm" /> : status.isError ? (
                <LoadError query={status} title={t('projects.catalog.loadError')} />
            ) : (
                <>
                    <HolderList holders={holders} />
                    <OpenStackState state={st.openstack} />
                    {blocked && <Alert color={COLOR.attention}>{t('projects.catalog.removeBlocked')}</Alert>}
                </>
            )}
        </FormModal>
    );
}

function HolderList({ holders }) {
    const { t } = useTranslation();
    if (!holders.length) return <Text size="sm" c="dimmed">{t('projects.catalog.noHolders')}</Text>;
    return (
        <Stack gap={4}>
            <Text size="sm" fw={600}>{t('projects.catalog.holdersTitle', { count: holders.length })}</Text>
            <List size="sm" spacing={2}>
                {holders.map((h, i) => (
                    <List.Item key={`${h.node_id}-${h.via}-${i}`}>
                        {h.name} <Text span size="xs" c="dimmed">
                            ({t(`projects.catalog.kind_${h.kind}`)}, {t(`projects.catalog.via_${h.via}`)})
                        </Text>
                    </List.Item>
                ))}
            </List>
        </Stack>
    );
}

// OpenStackState: who OpenStack grants it to now. Projects of this portal are
// what the reconciler still has to revoke; others were granted by hand and are
// shown only so nobody is surprised they stay.
function OpenStackState({ state }) {
    const { t } = useTranslation();
    if (!state) return <Text size="xs" c="dimmed">{t('projects.catalog.noOpenStack')}</Text>;
    if (state.error) return <Text size="sm" c="red">{t('projects.catalog.openstackError', { error: state.error })}</Text>;
    return (
        <Stack gap={4}>
            <Text size="sm" fw={600}>{t('projects.catalog.openstackTitle')}</Text>
            {state.managed.length === 0 && state.unmanaged.length === 0 ? (
                <Text size="sm" c="dimmed">{t('projects.catalog.openstackNone')}</Text>
            ) : null}
            {state.managed.length > 0 && (
                <>
                    <Text size="sm">{t('projects.catalog.openstackManaged', { count: state.managed.length })}</Text>
                    <List size="sm" spacing={2}>
                        {state.managed.map(h => <List.Item key={h.node_id}>{h.name}</List.Item>)}
                    </List>
                </>
            )}
            {state.unmanaged.length > 0 && (
                <Text size="xs" c="dimmed">
                    {t('projects.catalog.openstackUnmanaged', { count: state.unmanaged.length })}{' '}
                    <Text span ff="monospace" size="xs">{state.unmanaged.join(', ')}</Text>
                </Text>
            )}
        </Stack>
    );
}
