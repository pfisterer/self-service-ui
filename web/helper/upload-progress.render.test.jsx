// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, fireEvent, renderHook, screen } from '@testing-library/react';
import i18n from '/i18n/index.js';
import { renderView } from '/test/render-harness.jsx';
import { formatEta, UploadProgress, useUpload } from './upload-progress.jsx';

afterEach(() => cleanup());

describe('UploadProgress', () => {
    it('shows percent, transferred of total, speed and time left, and cancels', async () => {
        await i18n.changeLanguage('en');
        const cancel = vi.fn();
        const upload = { running: true, cancelled: false, cancel, progress: { loaded: 512 * 1024 ** 2, total: 1024 ** 3, percent: 50, bytesPerSec: 8 * 1024 ** 2, etaSec: 64 } };
        renderView(<UploadProgress upload={upload} />);
        expect(screen.getByRole('progressbar', { name: 'Upload progress' }).getAttribute('aria-valuenow')).toBe('50');
        expect(screen.getByText('50%')).toBeTruthy();
        expect(screen.getByText(/512 MB of 1\.0 GB · 8\.0 MB\/s · .*1.* left/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(cancel).toHaveBeenCalledTimes(1);
    });

    it('speaks German, notes a cancel and shows nothing when idle', async () => {
        await i18n.changeLanguage('de');
        renderView(<UploadProgress upload={{ running: true, cancelled: false, cancel: () => { }, progress: { loaded: 300, total: 1000, percent: 30, bytesPerSec: 100, etaSec: 7 } }} />);
        expect(screen.getByText('30 %')).toBeTruthy();
        expect(screen.getByText(/300 B von 1000 B · 100 B\/s · noch 7 s/)).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Abbrechen' })).toBeTruthy();
        cleanup();
        renderView(<UploadProgress upload={{ running: false, cancelled: true }} />);
        expect(screen.getByText('Hochladen abgebrochen.')).toBeTruthy();
        cleanup();
        renderView(<UploadProgress upload={{ running: false, cancelled: false }} />);
        expect(screen.queryByRole('progressbar')).toBeNull();
        expect(screen.queryByRole('button')).toBeNull();
    });
});

describe('formatEta', () => {
    it('counts seconds below a minute, unknown as nothing', () => {
        const t = (key, { count }) => `${count} s`;
        expect(formatEta(0.2, t, 'en')).toBe('1 s');
        expect(formatEta(59, t, 'en')).toBe('59 s');
        expect(formatEta(null, t, 'en')).toBeNull();
        expect(formatEta(Infinity, t, 'en')).toBeNull();
        expect(formatEta(3600, t, 'en')).toMatch(/1/);
    });
});

describe('useUpload', () => {
    it('tracks progress, the result, and a cancel through the signal', async () => {
        const { result } = renderHook(() => useUpload());
        let finish;
        let p;
        act(() => {
            p = result.current.run(({ onProgress }) => new Promise((resolve) => { onProgress({ loaded: 1, total: 2, percent: 50, bytesPerSec: 1, etaSec: 1 }); finish = resolve; }));
        });
        expect(result.current.running).toBe(true);
        expect(result.current.progress.percent).toBe(50);
        await act(async () => { finish({ ok: true }); await p; });
        expect(result.current.running).toBe(false);
        await expect(p).resolves.toEqual({ ok: true });

        act(() => {
            p = result.current.run(({ signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')))));
        });
        await act(async () => { result.current.cancel(); await p.catch(() => { }); });
        expect(result.current.running).toBe(false);
        expect(result.current.cancelled).toBe(true);
        expect(result.current.error).toBeNull();

        act(() => { p = result.current.run(() => Promise.reject(new Error('kaputt'))); });
        await act(async () => { await p.catch(() => { }); });
        expect(result.current.error.message).toBe('kaputt');
        expect(result.current.cancelled).toBe(false);
    });
});
