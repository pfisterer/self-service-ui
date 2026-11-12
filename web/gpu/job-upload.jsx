import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Code, Group, Modal, SegmentedControl, Select, Stack, Text, TextInput } from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { File as FileIcon, Upload } from 'lucide-react';
import { useApiMutation } from '/helper/query-state.jsx';
import { useGpuApi } from '/gpu/api-gpu.jsx';
import { gpuKeys } from '/gpu/query-keys.js';
import { canWriteShared, formatBytes, SHARED_DIR, uploadErrors, uploadPath } from '/gpu/jobs.js';

// JobUploadModal puts a file into the person's home in a project or into its shared folder, for batch jobs without a workspace (todo job_files; the CLI's dhbw-cloud job upload). One file at a time; the service writes it through a short-lived pod, so the first upload takes a few seconds. fetch reports no upload progress, so the button shows the upload running. projects are the person's projects that allow jobs, project the one to start with.
export function JobUploadModal({ projects, project, opened, onClose }) {
    const { t } = useTranslation();
    const api = useGpuApi();
    const [slug, setSlug] = useState(project || projects[0]?.slug || '');
    const [target, setTarget] = useState('home');
    const [folder, setFolder] = useState('');
    const [file, setFile] = useState(null);
    const [done, setDone] = useState(null);
    const chosen = projects.find(p => p.slug === slug);
    // A reader only reads the shared folder: the choice is not offered.
    const shared = canWriteShared(chosen);
    const where = shared ? target : 'home';
    const errors = uploadErrors(t, { file, folder });
    const path = uploadPath(where, folder, file?.name);
    const upload = useApiMutation({
        mutationFn: () => api.uploadFile(slug, path, file),
        // An upload can change what a job's file list shows.
        invalidates: [gpuKeys.anyJob()],
        onSuccess: (written) => { setDone(written?.path ?? path); setFile(null); },
    });
    const valid = !!slug && Object.keys(errors).length === 0 && path !== null;

    return (
        <Modal opened={opened} onClose={upload.isPending ? () => {} : onClose} title={t('gpu.jobs.upload.title')} size="lg" centered>
            <Stack gap="sm">
                <Text size="sm" c="dimmed">{t('gpu.jobs.upload.intro')}</Text>
                <Select label={t('gpu.jobs.project')} value={slug || null} allowDeselect={false}
                    data={projects.map(p => ({ value: p.slug, label: p.name || p.slug }))}
                    onChange={(v) => { setSlug(v || ''); setDone(null); }} />
                {shared ? (
                    <div>
                        <Text size="sm" fw={500} mb={4}>{t('gpu.jobs.upload.target')}</Text>
                        <SegmentedControl size="xs" value={target} onChange={setTarget}
                            data={[{ value: 'home', label: t('gpu.jobs.upload.home') }, { value: 'shared', label: t('gpu.jobs.upload.shared', { dir: SHARED_DIR }) }]} />
                    </div>
                ) : (
                    <Text size="xs" c="dimmed">{t('gpu.jobs.upload.readerHomeOnly', { dir: SHARED_DIR })}</Text>
                )}
                <TextInput label={t('gpu.jobs.upload.folder')} description={t('gpu.jobs.upload.folderHint')} placeholder="jobs/training-1" value={folder}
                    onChange={(e) => setFolder(e.currentTarget.value)} error={errors.folder} />
                <Dropzone onDrop={(files) => { setFile(files[0] ?? null); setDone(null); }} multiple={false} disabled={upload.isPending}>
                    <Group justify="center" gap="md" mih={72} style={{ pointerEvents: 'none' }}>
                        {file ? <FileIcon size={28} strokeWidth={1.5} /> : <Upload size={28} strokeWidth={1.5} />}
                        <div>
                            <Text size="sm">{file ? `${file.name} (${formatBytes(file.size)})` : t('gpu.jobs.upload.drop')}</Text>
                            <Text size="xs" c="dimmed">{t('gpu.jobs.upload.dropHint')}</Text>
                        </div>
                    </Group>
                </Dropzone>
                {file && errors.file && <Text size="sm" c="red">{errors.file}</Text>}
                {path && <Text size="xs" c="dimmed">{t('gpu.jobs.upload.writesTo')} <Code>~/{path}</Code></Text>}
                {done && <Alert color="teal" variant="light">{t('gpu.jobs.upload.done', { path: `~/${done}` })}</Alert>}
                <Group justify="flex-end" gap="sm">
                    <Button variant="default" onClick={onClose} disabled={upload.isPending}>{t('gpu.jobs.upload.close')}</Button>
                    <Button leftSection={<Upload size={14} />} disabled={!valid} loading={upload.isPending} onClick={() => upload.mutate()}>
                        {t('gpu.jobs.upload.submit')}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}
