// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import '/test/jsdom-stubs.js';
import { pickedDate } from './component-common.jsx';

// The calendar reports "YYYY-MM-DD"; every form calls toISOString() on the value.
describe('pickedDate', () => {
    it('turns the picker string into a Date at local midnight of that day', () => {
        const d = pickedDate('2027-05-14');
        expect(d).toBeInstanceOf(Date);
        expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2027, 4, 14, 0]);
        expect(() => d.toISOString()).not.toThrow();
    });

    it('passes a Date through and clears to null', () => {
        const now = new Date();
        expect(pickedDate(now)).toBe(now);
        expect(pickedDate(null)).toBeNull();
        expect(pickedDate('')).toBeNull();
    });
});
