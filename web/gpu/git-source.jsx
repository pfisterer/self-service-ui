import { useTranslation } from 'react-i18next';
import { Group, TextInput } from '@mantine/core';

// GitSource is a Git repository with its ref, the way every Git field of a project takes it: the environment built from Git and the course material (workspace-settings.jsx). value is { url, ref }; refLabel says which refs the field takes (a build takes branches, tags and commits, the material only branches). A private repository is reached with the project's access to its host (credentials.jsx), for the build as for the material.
export function GitSource({ value, onChange, refLabel, readOnly }) {
    const { t } = useTranslation();
    const { url = '', ref = '' } = value ?? {};
    return (
        <Group gap="xs" wrap="nowrap" align="flex-end">
            <TextInput style={{ flex: 1 }} label={t('gpu.projects.git.url')} placeholder="https://github.com/…/kurs" value={url} readOnly={readOnly}
                onChange={e => onChange({ url: e.currentTarget.value.trim(), ref })} />
            <TextInput w={160} label={refLabel ?? t('gpu.projects.git.ref')} placeholder={t('gpu.projects.git.refPlaceholder')} value={ref} readOnly={readOnly}
                onChange={e => onChange({ url, ref: e.currentTarget.value.trim() })} />
        </Group>
    );
}
