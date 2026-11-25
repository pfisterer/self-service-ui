import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Checkbox, Container, Group, Loader, Paper, SegmentedControl, Stack, Switch, Table, Text, TextInput, Title } from '@mantine/core';
import { Bell } from 'lucide-react';
import { notificationsApi, notificationsKeys } from '/notifications/api.js';
import { formatDateTime } from '/format-date.js';

const CLASSES = ['action', 'disruption', 'info'];

// The person's notification settings (/settings/notifications, from the account menu): how each class of event reaches them, how often the summary comes, quiet hours, the language of the mails and the kinds of event they want no mail about. The notification service decides what is allowed (GET /v1/types names the modes per class) and keeps the defaults; this page only edits them. Every mail links here.
export function NotificationSettings() {
    const { t, i18n } = useTranslation();
    const lang = i18n.resolvedLanguage || 'de';
    const qc = useQueryClient();
    const prefs = useQuery({ queryKey: notificationsKeys.preferences(), queryFn: notificationsApi.getPreferences });
    const types = useQuery({ queryKey: notificationsKeys.types(lang), queryFn: notificationsApi.getTypes });
    // The edits so far; null = what the service holds.
    const [edits, setEdits] = useState(null);
    const draft = edits ?? prefs.data;
    const save = useMutation({
        mutationFn: (p) => notificationsApi.putPreferences(p),
        onSuccess: (saved) => {
            qc.setQueryData(notificationsKeys.preferences(), saved);
            setEdits(null);
        },
    });

    if (prefs.isLoading || types.isLoading) {
        return <Container size="md" py="md"><Loader size="sm" /></Container>;
    }
    if (prefs.error || types.error) {
        return (
            <Container size="md" py="md">
                <Alert color="red" title={t('notifications.loadFailed')}>{(prefs.error || types.error).message}</Alert>
            </Container>
        );
    }

    const set = (patch) => { save.reset(); setEdits({ ...draft, ...patch }); };
    const setClass = (c, mode) => set({ classes: { ...draft.classes, [c]: mode } });
    const setQuiet = (patch) => set({ quiet_hours: { ...draft.quiet_hours, ...patch } });
    const unsubscribed = new Set(draft.unsubscribed ?? []);
    const toggleType = (type, wanted) => {
        const next = new Set(unsubscribed);
        if (wanted) next.delete(type); else next.add(type);
        set({ unsubscribed: [...next].sort() });
    };
    const modes = types.data?.modes ?? {};
    const dirty = JSON.stringify(strip(draft)) !== JSON.stringify(strip(prefs.data));

    return (
        <Container size="md" py="md">
            <Stack gap="md">
                <div>
                    <Group gap="xs"><Bell size={22} /><Title order={2}>{t('notifications.title')}</Title></Group>
                    <Text c="dimmed" size="sm">{t('notifications.intro', { address: draft.recipient })}</Text>
                    {draft.is_default && <Text c="dimmed" size="sm">{t('notifications.defaults')}</Text>}
                </div>

                <Paper withBorder radius="md" p="md">
                    <Stack gap="sm">
                        <Text fw={700}>{t('notifications.classes.title')}</Text>
                        {CLASSES.map(c => (
                            <Group key={c} justify="space-between" align="flex-start" wrap="wrap">
                                <div style={{ flex: '1 1 16rem' }}>
                                    <Text size="sm" fw={600}>{t(`notifications.classes.${c}.label`)}</Text>
                                    <Text size="xs" c="dimmed">{t(`notifications.classes.${c}.text`)}</Text>
                                </div>
                                <SegmentedControl size="xs" value={draft.classes?.[c]} onChange={(m) => setClass(c, m)}
                                    data={(modes[c] ?? []).map(m => ({ value: m, label: t(`notifications.modes.${m}`) }))} />
                            </Group>
                        ))}
                    </Stack>
                </Paper>

                <Paper withBorder radius="md" p="md">
                    <Stack gap="sm">
                        <Text fw={700}>{t('notifications.digest.title')}</Text>
                        <Text size="xs" c="dimmed">{t('notifications.digest.text')}</Text>
                        <SegmentedControl size="xs" w="fit-content" value={draft.digest} onChange={(d) => set({ digest: d })}
                            data={[{ value: 'daily', label: t('notifications.digest.daily') }, { value: 'weekly', label: t('notifications.digest.weekly') }]} />
                    </Stack>
                </Paper>

                <Paper withBorder radius="md" p="md">
                    <Stack gap="sm">
                        <Switch checked={!!draft.quiet_hours?.enabled} onChange={(e) => setQuiet({ enabled: e.currentTarget.checked })}
                            label={<Text fw={700}>{t('notifications.quiet.title')}</Text>} />
                        <Text size="xs" c="dimmed">{t('notifications.quiet.text')}</Text>
                        <Group gap="sm">
                            <TextInput type="time" size="xs" label={t('notifications.quiet.from')} value={draft.quiet_hours?.start ?? ''} disabled={!draft.quiet_hours?.enabled}
                                onChange={(e) => setQuiet({ start: e.currentTarget.value })} />
                            <TextInput type="time" size="xs" label={t('notifications.quiet.to')} value={draft.quiet_hours?.end ?? ''} disabled={!draft.quiet_hours?.enabled}
                                onChange={(e) => setQuiet({ end: e.currentTarget.value })} />
                        </Group>
                        <Checkbox size="xs" checked={!!draft.quiet_hours?.weekends} disabled={!draft.quiet_hours?.enabled}
                            onChange={(e) => setQuiet({ weekends: e.currentTarget.checked })} label={t('notifications.quiet.weekends')} />
                    </Stack>
                </Paper>

                <Paper withBorder radius="md" p="md">
                    <Stack gap="sm">
                        <Text fw={700}>{t('notifications.language.title')}</Text>
                        <SegmentedControl size="xs" w="fit-content" value={draft.language} onChange={(l) => set({ language: l })}
                            data={[{ value: 'de', label: 'Deutsch' }, { value: 'en', label: 'English' }]} />
                    </Stack>
                </Paper>

                <Paper withBorder radius="md" p="md">
                    <Stack gap="xs">
                        <Text fw={700}>{t('notifications.types.title')}</Text>
                        <Text size="xs" c="dimmed">{t('notifications.types.text')}</Text>
                        {(types.data?.types ?? []).map(ty => (
                            <Checkbox key={ty.type} size="sm" checked={!unsubscribed.has(ty.type)} onChange={(e) => toggleType(ty.type, e.currentTarget.checked)}
                                label={<Group gap={6}>{ty.name}<Badge size="xs" variant="light" color="gray">{t(`notifications.classes.${ty.class}.short`)}</Badge></Group>} />
                        ))}
                        {/* Kinds unsubscribed from by a mail's link that have no text of their own here. */}
                        {[...unsubscribed].filter(u => !(types.data?.types ?? []).some(ty => ty.type === u)).map(u => (
                            <Checkbox key={u} size="sm" checked={false} onChange={(e) => toggleType(u, e.currentTarget.checked)} label={u} />
                        ))}
                    </Stack>
                </Paper>

                {save.error && <Alert color="red">{save.error.message}</Alert>}
                <Group>
                    <Button onClick={() => save.mutate(strip(draft))} loading={save.isPending} disabled={!dirty}>{t('notifications.save')}</Button>
                    {save.isSuccess && !dirty && <Text size="sm" c="green">{t('notifications.saved')}</Text>}
                </Group>

                <Recent />
            </Stack>
        </Container>
    );
}

