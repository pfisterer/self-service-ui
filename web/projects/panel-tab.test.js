// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { panelTab } from './project-tile.jsx';

// The side panel takes the place of the details dialog in the new layout: a tab asked for there lands on the matching one here.
describe('panelTab', () => {
    it('keeps the panel\'s own tabs', () => {
        for (const tab of ['overview', 'allocations', 'members', 'usage', 'history']) expect(panelTab(tab)).toBe(tab);
    });
    it('maps the dialog\'s tabs, anything else to the overview', () => {
        expect(panelTab('access')).toBe('members');
        expect(panelTab('details')).toBe('overview');
        expect(panelTab('resources')).toBe('overview');
        expect(panelTab('attributes')).toBe('overview');
        expect(panelTab(undefined)).toBe('overview');
    });
});
