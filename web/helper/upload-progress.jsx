import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Group, Progress, Stack, Text } from '@mantine/core';
import { X } from 'lucide-react';
import { formatBytes } from '/helper/bytes.js';
import { formatDuration } from '/helper/duration.js';
import { isAbort } from '/helper/upload.js';

// useUpload holds the state of one upload at a time for a view: how far it got, whether it runs, how it ended, and the way to cancel it. run(task) calls task({ onProgress, signal }) — pass both on to upload() from helper/upload.js, directly or through an API facade — and returns its promise, so it fits a useApiMutation's mutationFn. A cancel rejects that promise with an AbortError (isAbort) and leaves `cancelled` set instead of `error`.
export function useUpload() {
    const [state, setState] = useState({ running: false, progress: null, error: null, cancelled: false });
    const controller = useRef(null);

    const run = useCallback(async (task) => {
        controller.current?.abort();
        const own = new AbortController();
        controller.current = own;
        setState({ running: true, progress: null, error: null, cancelled: false });
        const onProgress = (progress) => { if (controller.current === own) setState(s => ({ ...s, progress })); };
        try {
            const data = await task({ onProgress, signal: own.signal });
            if (controller.current === own) setState(s => ({ ...s, running: false }));
            return data;
        } catch (error) {
            if (controller.current === own) setState(s => ({ ...s, running: false, error: isAbort(error) ? null : error, cancelled: isAbort(error) }));
            throw error;
        } finally {
            if (controller.current === own) controller.current = null;
        }
    }, []);

    const cancel = useCallback(() => controller.current?.abort(), []);
    const reset = useCallback(() => setState({ running: false, progress: null, error: null, cancelled: false }), []);

    // A view that goes away takes its upload with it, rather than leave it running unseen.
    useEffect(() => () => controller.current?.abort(), []);

    return { ...state, run, cancel, reset };
}

// formatEta is the time left in people's words: seconds below a minute, then hours and minutes (formatDuration).
export function formatEta(sec, t, lang) {
    if (sec === null || sec === undefined || !Number.isFinite(sec)) return null;
    if (sec < 60) return t('helper.upload.seconds', { count: Math.max(1, Math.ceil(sec)) });
    return formatDuration(sec * 1000, lang);
}

// UploadProgress shows a running upload: the bar with percent, transferred of total, speed and time left, and a Cancel button; after a cancel a short note. upload is what useUpload returns. Renders nothing before the first upload and after one that went through or failed (the caller says how it ended).
export function UploadProgress({ upload }) {
    const { t, i18n } = useTranslation();
    if (upload.cancelled) return <Text size="sm" c="dimmed">{t('helper.upload.cancelled')}</Text>;
    if (!upload.running) return null;

    const p = upload.progress ?? { loaded: 0, total: 0, percent: 0, bytesPerSec: 0, etaSec: null };
    const eta = formatEta(p.etaSec, t, i18n.resolvedLanguage);
    const details = [
        t('helper.upload.transferred', { loaded: formatBytes(p.loaded), total: formatBytes(p.total) }),
        p.bytesPerSec > 0 ? t('helper.upload.speed', { speed: formatBytes(p.bytesPerSec) }) : null,
        eta ? t('helper.upload.remaining', { time: eta }) : null,
    ].filter(Boolean).join(' · ');

    return (
        <Stack gap={4}>
            <Progress value={p.percent} size="lg" striped animated aria-label={t('helper.upload.label')} />
            <Group justify="space-between" gap="sm" wrap="nowrap">
                <Text size="xs" c="dimmed">
                    <Text span size="xs" fw={600} c="var(--mantine-color-text)">{t('helper.upload.percent', { percent: p.percent })}</Text>
                    {' · '}{details}
                </Text>
                <Button size="compact-xs" variant="subtle" color="red" leftSection={<X size={12} />} onClick={upload.cancel}>
                    {t('helper.upload.cancel')}
                </Button>
            </Group>
        </Stack>
    );
}
