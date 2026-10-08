import { Box, Text, Tooltip } from '@mantine/core';
import { Activity, Box as BoxIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { UNLIMITED_QUOTA, isAvailability, resourceSummaryText, resourceUsageText } from './util-project.jsx';

// ProjectResources: what a project was granted and, where the reconciler has
// measured it, what of that is in use right now — "72 / 80 Cores · 3 VMs".
// The measurement is refreshed on every reconciler pass, so it is minutes old
// at most.
//
// `compact` is the table form: a small grid with one column per resource,
// reserved on the first line and in use on the second (see ResourceGrid).
export function ProjectResources({ node, resources, quota, size = 'xs', compact = false }) {
    const { t } = useTranslation();
    const measured = !!node?.os_in_use;
    const servers = node?.os_servers;
    const serversText = servers === undefined || servers === null ? null
        : servers === 0 ? t('projects.resources.noServers') : t('projects.resources.servers', { count: servers });

    if (compact) {
        return <ResourceGrid node={node} resources={resources} quota={quota} servers={servers} />;
    }

    const text = measured
        ? resourceUsageText(resources, quota, node.os_in_use)
        : resourceSummaryText(resources, quota);
    if (!text && !serversText) return null;
    return (
        <div>
            {text && (
                measured ? (
                    <Tooltip label={t('projects.resources.usedOfGranted')} openDelay={400}>
                        <Text size={size} span>{text}</Text>
                    </Tooltip>
                ) : <Text size={size}>{text}</Text>
            )}
            {serversText && <Text size={size} c="dimmed">{serversText}</Text>}
        </div>
    );
}

// ResourceGrid lays the quantities out like a small table, so reserved and in
// use stand under each other and can be compared at a glance:
//
//            Cores  RAM GB  Storage GB  VMs
//   [box]       12      48         300
//   [pulse]      0       0           0    0
//
// The unit goes into the heading, so the cells are bare numbers that line up.
// The second line appears only once the reconciler has measured the project;
// a resource OpenStack does not measure stays empty there, never 0.
// Availabilities have no amount and follow as names below the grid.
function ResourceGrid({ node, resources, quota, servers }) {
    const { t } = useTranslation();
    if (!resources || !quota) return null;
    const granted = resources.filter(r => (quota[r.id] ?? 0) !== 0);
    const counts = granted.filter(r => !isAvailability(r));
    const availabilities = granted.filter(isAvailability);
    const inUse = node?.os_in_use;
    const measured = !!inUse;
    const showServers = measured && servers !== undefined && servers !== null;
    if (!counts.length && !availabilities.length) return null;

    const cols = counts.length + (showServers ? 1 : 0);
    const cell = { textAlign: 'right', whiteSpace: 'nowrap' };
    const head = (label) => (
        <Text size="10px" c="dimmed" style={{ ...cell, lineHeight: 1.3 }}>{label}</Text>
    );
    const value = (v) => <Text size="xs" style={cell}>{v}</Text>;
    const rowIcon = (Icon, label) => (
        <Tooltip label={label} openDelay={300}>
            <Box style={{ display: 'flex', alignItems: 'center', color: 'var(--mantine-color-gray-6)' }}>
                <Icon size={12} aria-label={label} />
            </Box>
        </Tooltip>
    );

    return (
        <div>
            {counts.length > 0 && (
                <Box style={{
                    display: 'inline-grid',
                    gridTemplateColumns: `auto repeat(${cols}, auto)`,
                    columnGap: 10,
                    rowGap: 1,
                    alignItems: 'center',
                }}>
                    <span />
                    {counts.map(r => <span key={r.id}>{head(r.unit ? `${r.name} ${r.unit}` : r.name)}</span>)}
                    {showServers && head(t('projects.resources.vms'))}

                    {rowIcon(BoxIcon, t('projects.resources.reserved'))}
                    {counts.map(r => (
                        <span key={r.id}>{value(quota[r.id] === UNLIMITED_QUOTA ? '∞' : quota[r.id])}</span>
                    ))}
                    {showServers && <span />}

                    {measured && rowIcon(Activity, t('projects.resources.inUse'))}
                    {measured && counts.map(r => (
                        <span key={r.id}>{inUse[r.id] === undefined ? <span /> : value(inUse[r.id])}</span>
                    ))}
                    {showServers && value(servers)}
                </Box>
            )}
            {availabilities.length > 0 && (
                <Text size="xs" c="dimmed" mt={2}>{availabilities.map(r => r.name).join(' · ')}</Text>
            )}
        </div>
    );
}
