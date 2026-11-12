import { Badge, Group, Progress, Stack, Text, Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '../format-date.js';
import { COLOR, UNLIMITED_QUOTA, USAGE_COLOR, isAvailability, resourceSummaryText, usageLevel, measuredUse, openstackSide, resourceLabel, resourceName, windowName } from './util-project.jsx';

// ProjectResources: what a project was granted and, where the reconciler has
// measured it, how much of that is in use right now — a bar per quantity, the
// VMs among them, and per availability whether anything uses it. The
// measurement is refreshed on every reconciler pass, so it is minutes old at
// most. Before the first measurement it is the plain summary line.

export function ProjectResources({ node, resources, quota, size = 'xs' }) {
    const { t } = useTranslation();
    const inUse = measuredUse(node);
    const errors = openstackSide(node).sync_errors;
    if (!inUse) {
        const text = resourceSummaryText(t, resources, quota);
        return (text || errors) ? (
            <Stack gap={6}>
                {text && <Text size={size}>{text}</Text>}
                <SyncErrorList resources={resources} errors={errors} />
            </Stack>
        ) : null;
    }

    const granted = (resources || []).filter(r => !isAvailability(r) && (quota?.[r.id] ?? 0) !== 0);
    // An amount per window is consumed rather than held: its bar has its own tooltip.
    const quantities = granted.filter(r => !r.window);
    const consumed = granted.filter(r => r.window);
    const os = openstackSide(node);
    const grantUse = os.grant_use;
    // Granted ones, and any that is used without being granted: that is the
    // one a reader most needs to see.
    const availabilities = (resources || []).filter(r => isAvailability(r) && (quota?.[r.id] === 1 || (grantUse?.[r.id] ?? 0) > 0));
    const servers = os.facts?.servers;

    return (
        <Stack gap={6}>
            <Tooltip label={t('projects.resources.usedOfGranted')} openDelay={600}>
                <Stack gap={6}>
                    {quantities.map(r => (
                        <UsageMeter key={r.id} label={resourceLabel(t, r)}
                            used={inUse[r.id]} limit={quota[r.id]} />
                    ))}
                    {typeof servers === 'number' && (
                        <UsageMeter label={t('projects.resources.vms')} used={servers} limit={os.facts?.server_limit} />
                    )}
                </Stack>
            </Tooltip>
            {consumed.map(r => (
                <Tooltip key={r.id} label={t('projects.resources.consumedOfGranted', { window: windowName(t, r.window) })} openDelay={600}>
                    <div>
                        <UsageMeter label={resourceLabel(t, r)} used={inUse[r.id]} limit={quota[r.id]} />
                    </div>
                </Tooltip>
            ))}
            {availabilities.length > 0 && (
                <Group gap={4} wrap="wrap">
                    {availabilities.map(r => (
                        <GrantUseBadge key={r.id} resource={r} granted={quota?.[r.id] === 1} count={grantUse?.[r.id]} syncError={errors?.[r.id]} />
                    ))}
                </Group>
            )}
            <SyncErrorList resources={resources} errors={errors} />
        </Stack>
    );
}

// syncErrors are what OpenStack refused for a project on the last sync, by resource id (openstackSide(node).sync_errors); empty while everything is in place.
// syncErrorText says it in words for the project's people: the reason, never the cloud's own message, which the admins read in the History tab (SyncErrorDetails). null without an error.
export function syncErrorText(t, resource, error) {
    if (!error) return null;
    const key = error.reason === 'over_quota' && error.kind === 'availability' && resource?.grant_type === 'network' ? 'over_quota_network' : error.reason;
    const reason = t(`projects.resources.syncReason.${key}`, { defaultValue: t('projects.resources.syncReason.failed') });
    return t('projects.resources.syncFailed', { reason });
}

// SyncErrorList is one red line per resource OpenStack refused, under the resources of a card or the inspect dialog: a switch that reads "granted" while the cloud says no is what the line is for.
function SyncErrorList({ resources, errors }) {
    const { t } = useTranslation();
    const failing = (resources || []).filter(r => errors?.[r.id]);
    if (!failing.length) return null;
    return (
        <Stack gap={2}>
            {failing.map(r => (
                <Text key={r.id} size="xs" c="red.8">{resourceLabel(t, r)}: {syncErrorText(t, r, errors[r.id])}</Text>
            ))}
        </Stack>
    );
}

// SyncErrorDetails is the same for the admins, in the History tab: per resource the reason, since when, and the cloud's own message.
export function SyncErrorDetails({ node, resources }) {
    const { t } = useTranslation();
    const errors = openstackSide(node).sync_errors;
    const ids = Object.keys(errors || {});
    if (!ids.length) return null;
    const byId = new Map((resources || []).map(r => [r.id, r]));
    return (
        <Stack gap={4}>
            <Text size="xs" fw={600} c="red.8">{t('projects.resources.syncProblems')}</Text>
            {ids.sort().map(id => {
                const e = errors[id];
                const r = byId.get(id);
                return (
                    <Stack key={id} gap={0}>
                        <Text size="xs">
                            {r ? resourceLabel(t, r) : id} · {e.kind} · {e.reason}
                            {e.since && <Text span size="xs" c="dimmed"> · {t('projects.resources.syncSince', { date: formatDateTime(e.since) })}</Text>}
                        </Text>
                        {e.detail && <Text size="xs" ff="monospace" c="dimmed" style={{ wordBreak: 'break-word' }}>{e.detail}</Text>}
                    </Stack>
                );
            })}
        </Stack>
    );
}

// UsageMeter is one quantity: what is in use of what is granted, as a bar. An
// unmeasured value shows the limit alone; no limit (or none known) leaves the
// bar out. Coloured by usageLevel, like the table: a hint from 80 %, a warning
// when everything is in use — or more, which OpenStack allows after a quota
// was lowered below what is running.
// Without a label it is the line under an input field; for an amount per window
// that line says it was consumed in the window.
export function UsageMeter({ label, used, limit, window }) {
    const { t } = useTranslation();
    const measured = typeof used === 'number';
    const capped = typeof limit === 'number' && limit !== UNLIMITED_QUOTA && limit >= 0;
    const limitText = capped ? limit : '∞';
    const pct = capped && measured ? (limit > 0 ? (used / limit) * 100 : (used > 0 ? 100 : 0)) : 0;
    const level = usageLevel(used, capped ? limit : null);
    const color = level && USAGE_COLOR[level];
    const text = measured
        ? (label ? `${used} / ${limitText}` : (window ? t('projects.resources.consumedOf', { used, limit: limitText, window: windowName(t, window) }) : t('projects.resources.usedOf', { used, limit: limitText })))
        : (label ? `${limitText}` : null);
    if (!label && !measured) return null;

    return (
        <Stack gap={2}>
            <Group justify="space-between" gap="xs" wrap="nowrap">
                {label && <Text size="xs">{label}</Text>}
                {text && <Text size="xs" c={color ? `${color}.8` : 'dimmed'} fw={color ? 600 : undefined}>{text}</Text>}
            </Group>
            {capped && measured && (
                <Progress size="xs" value={Math.min(pct, 100)} color={color || COLOR.info} />
            )}
        </Stack>
    );
}

// grantUseText says what uses an availability: servers for a flavour or an
// image, devices — servers, routers, load balancers — for a network. null
// while it has not been measured.
export function grantUseText(t, resource, count) {
    if (typeof count !== 'number') return null;
    if (count === 0) return t('projects.resources.grantUnused');
    return resource?.grant_type === 'network'
        ? t('projects.resources.grantDevices', { count })
        : t('projects.resources.grantServers', { count });
}

// GrantUseBadge is one availability on a card: in use (with how many), granted
// but unused (outlined), or in use WITHOUT being granted (red) — the state in
// which the reconciler tries to take something away that is still attached.
// Granted but refused by OpenStack (syncError) it is red as well, and says why.
function GrantUseBadge({ resource, granted, count, syncError }) {
    const { t } = useTranslation();
    const measured = typeof count === 'number';
    const used = measured && count > 0;
    const color = !granted || syncError ? COLOR.negative : used ? COLOR.info : 'gray';
    const tip = syncError ? syncErrorText(t, resource, syncError) : !granted ? t('projects.resources.grantUsedNotGranted') : grantUseText(t, resource, count);
    const badge = (
        <Badge size="xs" variant={measured && !used ? 'outline' : 'light'} color={color}>
            {used ? `${resourceName(t, resource)} · ${count}` : resourceName(t, resource)}
        </Badge>
    );
    return tip ? <Tooltip label={tip}>{badge}</Tooltip> : badge;
}
