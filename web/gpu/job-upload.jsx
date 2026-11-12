import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Code, Group, Modal, SegmentedControl, Select, Stack, Text, TextInput } from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import { File as FileIcon, Upload } from 'lucide-react';
import { CONFLICT, formatError } from '/helper/api-error.js';
import { formatBytes } from '/helper/bytes.js';
import { useApiMutation } from '/helper/query-state.jsx';
import { UploadProgress, useUpload } from '/helper/upload-progress.jsx';
import { isAbort } from '/helper/upload.js';
import { useGpuApi } from '/gpu/api-gpu.jsx';
import { gpuKeys } from '/gpu/query-keys.js';
import { canWriteShared, SHARED_DIR, uploadErrors, uploadPath } from '/gpu/jobs.js';

// JobUploadModal puts a file into the person's home in a project or into its shared folder, for batch jobs without a workspace (todo job_files; the CLI's dhbw-cloud job upload). One file at a time; the service writes it through a short-lived pod, so the first upload takes a few seconds. The upload goes through helper/upload.js, so the dialog shows its progress (percent, speed, time left) and can cancel it; a failure is shown in the dialog, a 409 in the shared dialog as everywhere (useApiMutation), a cancel only as a note. projects are the person's projects that allow jobs, project the one to start with.
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
    const transfer = useUpload();
    const upload = useApiMutation({
        mutationFn: () => transfer.run((opts) => api.uploadFile(slug, path, file, opts)),
        reportErrors: 'inline',
        // An upload can change what a job's file list shows.
        invalidates: [gpuKeys.anyJob()],
        onSuccess: (written) => { setDone(written?.path ?? path); setFile(null); },
    });
    const running = upload.isPending;
    // A 409 is already in the shared dialog (useApiMutation), a cancel is the UploadProgress note.
    const failed = upload.error && !isAbort(upload.error) && upload.error.status !== CONFLICT ? upload.error : null;
    const valid = !!slug && Object.keys(errors).length === 0 && path !== null;

    return (
        <Modal opened={opened} onClose={running ? () => {} : onClose} title={t('gpu.jobs.upload.title')} size="lg" centered>
            <Stack gap="sm">
                <Text size="sm" c="dimmed">{t('gpu.jobs.upload.intro')}</Text>
                <Select label={t('gpu.jobs.project')} value={slug || null} allowDeselect={false}
                    data={projects.map(p => ({ value: p.slug, label: p.name || p.slug }))}
                    onChange={(v) => { setSlug(v || ''); setDone(null); }} disabled={running} />
                {shared ? (
                    <div>
                        <Text size="sm" fw={500} mb={4}>{t('gpu.jobs.upload.target')}</Text>
                        <SegmentedControl size="xs" value={target} onChange={setTarget} disabled={running}
                            data={[{ value: 'home', label: t('gpu.jobs.upload.home') }, { value: 'shared', label: t('gpu.jobs.upload.shared', { dir: SHARED_DIR }) }]} />
                    </div>
                ) : (
                    <Text size="xs" c="dimmed">{t('gpu.jobs.upload.readerHomeOnly', { dir: SHARED_DIR })}</Text>
                )}
                <TextInput label={t('gpu.jobs.upload.folder')} description={t('gpu.jobs.upload.folderHint')} placeholder="jobs/training-1" value={folder}
                    onChange={(e) => setFolder(e.currentTarget.value)} error={errors.folder} disabled={running} />
                <Dropzone onDrop={(files) => { setFile(files[0] ?? null); setDone(null); transfer.reset(); upload.reset(); }} multiple={false} disabled={running}>
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
                <UploadProgress upload={transfer} />
                {failed && <Alert color="red" variant="light">{formatError(failed)}</Alert>}
                {done && <Alert color="teal" variant="light">{t('gpu.jobs.upload.done', { path: `~/${done}` })}</Alert>}
                <Group justify="flex-end" gap="sm">
                    <Button variant="default" onClick={onClose} disabled={running}>{t('gpu.jobs.upload.close')}</Button>
                    <Button leftSection={<Upload size={14} />} disabled={!valid} loading={running} onClick={() => upload.mutate()}>
                        {t('gpu.jobs.upload.submit')}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}
