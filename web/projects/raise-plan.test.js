import { describe, expect, it } from 'vitest';
import { budgetShortfall, canRaise, idsAbove, managesChainOf, projectNeed, raisePlan, UNLIMITED_QUOTA } from './util-project.jsx';

const RESOURCES = [
    { id: 'cpu', name: 'Cores' },
    { id: 'ram', name: 'RAM', unit: 'GB' },
    { id: 'ipv4', name: 'IPv4', kind: 'bool' },
];

// root (100 cpu) → dept (20 cpu) → course (10 cpu, 8 used) → the project.
const root = { id: 'root', parent_id: null, status: 'approved', name: 'Root', limit: { cpu: 100, ram: 400 }, usage: { approved: { limit: { cpu: 30 } } } };
const dept = { id: 'dept', parent_id: 'root', parent_path: [], parent_name: 'Root', status: 'approved', name: 'Dept', limit: { cpu: 20, ram: 100 }, usage: { approved: { limit: { cpu: 12 } } } };
const course = { id: 'course', parent_id: 'dept', parent_path: [{ id: 'dept', name: 'Dept' }], parent_name: 'Dept', status: 'approved', name: 'Course', limit: { cpu: 10, ram: 40 }, usage: { approved: { limit: { cpu: 8 } } } };

describe('idsAbove', () => {
    it('lists the budgets above, nearest first, without the budget itself', () => {
        expect(idsAbove(course)).toEqual(['dept']);
        expect(idsAbove({ ...course, ancestor_ids: ['root', 'dept'] })).toEqual(['dept', 'root']);
        expect(idsAbove(root)).toEqual([]);
    });
});

describe('managesChainOf', () => {
    it('is true for the budget itself or one above it', () => {
        expect(managesChainOf(course, ['course'])).toBe(true);
        expect(managesChainOf(course, new Set(['dept']))).toBe(true);
        expect(managesChainOf(course, ['other'])).toBe(false);
    });
    it('is true for a root admin, false without a budget', () => {
        expect(managesChainOf(course, [], true)).toBe(true);
        expect(managesChainOf(null, ['course'], true)).toBe(false);
    });
});

describe('canRaise', () => {
    it('needs a budget above: managing the budget alone is not enough', () => {
        expect(canRaise(course, ['course'])).toBe(false);
        expect(canRaise(course, ['dept'])).toBe(true);
    });
    it('is never possible for the top budget, always for a root admin below it', () => {
        expect(canRaise(root, ['root'], true)).toBe(false);
        expect(canRaise(course, [], true)).toBe(true);
    });
});

describe('projectNeed', () => {
    it('is the whole quota of a new or pending project, quantities only', () => {
        expect(projectNeed({ isChange: false, quota: { cpu: 4, ram: 8, ipv4: 1 }, resources: RESOURCES })).toEqual({ cpu: 4, ram: 8 });
        expect(projectNeed({ isChange: true, node: { status: 'pending', limit: { cpu: 2 } }, quota: { cpu: 4 }, resources: RESOURCES })).toEqual({ cpu: 4 });
    });
    it('is only the growth of an active project', () => {
        const node = { status: 'approved', limit: { cpu: 2, ram: 16 } };
        expect(projectNeed({ isChange: true, node, quota: { cpu: 5, ram: 8 }, resources: RESOURCES })).toEqual({ cpu: 3 });
        expect(projectNeed({ isChange: true, node: { ...node, status: 'change_pending' }, quota: { cpu: 2, ram: 16 }, resources: RESOURCES })).toEqual({});
    });
});

describe('budgetShortfall', () => {
    it('is what exceeds the free amount', () => {
        expect(budgetShortfall(course, { cpu: 5, ram: 10 }, RESOURCES)).toEqual({ cpu: 3 });
        expect(budgetShortfall(course, { cpu: 2 }, RESOURCES)).toEqual({});
    });
    it('counts an excess already over the limit, and nothing for unlimited', () => {
        const over = { ...course, usage: { approved: { limit: { cpu: 12 } } } };
        expect(budgetShortfall(over, { cpu: 1 }, RESOURCES)).toEqual({ cpu: 3 });
        expect(budgetShortfall({ ...course, limit: { cpu: UNLIMITED_QUOTA } }, { cpu: 50 }, RESOURCES)).toEqual({});
    });
});

describe('raisePlan', () => {
    const may = (ids) => ({ canRaise: (b) => canRaise(b, ids) });

    it('is empty when everything fits', () => {
        expect(raisePlan([course, dept, root], { cpu: 2 }, RESOURCES, may(['dept']))).toEqual([]);
    });

    it('offers the budget that lacks room to whoever manages one above it', () => {
        const [step, ...rest] = raisePlan([course, dept, root], { cpu: 5 }, RESOURCES, may(['dept']));
        expect(rest).toEqual([]);
        expect(step).toMatchObject({ budget: course, short: { cpu: 3 }, parent: dept, edgeShort: {}, raisable: true, reason: null, ownShort: true });
    });

    it('names the managers above when the viewer only manages the budget itself', () => {
        const [step] = raisePlan([course, dept, root], { cpu: 5 }, RESOURCES, may(['course']));
        expect(step).toMatchObject({ budget: course, raisable: false, reason: 'notManager' });
    });

    it('lifts a raise past the limit above to that budget, top-most first', () => {
        // 13 cores: the course lacks 11 and would hold 21, past the dept's 20 by 1; the dept lacks 5 of room itself, which covers that.
        const plan = raisePlan([course, dept, root], { cpu: 13 }, RESOURCES, may(['root']));
        expect(plan.map(s => s.budget.id)).toEqual(['dept', 'course']);
        expect(plan[0]).toMatchObject({ short: { cpu: 5 }, ownShort: true, child: course });
        expect(plan[1]).toMatchObject({ short: { cpu: 11 }, edgeShort: { cpu: 1 } });
        // Only the limit above in the way: the dept has room, but not the limit for the course's new one.
        const roomy = { ...dept, usage: { approved: { limit: { cpu: 0 } } }, limit: { cpu: 12, ram: 100 } };
        const edge = raisePlan([course, roomy, root], { cpu: 5 }, RESOURCES, may(['root']));
        expect(edge.map(s => s.budget.id)).toEqual(['dept', 'course']);
        expect(edge[0]).toMatchObject({ short: { cpu: 1 }, ownShort: false });
    });

    it('does not offer a budget with a request for more waiting', () => {
        const [step] = raisePlan([{ ...course, status: 'change_pending' }, dept], { cpu: 5 }, RESOURCES, may(['dept']));
        expect(step).toMatchObject({ raisable: false, reason: 'pending' });
    });

    it('passes the shortage of a budget that inherits its limit to the one it inherits from', () => {
        // The faculty inherits the dept's 20 cores; what the course lacks is the dept's to give.
        const faculty = { ...dept, id: 'fac', name: 'Faculty', inherits_limit: true, parent_id: 'dept' };
        const tight = { ...dept, usage: { approved: { limit: { cpu: 19 } } } };
        const plan = raisePlan([{ ...course, parent_id: 'fac', limit: { cpu: 20 } }, faculty, tight, root], { cpu: 5 }, RESOURCES, may(['root']));
        expect(plan.map(s => s.budget.id)).toEqual(['dept']);
        // Out of view, the inheriting budget is the last one known and says why it cannot grow.
        const [alone] = raisePlan([{ ...faculty, usage: { approved: { limit: { cpu: 19 } } } }], { cpu: 5 }, RESOURCES, may(['root']));
        expect(alone).toMatchObject({ budget: { id: 'fac' }, raisable: false, reason: 'inherits' });
    });
});
