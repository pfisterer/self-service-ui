import { Fragment } from 'react';
import { Text, Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { resourceSummaryText, resourceUsageItems, resourceUsageText } from './util-project.jsx';

// ProjectResources: what a project was granted and, where the reconciler has
// measured it, what of that is in use right now — "72 / 80 Cores · 3 VMs".
// The measurement is refreshed on every reconciler pass, so it is minutes old
// at most.
//
// `compact` is the table form: one short entry per resource that never breaks
// inside itself ("0/12 Cores"), the VM count as the last, quieter entry, so a
// row wraps between entries at most rather than through them.
export function ProjectResources({ node, resources, quota, size = 'xs', compact = false }) {
    const { t } = useTranslation();
    const measured = !!node?.os_in_use;
    const servers = node?.os_servers;
    const serversText = servers === undefined || servers === null ? null
        : servers === 0 ? t('projects.resources.noServers') : t('projects.resources.servers', { count: servers });

    if (compact) {
        const items = measured
            ? resourceUsageItems(resources, quota, node.os_in_use)
            : resourceUsageItems(resources, quota, null);
        if (!items.length && !serversText) return null;
        const body = (
            <Text size={size} lh={1.5}>
                {items.map((item, i) => (
                    <Fragment key={item}>
                        {i > 0 && <Text span inherit c="dimmed">{' · '}</Text>}
                        <span style={{ whiteSpace: 'nowrap' }}>{item}</span>
                    </Fragment>
                ))}
                {serversText && (
                    <Text span inherit c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                        {items.length ? ' · ' : ''}{serversText}
                    </Text>
                )}
            </Text>
        );
        return measured
            ? <Tooltip label={t('projects.resources.usedOfGranted')} openDelay={400}>{body}</Tooltip>
            : body;
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
