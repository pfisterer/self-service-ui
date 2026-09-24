import { useQuery } from '@tanstack/react-query';
import { Alert, Stack, Text, Tooltip } from '@mantine/core';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useZonesApi } from '/dyndns/api-zones.jsx';
import { dyndnsKeys } from '/dyndns/query-keys.js';
import { groupZoneEventsByZone, worstZoneEventColor, zoneEventColor, zoneEventTimeline } from '/dyndns/zone-events.js';

// Zone events in the UI: a small indicator on the zone list and a banner on
// the zone detail, both fed by ONE shared query (same key -> one request).
//
// The events are best-effort context, not primary data: if the query fails or
// is still loading, both components render nothing rather than an error — a
// broken events feed must never make the zone page look broken.

// useZoneEventsQuery is the one query behind every zone-events surface
// (list indicator, zone banner, admin table) — same key, one request. The
// server scopes the answer: owners get their zones' events, super-admins all.
export function useZoneEventsQuery() {
    const api = useZonesApi();
    return useQuery({
        queryKey: dyndnsKeys.zoneEvents(),
        queryFn: () => api.listZoneEvents(),
        enabled: !!api,
        // A problem that appears (or resolves) while the tab is open should
        // show up without a reload; a minute of lag is fine.
        refetchInterval: 60_000,
        retry: 1,
    });
}

export function useZoneEvents() {
    const query = useZoneEventsQuery();
    return groupZoneEventsByZone(query.data);
}

// ZoneEventIndicator is the small warning triangle next to a zone's name in
// the list. Icon only — the full story is on the zone's page.
export function ZoneEventIndicator({ events }) {
    const { t } = useTranslation();
    if (!events?.length) return null;
    // A single event shows the platform's own message (server data); only the
    // fallback and the "several of them" case are ours to phrase.
    const label = events.length === 1
        ? events[0].message || t('dyndns.events.indicatorFallback')
        : t('dyndns.events.indicatorCount', { problems: events.length });
    return (
        <Tooltip label={label}>
            <AlertTriangle
                size="15"
                color={`var(--mantine-color-${worstZoneEventColor(events)}-7)`}
                style={{ flexShrink: 0 }}
                aria-label={t('dyndns.events.indicatorAria')}
            />
        </Tooltip>
    );
}

// ZoneEventsBanner renders one alert per event on the zone detail page.
export function ZoneEventsBanner({ events }) {
    const { t, i18n } = useTranslation();
    if (!events?.length) return null;
    return (
        <Stack gap="xs">
            {events.map(ev => (
                <Alert
                    key={`${ev.source}/${ev.class}`}
                    icon={<AlertTriangle size="16" />}
                    color={zoneEventColor(ev.severity)}
                    title={ev.message || t('dyndns.events.problemDetected', { class: ev.class })}
                >
                    <Stack gap={4}>
                        {ev.detail && ev.detail !== ev.message && (
                            <Text size="sm">{ev.detail}</Text>
                        )}
                        <Text size="xs" c="dimmed">{zoneEventTimeline(ev, t, i18n.language)}</Text>
                        <Text size="xs" c="dimmed">{t('dyndns.events.reportedBy', { source: ev.source })}</Text>
                    </Stack>
                </Alert>
            ))}
        </Stack>
    );
}
