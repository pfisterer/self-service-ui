import { useMemo, useState } from 'react';
import { Alert, ActionIcon, Badge, Group, Paper, Table, Text, TextInput, Tooltip } from '@mantine/core';
import { AlertTriangle, Mail, Search, X } from 'lucide-react';
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
            <Alert icon={<AlertTriangle size="16" />} color="red" title="Could not load zone events">
                {String(eventsQuery.error?.message ?? eventsQuery.error)}
            </Alert>
        );
    }

    return (
        <Paper p="md" withBorder>
            <Group justify="space-between" mb="md" wrap="wrap">
                <Text fw={600}>Active zone events ({events.length})</Text>
                <TextInput
                    placeholder="Filter by zone, class, message, owner…"
                    leftSection={<Search size={14} />}
                    rightSection={filter ? (
                        <ActionIcon variant="subtle" color="gray" onClick={() => setFilter('')} aria-label="clear filter">
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
                        ? 'No active zone events — no client is currently failing against any zone.'
                        : 'No events match the filter.'}
                </Text>
            ) : (
                <Table.ScrollContainer minWidth={760}>
                    <Table striped highlightOnHover>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>Zone</Table.Th>
                                <Table.Th>Problem</Table.Th>
                                <Table.Th>Seen</Table.Th>
                                <Table.Th>Owners</Table.Th>
                                <Table.Th></Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {filtered.map(ev => {
                                const mailto = zoneEventMailto(ev);
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
                                            <Text size="xs" c="dimmed">{zoneEventTimeline(ev)}</Text>
                                            <Text size="xs" c="dimmed">via {ev.source}</Text>
                                        </Table.Td>
                                        <Table.Td style={{ wordBreak: 'break-word', maxWidth: 220 }}>
                                            <Text size="sm">{(ev.owners ?? []).join(', ') || '—'}</Text>
                                        </Table.Td>
                                        <Table.Td>
                                            {mailto && (
                                                <Tooltip label="E-Mail an die Besitzer, Fehlermeldung vorausgefüllt">
                                                    <ActionIcon component="a" href={mailto} variant="light" aria-label="mail the owners">
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
