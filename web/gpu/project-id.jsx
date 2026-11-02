import { useTranslation } from 'react-i18next';
import { ActionIcon, Code, Group, Text, Tooltip } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { Check, Copy } from 'lucide-react';

// ProjectId shows a workspace project's id (its slug, t-…) with a copy button: what the dhbw-cloud CLI takes as --project and what the self-service shows nowhere else.
export function ProjectId({ slug, ...props }) {
    const { t } = useTranslation();
    const clipboard = useClipboard({ timeout: 1500 });
    if (!slug) return null;
    return (
        <Group gap={6} wrap="nowrap" {...props}>
            <Text size="xs" c="dimmed">{t('gpu.projectId.label')}:</Text>
            <Code>{slug}</Code>
            <Tooltip withArrow label={clipboard.copied ? t('gpu.projectId.copied') : t('gpu.projectId.copy')}>
                <ActionIcon size="sm" variant="subtle" color={clipboard.copied ? 'teal' : 'gray'} aria-label={t('gpu.projectId.copy')} onClick={() => clipboard.copy(slug)}>
                    {clipboard.copied ? <Check size={14} /> : <Copy size={14} />}
                </ActionIcon>
            </Tooltip>
        </Group>
    );
}
