import { useMemo, useState } from 'react';
import { Alert, ActionIcon, Badge, Group, Paper, Table, Text, TextInput, Tooltip } from '@mantine/core';
import { AlertTriangle, Mail, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useZoneEventsQuery } from '/dyndns/zones/zone-events-banner.jsx';
import { zoneEventColor, zoneEventMailto, zoneEventTimeline } from '/dyndns/zone-events.js';

// The super-admin view of ALL active zone events (the server decides the
// scope: for super-admins the same query returns every zone's events).
//
// No pagination, on purpose: the store holds one row per source+class+zone,
// so the worst case is on the order of the zone count — dozens, not an
// unbounded log. A search box covers the "many zones" case the same way the
// policy-rules list does. If this table ever feels slow, the fix is upstream
// (why are there hundreds of DISTINCT problems?), not paging through them.
export function ZoneEventsAdminPanel() {
    const { t, i18n } = useTranslation();
    const eventsQuery = useZoneEventsQuery();
    const [filter, setFilter] = useState('');

    const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);
    const filtered = useMemo(() => {
        const term = filter.trim().toLowerCase();
        if (!term) return events;
        return events.filter(ev =>
            ev.zone?.toLowerCase().includes(term)
            || ev.class?.toLowerCase().includes(term)
            || ev.message?.toLowerCase().includes(term)
            || (ev.owners ?? []).some(o => o.toLowerCase().includes(term)));
    }, [events, filter]);

    if (eventsQuery.isError) {
        return (
            <Alert icon={<AlertTriangle size="16" />} color="red" title={t('dyndns.eventsAdmin.loadError')}>
                {String(eventsQuery.error?.message ?? eventsQuery.error)}
            </Alert>
        );
    }

    return (
        <Paper p="md" withBorder>
            <Group justify="space-between" mb="md" wrap="wrap">
                <Text fw={600}>{t('dyndns.eventsAdmin.title', { events: events.length })}</Text>
                <TextInput
                    placeholder={t('dyndns.eventsAdmin.filterPlaceholder')}
                    leftSection={<Search size={14} />}
                    rightSection={filter ? (
                        <ActionIcon variant="subtle" color="gray" onClick={() => setFilter('')} aria-label={t('dyndns.eventsAdmin.clearFilter')}>
                            <X size={14} />
                        </ActionIcon>
                    ) : null}
                    value={filter}
                    onChange={e => setFilter(e.currentTarget.value)}
                    w={{ base: '100%', sm: 320 }}
                />
            </Group>

            {filtered.length === 0 ? (
                <Text c="dimmed" size="sm">
                    {events.length === 0
                        ? t('dyndns.eventsAdmin.none')
                        : t('dyndns.eventsAdmin.noMatch')}
                </Text>
            ) : (
                <Table.ScrollContainer minWidth={760}>
                    <Table striped highlightOnHover>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>{t('dyndns.eventsAdmin.colZone')}</Table.Th>
                                <Table.Th>{t('dyndns.eventsAdmin.colProblem')}</Table.Th>
                                <Table.Th>{t('dyndns.eventsAdmin.colSeen')}</Table.Th>
                                <Table.Th>{t('dyndns.eventsAdmin.colOwners')}</Table.Th>
                                <Table.Th></Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {filtered.map(ev => {
                                const mailto = zoneEventMailto(ev, t, i18n.language);
                                return (
                                    <Table.Tr key={`${ev.source}/${ev.class}/${ev.zone}`}>
                                        <Table.Td style={{ wordBreak: 'break-word', maxWidth: 280 }}>
                                            <Text size="sm">{ev.zone}</Text>
                                        </Table.Td>
                                        <Table.Td style={{ maxWidth: 320 }}>
                                            <Group gap={6} wrap="nowrap" align="flex-start">
                                                <Badge color={zoneEventColor(ev.severity)} variant="light" size="sm" style={{ flexShrink: 0 }}>
                                                    {ev.class}
                                                </Badge>
                                            </Group>
                                            <Tooltip label={ev.detail || ev.message} multiline w={360} disabled={!ev.detail && !ev.message}>
                                                <Text size="xs" c="dimmed" lineClamp={2} mt={4}>{ev.message}</Text>
                                            </Tooltip>
                                        </Table.Td>
                                        <Table.Td>
                                            <Text size="xs" c="dimmed">{zoneEventTimeline(ev, t, i18n.language)}</Text>
                                            <Text size="xs" c="dimmed">{t('dyndns.eventsAdmin.viaSource', { source: ev.source })}</Text>
                                        </Table.Td>
                                        <Table.Td style={{ wordBreak: 'break-word', maxWidth: 220 }}>
                                            <Text size="sm">{(ev.owners ?? []).join(', ') || '—'}</Text>
                                        </Table.Td>
                                        <Table.Td>
                                            {mailto && (
                                                <Tooltip label={t('dyndns.eventsAdmin.mailTooltip')}>
                                                    <ActionIcon component="a" href={mailto} variant="light" aria-label={t('dyndns.eventsAdmin.mailAria')}>
                                                        <Mail size={16} />
                                                    </ActionIcon>
                                                </Tooltip>
                                            )}
                                        </Table.Td>
                                    </Table.Tr>
                                );
                            })}
                        </Table.Tbody>
                    </Table>
                </Table.ScrollContainer>
            )}
        </Paper>
    );
}
