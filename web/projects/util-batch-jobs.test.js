import { describe, expect, it } from 'vitest';
import { batchJobsErrors, batchJobsSummary, effectiveBatchJobs, normalizeBatchJobs, sameBatchJobs } from './util-batch-jobs.js';

const t = (key, vars) => (vars ? `${key} ${JSON.stringify(vars)}` : key);
const on = (n, h) => ({ jobs_per_person: n, max_hours: h });

describe('batch jobs of a budget', () => {
    it('normalizes: null when not set or without jobs', () => {
        expect(normalizeBatchJobs(null)).toBeNull();
        expect(normalizeBatchJobs(on(0, 8))).toBeNull();
        expect(normalizeBatchJobs({ jobs_per_person: '2', max_hours: '4' })).toEqual(on(2, 4));
        expect(sameBatchJobs(on(0, 8), null)).toBe(true);
    });

    it('are there or not, like a resource', () => {
        expect(effectiveBatchJobs({ parent_id: null, batch_jobs: on(40, 24) })).toEqual(on(40, 24));
        expect(effectiveBatchJobs({ parent_id: 'r', inherited_batch_jobs: on(2, 8) })).toBeNull();
        expect(effectiveBatchJobs({ parent_id: 'r', batch_jobs: on(4, 2), inherited_batch_jobs: on(2, 8) })).toEqual(on(2, 2));
        expect(effectiveBatchJobs({ parent_id: 'r', batch_jobs: on(4, 2) })).toBeNull();
        expect(effectiveBatchJobs({ parent_id: 'r', inherits_limit: true, inherited_batch_jobs: on(2, 8) })).toEqual(on(2, 8));
    });

    it('checks like the server: the root within the bounds, below only within what is above', () => {
        expect(batchJobsErrors(t, null, null, false)).toEqual({});
        expect(batchJobsErrors(t, on(500, 24), null, true)).toEqual({});
        expect(batchJobsErrors(t, on(2, 25), null, true).batchJobs).toContain('errHours');
        expect(batchJobsErrors(t, on(0, 4), null, true).batchJobs).toContain('errPerPerson');
        expect(batchJobsErrors(t, on(1, 1), null, false).batchJobs).toContain('errNoneAbove');
        expect(batchJobsErrors(t, on(1, 2), on(2, 4), false)).toEqual({});
        expect(batchJobsErrors(t, on(3, 4), on(2, 4), false).batchJobs).toContain('errPerPersonAbove');
        expect(batchJobsErrors(t, on(2, 8), on(2, 4), false).batchJobs).toContain('errHoursAbove');
    });

    it('summarizes for the history', () => {
        expect(batchJobsSummary(t, null)).toBe('projects.batchJobs.off');
        expect(batchJobsSummary(t, on(2, 4))).toBe('projects.batchJobs.onValue {"count":2,"hours":4}');
    });
});
