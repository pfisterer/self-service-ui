import { describe, expect, it } from 'vitest';
import { aiCapDefaults } from './cap-defaults.js';
import { DEFAULT_JOB_MAX_HOURS, DEFAULT_JOBS_PER_PERSON } from './jobs.js';

describe('the AI service defaults by cap id', () => {
    it('carry the release times of its catalogue and the batch job defaults', () => {
        expect(aiCapDefaults({ cpu: { idle_open_minutes: 120, idle_closed_minutes: 90, max_hours: 12 }, gpu: { idle_open_minutes: 5, max_hours: 0 } })).toEqual({
            'release-cpu-idle-open': 120, 'release-cpu-idle-closed': 90, 'release-cpu-max-hours': 12,
            'release-gpu-idle-open': 5, 'release-gpu-max-hours': 0,
            'batch-jobs-per-person': DEFAULT_JOBS_PER_PERSON, 'batch-max-hours': DEFAULT_JOB_MAX_HOURS,
        });
    });

    it('without the catalogue only the batch job defaults', () => {
        expect(aiCapDefaults(undefined)).toEqual({ 'batch-jobs-per-person': DEFAULT_JOBS_PER_PERSON, 'batch-max-hours': DEFAULT_JOB_MAX_HOURS });
    });
});
