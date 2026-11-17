import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Group, Modal, Paper, Stack, Text } from '@mantine/core';
import { Users } from 'lucide-react';
import { useGpuApi } from '/gpu/api-gpu.jsx';
import { choosing, seatState, tokenLabel } from '/gpu/groups.js';

// GroupChoices shows, for each project where joining a group is open to the person, its groups: how full each is, which one is theirs with its members (the members of the other groups are not shown, the service does not send them), and the way to join one. Joining is binding (no leaving or switching by oneself, the project's managers change it), so it asks first. After joining, the projects are loaded again (gpu projects query).
export function GroupChoices({ projects }) {
    const list = choosing(projects);
    if (list.length === 0) return null;
    return <Stack gap="sm">{list.map(p => <GroupChoice key={p.slug} project={p} />)}</Stack>;
}

function GroupChoice({ project }) {
    const { t } = useTranslation();
    const api = useGpuApi();
    const queryClient = useQueryClient();
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState('');
    // asking is the group whose joining is being confirmed.
    const [asking, setAsking] = useState(null);
    const seats = project.group_seats ?? [];
    const join = async (seat) => {
        setAsking(null); setBusy(seat.id); setError('');
        try {
            await api.joinGroup(project.slug, seat.id);
        } catch (e) {
            setError(e.message);
        } finally {
            await queryClient.invalidateQueries({ queryKey: ['gpu', 'projects'] });
            setBusy(null);
        }
    };
    return (
        <Paper withBorder radius="md" p="md">
            <Group gap="xs" mb={4}>
                <Users size={16} />
                <Text fw={700} size="sm">{t('gpu.groupChoice.title', { project: project.name || project.slug })}</Text>
            </Group>
            <Text size="xs" c="dimmed" mb="sm">{t('gpu.groupChoice.intro')}</Text>
            {seats.length === 0 && <Text size="sm">{t('gpu.groupChoice.none')}</Text>}
            <Stack gap={6}>
                {seats.map(seat => {
                    const state = seatState(seat, seats);
                    return (
                        <Paper key={seat.id} withBorder radius="sm" p="xs" bg={state === 'mine' ? 'var(--mantine-color-teal-light)' : undefined}>
                            <Group justify="space-between" wrap="nowrap" gap="sm">
                                <div style={{ minWidth: 0 }}>
                                    <Group gap={6}>
                                        <Text size="sm" fw={600}>{seat.name}</Text>
                                        {state === 'mine' && <Badge size="xs" color="teal" variant="light">{t('gpu.groupChoice.mine')}</Badge>}
                                        {state === 'full' && <Badge size="xs" color="gray" variant="light">{t('gpu.groupChoice.full')}</Badge>}
                                    </Group>
                                    <Text size="xs" c="dimmed">{seat.max > 0 ? t('gpu.groupChoice.places', { count: seat.count, max: seat.max }) : t('gpu.groupChoice.people', { count: seat.count })}</Text>
                                    {state === 'mine' && (seat.members ?? []).length > 0 && (
                                        <Text size="xs" c="dimmed">{t('gpu.groupChoice.members', { names: seat.members.map(tokenLabel).join(', ') })}</Text>
                                    )}
                                </div>
                                {state !== 'mine' && (
                                    <Button size="xs" variant="light" loading={busy === seat.id} disabled={busy !== null || state !== 'open'} onClick={() => setAsking(seat)}>{t('gpu.groupChoice.join')}</Button>
                                )}
                            </Group>
                        </Paper>
                    );
                })}
            </Stack>
            {error && <Alert mt="sm" color="red" variant="light">{error}</Alert>}
            <Modal opened={!!asking} onClose={() => setAsking(null)} title={t('gpu.groupChoice.confirmTitle', { name: asking?.name ?? '' })} size="md">
                <Text size="sm">{t('gpu.groupChoice.confirmText')}</Text>
                <Group justify="flex-end" mt="md" gap="sm">
                    <Button variant="default" onClick={() => setAsking(null)}>{t('gpu.groupChoice.cancel')}</Button>
                    <Button onClick={() => join(asking)}>{t('gpu.groupChoice.join')}</Button>
                </Group>
            </Modal>
        </Paper>
    );
}
