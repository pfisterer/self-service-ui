import { describe, expect, it } from 'vitest';
import { capErrors, capGroups, capHistory, capRangeOk, capsForCreate, capsPatch, effectiveCaps, formatCapValue, grantAvailable, grantStart, groupSlug, isLooser, normalizeCaps, stricterCap } from './util-caps.js';

// t as the tests need it: the key with its options, so a test sees which text was chosen and with what; defaultValue stands for a text the UI has none of.
const t = (key, opts = {}) => (opts.defaultValue !== undefined ? opts.defaultValue : `${key}${Object.keys(opts).length ? JSON.stringify(opts) : ''}`);

const MINUTES = { id: 'idle', name: 'Idle', provider: 'p', group: 'Release', unit: 'min', min: 1, max: 1440 };
const HOURS = { id: 'hours', name: 'Hours', provider: 'p', group: 'Release', unit: 'h', min: 1, max: 720, unbounded: true };
const PRIORITY = { id: 'prio', name: 'Priority', provider: 'p', group: 'Jobs', min: 0, max: 1, choices: ['preemptible', 'guaranteed'] };
const PER_PERSON = { id: 'per', name: 'Per person', provider: 'p', group: 'Jobs', min: 1, max: 100, grant: true, together: 'jobs', default: 2 };
const RUN = { id: 'run', name: 'Run', provider: 'p', group: 'Jobs', unit: 'h', min: 1, max: 24, grant: true, together: 'jobs', default: 4 };
const CATALOG = [MINUTES, HOURS, PRIORITY, PER_PERSON, RUN];

