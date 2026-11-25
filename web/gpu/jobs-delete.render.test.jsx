// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderView } from '/test/render-harness.jsx';

// Deleting ended batch jobs from the list: a delete action only on ended rows, asked first; "all ended" counts them over every page first and deletes with the list's filter.
vi.mock('/gpu/api-gpu.jsx', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, useGpuApi: () => globalThis.__gpuApi };
});
vi.mock('/llm/use-llm-me.jsx', () => ({ useLlmMe: () => ({ me: { email: 'me@example.org' }, isAdmin: false }) }));

const { GpuJobs } = await import('/gpu/jobs.jsx');

const JOBS = [
    { id: 'j-0000000001', name: 'train', project: 'kurs', person: 'me@example.org', state: 'running', submitted: '2026-11-25T10:00:00Z', started: '2026-11-25T10:01:00Z' },
    { id: 'j-0000000002', name: 'probe', project: 'kurs', person: 'me@example.org', state: 'failed', exit_code: 1, submitted: '2026-11-24T10:00:00Z', started: '2026-11-24T10:01:00Z', ended: '2026-11-24T10:02:00Z' },
    { id: 'j-0000000003', name: 'smoke', project: 'kurs', person: 'me@example.org', state: 'succeeded', exit_code: 0, submitted: '2026-11-23T10:00:00Z', started: '2026-11-23T10:01:00Z', ended: '2026-11-23T10:02:00Z' },
];

beforeEach(() => {
    globalThis.__gpuApi = {
        listProjects: vi.fn(async () => [{ slug: 'kurs', name: 'Kurs ML', role: 'member', batch_jobs: true }]),
        listJobs: vi.fn(async () => ({ items: JOBS, total: JOBS.length, limit: 25, offset: 0 })),
        allJobs: vi.fn(async () => JOBS),
        deleteJob: vi.fn(async () => undefined),
        deleteEndedJobs: vi.fn(async () => ({ deleted: 2 })),
    };
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('deleting ended batch jobs', () => {
    it('offers delete only on ended rows and asks first', async () => {
        renderView(<GpuJobs />);
        await screen.findByText('probe');
        const deletes = screen.getAllByRole('button', { name: /^(Löschen|Delete)$/ });
        expect(deletes.length).toBe(2);
        fireEvent.click(deletes[0]);
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText(/~\/jobs\/probe/)).toBeTruthy();
        fireEvent.click(within(dialog).getByRole('button', { name: /^(Job löschen|Delete job)$/ }));
        await waitFor(() => expect(globalThis.__gpuApi.deleteJob).toHaveBeenCalledWith('j-0000000002'));
    });

    it('deletes all ended jobs of the view after counting them', async () => {
        renderView(<GpuJobs />);
        await screen.findByText('probe');
        fireEvent.click(screen.getByRole('button', { name: /^(Alle beendeten löschen|Delete all ended)$/ }));
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText(/^2 /)).toBeTruthy();
        fireEvent.click(within(dialog).getByRole('button', { name: /^(2 Jobs löschen|Delete 2 jobs)$/ }));
        await waitFor(() => expect(globalThis.__gpuApi.deleteEndedJobs).toHaveBeenCalledWith(''));
        expect(globalThis.__gpuApi.deleteJob).not.toHaveBeenCalled();
    });
});
