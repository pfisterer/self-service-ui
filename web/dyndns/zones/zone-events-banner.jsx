import { useQuery } from '@tanstack/react-query';
import { Alert, Stack, Text, Tooltip } from '@mantine/core';
import { AlertTriangle } from 'lucide-react';
import { useZonesApi } from '/dyndns/api-zones.jsx';
import { dyndnsKeys } from '/dyndns/query-keys.js';
import { groupZoneEventsByZone, worstZoneEventColor, zoneEventColor, zoneEventTimeline } from '/dyndns/zone-events.js';

// Zone events in the UI: a small indicator on the zone list and a banner on
// the zone detail, both fed by ONE shared query (same key -> one request).
//
// The events are best-effort context, not primary data: if the query fails or
// is still loading, both components render nothing rather than an error — a
// broken events feed must never make the zone page look broken.

export function useZoneEvents() {
    const api = useZonesApi();
    const query = useQuery({
        queryKey: dyndnsKeys.zoneEvents(),
        queryFn: () => api.listZoneEvents(),
        enabled: !!api,
        // A problem that appears (or resolves) while the tab is open should
        // show up without a reload; a minute of lag is fine.
        refetchInterval: 60_000,
        retry: 1,
    });
    return groupZoneEventsByZone(query.data);
}

// ZoneEventIndicator is the small warning triangle next to a zone's name in
// the list. Icon only — the full story is on the zone's page.
export function ZoneEventIndicator({ events }) {
    if (!events?.length) return null;
    const label = events.length === 1
        ? events[0].message || 'There is a problem with this zone.'
        : `${events.length} problems with this zone.`;
    return (
        <Tooltip label={label}>
            <AlertTriangle
                size="15"
                color={`var(--mantine-color-${worstZoneEventColor(events)}-7)`}
                style={{ flexShrink: 0 }}
                aria-label="zone problem"
            />
        </Tooltip>
    );
}

// ZoneEventsBanner renders one alert per event on the zone detail page.
export function ZoneEventsBanner({ events }) {
    if (!events?.length) return null;
    return (
        <Stack gap="xs">
            {events.map(ev => (
                <Alert
                    key={`${ev.source}/${ev.class}`}
                    icon={<AlertTriangle size="16" />}
                    color={zoneEventColor(ev.severity)}
                    title={ev.message || `Problem detected (${ev.class})`}
                >
                    <Stack gap={4}>
                        {ev.detail && ev.detail !== ev.message && (
                            <Text size="sm">{ev.detail}</Text>
                        )}
                        <Text size="xs" c="dimmed">
                            {zoneEventTimeline(ev)} · reported by {ev.source}
                        </Text>
                    </Stack>
                </Alert>
            ))}
        </Stack>
    );
}
