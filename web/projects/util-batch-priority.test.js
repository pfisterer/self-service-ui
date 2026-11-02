import { describe, expect, it } from 'vitest';
import { batchPriorityErrors, batchPrioritySummary, effectiveBatchPriority, normalizeBatchPriority } from './util-batch-priority.js';

const t = (key, vars) => (vars ? `${key} ${JSON.stringify(vars)}` : key);

describe('batch job priority', () => {
    it('normalizes to one of the two values or null', () => {
        expect(normalizeBatchPriority('')).toBeNull();
        expect(normalizeBatchPriority(undefined)).toBeNull();
        expect(normalizeBatchPriority('other')).toBeNull();
        expect(normalizeBatchPriority('guaranteed')).toBe('guaranteed');
    });

    it('applies the stricter of own and inherited', () => {
        expect(effectiveBatchPriority({})).toBeNull();
        expect(effectiveBatchPriority({ batch_priority: 'guaranteed' })).toBe('guaranteed');
        expect(effectiveBatchPriority({ inherited_batch_priority: 'guaranteed' })).toBe('guaranteed');
        expect(effectiveBatchPriority({ batch_priority: 'preemptible', inherited_batch_priority: 'guaranteed' })).toBe('preemptible');
        expect(effectiveBatchPriority({ batch_priority: 'guaranteed', inherited_batch_priority: 'preemptible' })).toBe('preemptible');
    });

    it('checks like the server: only tighten', () => {
        expect(batchPriorityErrors(t, null, 'preemptible')).toEqual({});
        expect(batchPriorityErrors(t, 'preemptible', 'preemptible')).toEqual({});
        expect(batchPriorityErrors(t, 'guaranteed', null)).toEqual({});
        expect(batchPriorityErrors(t, 'guaranteed', 'guaranteed')).toEqual({});
        expect(batchPriorityErrors(t, 'guaranteed', 'preemptible').batchPriority).toContain('errAbove');
    });

    it('summarizes for the history', () => {
        expect(batchPrioritySummary(t, null)).toBe('projects.batchPriority.none');
        expect(batchPrioritySummary(t, 'preemptible')).toBe('projects.batchPriority.preemptible');
    });
});