describe('caps', () => {
    it('normalize to the set values as numbers', () => {
        expect(normalizeCaps({ a: '3', b: null, c: '', d: 0 })).toEqual({ a: 3, d: 0 });
        expect(normalizeCaps(null)).toEqual({});
    });

    it('compare by the smaller value, where 0 under unbounded is the loosest and bounds nothing above', () => {
        expect(isLooser(MINUTES, 30, 20)).toBe(true);
        expect(isLooser(MINUTES, 20, 20)).toBe(false);
        expect(isLooser(MINUTES, 30, undefined)).toBe(false);
        expect(isLooser(HOURS, 0, 4)).toBe(true);
        expect(isLooser(HOURS, 100, 0)).toBe(false);
        expect(isLooser(PRIORITY, 1, 0)).toBe(true);
        expect(stricterCap(HOURS, 0, 4)).toBe(4);
        expect(stricterCap(HOURS, 3, 4)).toBe(3);
        expect(stricterCap(MINUTES, undefined, 4)).toBe(4);
        expect(stricterCap(MINUTES, undefined, undefined)).toBeUndefined();
    });

    it('check the range of a value', () => {
        expect(capRangeOk(MINUTES, 0)).toBe(false);
        expect(capRangeOk(MINUTES, 1441)).toBe(false);
        expect(capRangeOk(HOURS, 0)).toBe(true);
        expect(capRangeOk(PRIORITY, 1)).toBe(true);
        expect(capRangeOk(PRIORITY, 2)).toBe(false);
        expect(capRangeOk(MINUTES, 1.5)).toBe(false);
    });

    it('apply below a node: the stricter of own and inherited, grant caps only where the node has them', () => {
        const node = { parent_id: 'b_root', caps: { idle: 30, hours: 0, per: 5, run: 2 }, inherited_caps: { idle: 20, hours: 4, per: 3, run: 8 } };
        expect(effectiveCaps(node, CATALOG)).toEqual({ idle: 20, hours: 4, per: 3, run: 2 });
        // Without own grant values below the root: off.
        expect(effectiveCaps({ parent_id: 'b_root', inherited_caps: { per: 3, run: 8 } }, CATALOG)).toEqual({});
        // Inheriting its limit: those above.
        expect(effectiveCaps({ parent_id: 'b_root', inherits_limit: true, inherited_caps: { per: 3, run: 8 } }, CATALOG)).toEqual({ per: 3, run: 8 });
        // The root: its own.
        expect(effectiveCaps({ parent_id: null, caps: { per: 2, run: 4 } }, CATALOG)).toEqual({ per: 2, run: 4 });
        // Below the root without them above: off, whatever it has.
        expect(effectiveCaps({ parent_id: 'b_root', caps: { per: 2, run: 4 } }, CATALOG)).toEqual({});
        expect(effectiveCaps(null, CATALOG)).toEqual({});
    });

    it('group the catalogue and keep caps that belong together in one block', () => {
        const groups = capGroups(CATALOG);
        expect(groups.map(g => g.group)).toEqual(['Release', 'Jobs']);
        expect(groups[1].blocks.map(b => b.caps.map(c => c.id))).toEqual([['prio'], ['per', 'run']]);
        expect(groups[1].blocks[1].together).toBe('jobs');
        expect(groupSlug('Release times CPU')).toBe('release-times-cpu');
    });

    it('offer a grant block at the root or where the budgets above have it, and start it within what they allow', () => {
        const block = capGroups(CATALOG)[1].blocks[1];
        expect(grantAvailable(block, {}, true)).toBe(true);
        expect(grantAvailable(block, { per: 3 }, false)).toBe(false);
        expect(grantAvailable(block, { per: 3, run: 8 }, false)).toBe(true);
        // The caps' defaults, within what is allowed above.
        expect(grantStart(block, { per: 3, run: 8 })).toEqual({ per: 2, run: 4 });
        expect(grantStart(block, { per: 1, run: 2 })).toEqual({ per: 1, run: 2 });
        expect(grantStart(block, null)).toEqual({ per: 2, run: 4 });
        // Without a default: what is allowed above, else the minimum.
        const bare = { ...block, caps: block.caps.map(({ default: _, ...c }) => c) };
        expect(grantStart(bare, { per: 3, run: 8 })).toEqual({ per: 3, run: 8 });
        expect(grantStart(bare, null)).toEqual({ per: 1, run: 1 });
    });

    it('check a budget\'s own caps like the server', () => {
        expect(capErrors(t, CATALOG, { idle: 0 }, {})).toEqual({ 'caps.idle': 'projects.caps.errRange{"min":1,"max":1440}' });
        expect(capErrors(t, CATALOG, { idle: 30 }, { idle: 20 })).toEqual({ 'caps.idle': 'projects.caps.errAbove{"value":"20 min"}' });
        expect(capErrors(t, CATALOG, { hours: 0 }, { hours: 4 })).toHaveProperty('caps.hours');
        expect(capErrors(t, CATALOG, { hours: 0 }, { hours: 0 })).toEqual({});
        expect(capErrors(t, CATALOG, { prio: 1 }, { prio: 0 })).toHaveProperty('caps.prio');
        // Grant caps: only where those above have them, except at the root; all of a together group or none.
        expect(capErrors(t, CATALOG, { per: 2, run: 4 }, {})).toEqual({ 'caps.per': 'projects.caps.errNoneAbove', 'caps.run': 'projects.caps.errNoneAbove' });
        expect(capErrors(t, CATALOG, { per: 2, run: 4 }, {}, { isRoot: true })).toEqual({});
        expect(capErrors(t, CATALOG, { per: 2 }, {}, { isRoot: true })).toEqual({ 'caps.run': 'projects.caps.errTogether' });
        // Inheriting its limit, the budget has no grant caps of its own: not checked.
        expect(capErrors(t, CATALOG, { per: 2 }, {}, { inheritsLimit: true })).toEqual({});
    });

    it('build the update: only the changed ids, null for removed ones', () => {
        expect(capsPatch({ idle: 20, hours: null, prio: 1 }, { idle: 20, hours: 4 }, CATALOG)).toEqual({ hours: null, prio: 1 });
        expect(capsPatch({ idle: '20' }, { idle: 20 }, CATALOG)).toBeUndefined();
        // Inheriting its limit, the grant caps are left out.
        expect(capsPatch({ per: null, run: null, idle: 5 }, { per: 2, run: 4 }, CATALOG, { inheritsLimit: true })).toEqual({ idle: 5 });
    });

    it('build the caps of a new budget from the set values of the caps shown', () => {
        expect(capsForCreate({ idle: 20, hours: null, other: 3 }, CATALOG)).toEqual({ idle: 20 });
        expect(capsForCreate({ per: 2, run: 4 }, CATALOG, { inheritsLimit: true })).toBeUndefined();
        expect(capsForCreate({}, CATALOG)).toBeUndefined();
    });

    it('say a value in words', () => {
        expect(formatCapValue(t, MINUTES, 20)).toBe('20 min');
        expect(formatCapValue(t, HOURS, 0)).toBe('projects.caps.unbounded');
        expect(formatCapValue(t, PRIORITY, 1)).toBe('guaranteed');
        expect(formatCapValue(t, MINUTES, undefined)).toBe('projects.caps.notSet');
        expect(formatCapValue(t, PER_PERSON, undefined)).toBe('projects.caps.off');
        expect(formatCapValue(t, undefined, 7)).toBe('7');
    });

    it('describe a history entry by the catalogue, unknown ids by their id', () => {
        expect(capHistory(t, CATALOG, { hours: 4, gone: 1 }, { hours: 0, prio: 1 })).toEqual([
            { id: 'hours', label: 'Release · Hours', from: '4 h', to: 'projects.caps.unbounded' },
            { id: 'prio', label: 'Jobs · Priority', from: 'projects.caps.notSet', to: 'guaranteed' },
            { id: 'gone', label: 'gone', from: '1', to: 'projects.caps.notSet' },
        ]);
        expect(capHistory(t, CATALOG, undefined, undefined)).toEqual([]);
    });
});
