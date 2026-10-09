import { describe, expect, it } from 'vitest';
import { attributesError, fromAttributes, toAttributes } from './util-attributes.js';

describe('attributes editor', () => {
    it('round-trips, keeps an empty group and drops blank rows', () => {
        const groups = fromAttributes({ billing: { wbs: 'D-1', cost_center: '4711' }, misc: {} });
        expect(groups.map(g => g.name)).toEqual(['billing', 'misc']);
        expect(groups[0].rows.map(r => r.key)).toEqual(['cost_center', 'wbs']);
        groups[0].rows.push({ key: ' ', value: '' });
        expect(toAttributes(groups)).toEqual({ billing: { wbs: 'D-1', cost_center: '4711' }, misc: {} });
    });

    it('names the first bad name or duplicate', () => {
        expect(attributesError([{ name: 'Billing', rows: [] }])).toEqual({ code: 'name', name: 'Billing' });
        expect(attributesError([{ name: 'a', rows: [] }, { name: 'a', rows: [] }])).toEqual({ code: 'duplicateGroup', name: 'a' });
        expect(attributesError([{ name: 'a', rows: [{ key: 'k', value: '1' }, { key: 'k', value: '2' }] }])).toEqual({ code: 'duplicateKey', name: 'k' });
        expect(attributesError([{ name: 'a', rows: [{ key: 'cost center', value: '1' }] }])).toEqual({ code: 'name', name: 'cost center' });
        expect(attributesError([{ name: 'billing', rows: [{ key: 'cost_center', value: '4711' }] }])).toBeNull();
    });
});