// The fields the service accepts on PUT, without what it adds to its answer.
function strip(p) {
    if (!p) return p;
    const { language, classes, digest, quiet_hours, unsubscribed } = p;
    return { language, classes, digest, quiet_hours, unsubscribed: [...(unsubscribed ?? [])].sort() };
}

// The latest notifications, so a person can see what was sent and why nothing came.
function Recent() {
    const { t, i18n } = useTranslation();
    const lang = i18n.resolvedLanguage || 'de';
    const recent = useQuery({ queryKey: notificationsKeys.recent(lang), queryFn: () => notificationsApi.getRecent(20) });
    if (recent.isLoading) return null;
    if (recent.error) return <Alert color="red">{recent.error.message}</Alert>;
    const rows = recent.data ?? [];
    return (
        <Paper withBorder radius="md" p="md">
            <Stack gap="xs">
                <Text fw={700}>{t('notifications.recent.title')}</Text>
                {rows.length === 0 ? <Text size="sm" c="dimmed">{t('notifications.recent.none')}</Text> : (
                    <Table.ScrollContainer minWidth={480}>
                        <Table verticalSpacing={4} fz="sm">
                            <Table.Tbody>
                                {rows.map(n => (
                                    <Table.Tr key={n.id}>
                                        <Table.Td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(n.created_at)}</Table.Td>
                                        <Table.Td>{n.url ? <a href={n.url}>{n.title}</a> : n.title}</Table.Td>
                                        <Table.Td><Badge size="xs" variant="light" color={n.status === 'failed' ? 'red' : 'gray'}>{t(`notifications.recent.status.${n.status}`, { defaultValue: n.status })}</Badge></Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                )}
            </Stack>
        </Paper>
    );
}
