import { useTranslation } from 'react-i18next';
import { Anchor, Badge, Group, Stack, Text } from '@mantine/core';
import { formatDate } from '/format-date.js';

// What the AI service found about the image a project runs: its download size, the warnings of its checks (root or another user, HOME elsewhere, own entrypoint, jupyterhub-singleuser not recognisable, large; written by the service in German) and Harbor's vulnerability scan. Nothing of it blocks; it says why a start may fail or take long.

// formatSize writes bytes as gigabytes with one decimal in the reader's language ("2,0 GB" / "2.0 GB"), below one gigabyte as whole megabytes ("160 MB"); '' when unknown.
export function formatSize(bytes, language = 'de') {
    if (!(bytes > 0)) return '';
    const locale = language === 'de' ? 'de-DE' : 'en-GB';
    if (bytes < 1e9) return Math.max(1, Math.round(bytes / 1e6)).toLocaleString(locale) + ' MB';
    return (bytes / 1e9).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' GB';
}

// scanState sorts Harbor's scan into what the badge shows: done (with counts and a colour by the worst severity), running, failed; null without a scan.
export function scanState(scan) {
    if (!scan?.status) return null;
    if (scan.status === 'Success') {
        const critical = scan.critical ?? 0, high = scan.high ?? 0;
        return { kind: 'done', critical, high, color: critical > 0 ? 'red' : high > 0 ? 'orange' : 'teal' };
    }
    if (['Error', 'Stopped'].includes(scan.status)) return { kind: 'failed', color: 'gray' };
    return { kind: 'running', color: 'gray' };
}

export function ImageFacts({ project }) {
    const { t, i18n } = useTranslation();
    if (!project) return null;
    const size = formatSize(project.image_size, i18n.language);
    const warnings = project.image_warnings ?? [];
    const scan = scanState(project.image_scan);
    if (!size && warnings.length === 0 && !scan) return null;
    return (
        <Stack gap={2}>
            {size && <Text size="xs" c="dimmed">{t('gpu.projects.image.size', { size })}</Text>}
            {warnings.map(w => <Text key={w} size="xs" c="orange">{w}</Text>)}
            {scan && (
                <Group gap="xs" wrap="wrap">
                    <Badge variant="light" color={scan.color} style={{ textTransform: 'none' }}>
                        {scan.kind === 'done' ? t('gpu.projects.image.scanDone', { critical: scan.critical, high: scan.high }) : t(`gpu.projects.image.scan_${scan.kind}`)}
                    </Badge>
                    {scan.kind === 'done' && project.image_scan.scanned_at && <Text size="xs" c="dimmed">{t('gpu.projects.image.scanAt', { date: formatDate(project.image_scan.scanned_at) })}</Text>}
                    {project.image_scan.url && <Anchor size="xs" href={project.image_scan.url} target="_blank" rel="noreferrer">{t('gpu.projects.image.scanLink')}</Anchor>}
                </Group>
            )}
        </Stack>
    );
}
