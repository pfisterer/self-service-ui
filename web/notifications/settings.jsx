import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Accordion, Alert, Badge, Button, Checkbox, Container, Group, Loader, Paper, SegmentedControl, Stack, Text, Title } from '@mantine/core';
import { Bell, ExternalLink } from 'lucide-react';
import { Link } from 'wouter';
import { notificationsApi, notificationsKeys } from '/notifications/api.js';
import { formatDateTime } from '/format-date.js';

const CLASSES = ['action', 'disruption', 'info'];

// The person's notification settings (/settings/notifications, from the account menu): how each class of event reaches them, how often the summary comes, the language of the mails and the kinds of event they want no mail about. The notification service decides what is allowed (GET /v1/types names the modes per class) and keeps the defaults; this page only edits them. Every mail links here.
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
    const { language, classes, digest, unsubscribed } = p;
    return { language, classes, digest, unsubscribed: [...(unsubscribed ?? [])].sort() };
}

// portalPath is url as a path inside this app when it points here (so the link navigates without reloading the page), else null.
export function portalPath(url) {
    try {
        const u = new URL(url, window.location.href);
        return u.origin === window.location.origin ? u.pathname + u.search + u.hash : null;
    } catch {
        return null;
    }
}

// The latest notifications, so a person can see what was sent and why nothing came. A click on one opens its text and the link to what it is about.
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
                    <Accordion variant="contained" chevronPosition="left">
                        {rows.map(n => {
                            const path = n.url ? portalPath(n.url) : null;
                            return (
                                <Accordion.Item key={n.id} value={String(n.id)}>
                                    <Accordion.Control>
                                        <Group justify="space-between" wrap="nowrap" gap="xs">
                                            <Text size="sm" style={{ minWidth: 0 }} truncate>{n.title}</Text>
                                            <Group gap={6} wrap="nowrap">
                                                <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>{formatDateTime(n.created_at)}</Text>
                                                <Badge size="xs" variant="light" color={n.status === 'failed' ? 'red' : 'gray'}>{t(`notifications.recent.status.${n.status}`, { defaultValue: n.status })}</Badge>
                                            </Group>
                                        </Group>
                                    </Accordion.Control>
                                    <Accordion.Panel>
                                        <Stack gap="xs">
                                            {n.text ? n.text.split('\n\n').map((p, i) => <Text key={i} size="sm">{p}</Text>) : null}
                                            {path ? (
                                                <Button component={Link} href={`~${path}`} size="xs" variant="light" w="fit-content">{t('notifications.recent.open')}</Button>
                                            ) : n.url ? (
                                                <Button component="a" href={n.url} target="_blank" rel="noopener noreferrer" size="xs" variant="light" w="fit-content" rightSection={<ExternalLink size={12} />}>{t('notifications.recent.open')}</Button>
                                            ) : null}
                                        </Stack>
                                    </Accordion.Panel>
                                </Accordion.Item>
                            );
                        })}
                    </Accordion>
                )}
            </Stack>
        </Paper>
    );
}
