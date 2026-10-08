import { Text, Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { resourceSummaryText, resourceUsageText } from './util-project.jsx';

// ProjectResources: what a project was granted and, where the reconciler has
// measured it, what of that is in use right now — "72 / 80 Cores · 3 VMs".
// The measurement is refreshed on every reconciler pass, so it is minutes old
// at most. A project whose budget sees it run nothing is the one worth asking
// about, hence "no VM" stands out a little.
export function ProjectResources({ node, resources, quota, size = 'xs' }) {
    const { t } = useTranslation();
    const measured = !!node?.os_in_use;
    const text = measured
        ? resourceUsageText(resources, quota, node.os_in_use)
        : resourceSummaryText(resources, quota);
    const servers = node?.os_servers;
    if (!text && servers === undefined) return null;
    return (
        <div>
            {text && (
                measured ? (
                    <Tooltip label={t('projects.resources.usedOfGranted')} openDelay={300}>
                        <Text size={size} span>{text}</Text>
                    </Tooltip>
                ) : <Text size={size}>{text}</Text>
            )}
            {servers !== undefined && servers !== null && (
                <Text size={size} c={servers === 0 ? 'orange.8' : 'dimmed'}>
                    {servers === 0 ? t('projects.resources.noServers') : t('projects.resources.servers', { count: servers })}
                </Text>
            )}
        </div>
    );
}
