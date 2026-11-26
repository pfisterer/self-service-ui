import { describe, expect, it } from 'vitest';
import { featureOn, featureOpen, UI_V2 } from './feature-gates.js';

describe('feature gates', () => {
    it('keeps ui-v2 closed unless the config opens it explicitly', () => {
        expect(featureOn({}, UI_V2)).toBe(false);
        expect(featureOn({ features: { [UI_V2]: false } }, UI_V2)).toBe(false);
        expect(featureOn({ features: { [UI_V2]: true } }, UI_V2)).toBe(true);
    });

    it('leaves the other gates open unless closed', () => {
        expect(featureOpen({}, 'estimator')).toBe(true);
        expect(featureOpen({ features: { estimator: false } }, 'estimator')).toBe(false);
    });
});
