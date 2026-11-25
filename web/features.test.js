// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { runningVersion } from './features.js';

// The footer shows the tag the container is deployed under; the built-in version only without one (a stable release retags a pre-release image without rebuilding).
describe('runningVersion', () => {
    it('prefers the deployed version from config.js', () => {
        expect(runningVersion({ appVersion: '0.8.226' }, '0.8.225-test.10')).toBe('0.8.226');
        expect(runningVersion({ appVersion: ' 0.8.226 ' }, '0.8.225-test.10')).toBe('0.8.226');
    });
    it('falls back to the built-in version', () => {
        expect(runningVersion({ appVersion: '' }, '0.8.225')).toBe('0.8.225');
        expect(runningVersion({}, '0.8.225')).toBe('0.8.225');
        expect(runningVersion(undefined, '0.8.225')).toBe('0.8.225');
    });
});
