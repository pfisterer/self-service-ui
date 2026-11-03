import { describe, expect, it } from 'vitest';
import { kernelReleaseOf, oneDot, releaseOf, releaseText } from './release.js';

// Keys and values as the translation sees them, so the test checks what goes into the sentence.
const t = (key, v = {}) => `${key}(${Object.entries(v).map(([k, x]) => `${k}=${x}`).join(',')})`;

describe('release times', () => {
    const project = { release: { servers: { gpu: { idle_open: 1800, idle_closed: 600, max: 0 }, cpu: { idle_open: 7200, idle_closed: 7200, max: 43200 } }, kernel: { idle_open: 300, idle_closed: 120, max: 14400 } } };
    it('takes the times of the profile and of the GPU kernels', () => {
        expect(releaseOf(project, 'gpu').idle_closed).toBe(600);
        expect(kernelReleaseOf(project).max).toBe(14400);
        expect(releaseOf({}, 'gpu')).toBeNull();
        // The project list carries them as release_effective.
        expect(releaseOf({ release_effective: project.release }, 'cpu').max).toBe(43200);
    });
    it('names both idle times only when they differ, and a missing upper bound', () => {
        const gpu = releaseText(releaseOf(project, 'gpu'), t, 'de');
        expect(gpu).toContain('gpu.release.noMax');
        expect(gpu).toContain('gpu.release.idleBoth');
        const cpu = releaseText(releaseOf(project, 'cpu'), t, 'de');
        expect(cpu).toContain('gpu.release.withMax');
        expect(cpu).toContain('gpu.release.idle(');
    });
    it('ends a sentence after an abbreviation with one dot', () => {
        expect(oneDot('spätestens nach 8 Std..')).toBe('spätestens nach 8 Std.');
        expect(oneDot('nach 8 Std.. GPU-Kernel: nach 4 Std..')).toBe('nach 8 Std. GPU-Kernel: nach 4 Std.');
        expect(oneDot('after 8 hr.')).toBe('after 8 hr.');
    });
});
