import { describe, it, expect } from 'vitest';
import { formatBytes } from './bytes.js';

describe('formatBytes', () => {
    it('formats sizes', () => {
        expect(formatBytes(0)).toBe('0 B');
        expect(formatBytes(undefined)).toBe('0 B');
        expect(formatBytes(512.4)).toBe('512 B');
        expect(formatBytes(2048)).toBe('2.0 KB');
        expect(formatBytes(15 * 1024 ** 2)).toBe('15 MB');
        expect(formatBytes(5 * 1024 ** 3)).toBe('5.0 GB');
    });
});
