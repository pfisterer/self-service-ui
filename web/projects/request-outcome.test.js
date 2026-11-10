import { describe, expect, it } from 'vitest';
import { autoApproveHeadroom, changeOutcome, isPoolAutoApprove, latestProjectEnd, requestOutcome, endDate, endDay } from './util-project.jsx';

const RESOURCES = [
    { id: 'cpu', name: 'Cores' },
    { id: 'ram', name: 'RAM', unit: 'GB' },
    { id: 'ipv4', name: 'IPv4', kind: 'bool' },
];

const budget = (extra = {}) => ({
    id: 'b1',
    status: 'approved',
    limit: { cpu: 10, ram: 64, ipv4: 1 },
    usage: { approved: { limit: { cpu: 4 } } },
    ...extra,
});
const pool = (extra) => budget({ auto_approve: {}, ...extra });
const individual = (extra) => budget({ auto_approve: { per_requester_limit: { cpu: 4, ram: 16 } }, ...extra });

describe('isPoolAutoApprove', () => {
    it('is a pool when auto-approve has no per-person limit', () => {
        expect(isPoolAutoApprove(pool())).toBe(true);
        expect(isPoolAutoApprove(budget({ auto_approve: { per_requester_limit: {} } }))).toBe(true);
    });

    it('is no pool with individual limits or without auto-approve', () => {
        expect(isPoolAutoApprove(individual())).toBe(false);
        expect(isPoolAutoApprove(budget())).toBe(false);
    });
});

describe('autoApproveHeadroom for a pool', () => {
    it('is the budget\'s free capacity', () => {
        expect(autoApproveHeadroom(pool(), RESOURCES, [])).toEqual({ cpu: 6, ram: 64 });
    });
});

describe('requestOutcome', () => {
    const ask = (b, quota, extra = {}) => requestOutcome({ budget: b, quota, resources: RESOURCES, myProjects: [], ...extra });

    it('creates directly under a budget the viewer manages', () => {
        expect(ask(budget(), { cpu: 6 }, { manages: true })).toBe('direct');
    });

    it('refuses a manager\'s own project beyond the budget\'s room', () => {
        expect(ask(budget(), { cpu: 7 }, { manages: true })).toBe('refused');
    });

    it('needs approval without auto-approve', () => {
        expect(ask(budget(), { cpu: 1 })).toBe('approval');
    });

    it('grants from a pool whatever still fits', () => {
        expect(ask(pool(), { cpu: 6, ram: 64 })).toBe('instant');
        expect(ask(pool(), { cpu: 7 })).toBe('approval');
    });

    it('grants within the individual limit only', () => {
        expect(ask(individual(), { cpu: 4, ram: 16 })).toBe('instant');
        expect(ask(individual(), { cpu: 5 })).toBe('approval');
    });

    it('is unknown without a budget', () => {
        expect(ask(null, { cpu: 1 })).toBeNull();
    });
});

describe('changeOutcome', () => {
    const project = { id: 'p1', parent_id: 'b1', status: 'approved', limit: { cpu: 2, ram: 8 }, termination_date: '2027-03-31T00:00:00Z' };
    const change = (b, quota, terminationDate = project.termination_date) =>
        changeOutcome({ node: project, budget: b, quota, terminationDate, resources: RESOURCES, myProjects: [project] });

    it('never holds back giving resources back or ending sooner', () => {
        expect(change(null, { cpu: 1, ram: 8 })).toBe('instant');
        expect(change(budget(), { cpu: 2, ram: 8 }, '2027-01-31T00:00:00Z')).toBe('instant');
    });

    it('sends growth and extension to a manager without auto-approve', () => {
        expect(change(budget(), { cpu: 3, ram: 8 })).toBe('approval');
        expect(change(budget(), { cpu: 2, ram: 8 }, '2027-06-30T00:00:00Z')).toBe('approval');
    });

    it('counts only the difference against an individual limit', () => {
        // Holds 2 of 4 — growing to 4 fits, to 5 does not.
        expect(change(individual(), { cpu: 4, ram: 8 })).toBe('instant');
        expect(change(individual(), { cpu: 5, ram: 8 })).toBe('approval');
    });

    it('grows within a pool up to its free capacity', () => {
        expect(change(pool(), { cpu: 8, ram: 8 })).toBe('instant');
        expect(change(pool(), { cpu: 9, ram: 8 })).toBe('approval');
    });

    it('extends only up to the budget\'s own end', () => {
        const b = pool({ termination_date: '2027-09-30T00:00:00Z' });
        expect(change(b, { cpu: 2, ram: 8 }, '2027-09-30T00:00:00Z')).toBe('instant');
        expect(change(b, { cpu: 2, ram: 8 }, '2027-10-31T00:00:00Z')).toBe('approval');
    });

    it('treats a newly switched-on availability as growth', () => {
        expect(change(budget(), { cpu: 2, ram: 8, ipv4: 1 })).toBe('approval');
        expect(change(pool(), { cpu: 2, ram: 8, ipv4: 1 })).toBe('instant');
    });
});

describe('a budget that takes no requests beyond auto-approve', () => {
    const hard = (b) => ({ ...b, allow_requests_beyond_auto_approve: false });
    const project = { id: 'p1', parent_id: 'b1', status: 'approved', limit: { cpu: 2, ram: 8 }, termination_date: '2027-03-31T00:00:00Z' };

    it('blocks a new project beyond the share instead of queueing it', () => {
        const ask = (quota) => requestOutcome({ budget: hard(individual()), quota, resources: RESOURCES, myProjects: [] });
        expect(ask({ cpu: 4, ram: 16 })).toBe('instant');
        expect(ask({ cpu: 5 })).toBe('blocked');
    });

    it('does not bind the budget\'s managers', () => {
        expect(requestOutcome({ budget: hard(individual()), manages: true, quota: { cpu: 5 }, resources: RESOURCES, myProjects: [] })).toBe('direct');
        expect(changeOutcome({ node: project, budget: hard(pool()), quota: { cpu: 9, ram: 8 }, resources: RESOURCES, myProjects: [project], manages: true })).toBe('approval');
    });

    it('blocks growth past the pool but still lets resources go back', () => {
        const change = (quota) => changeOutcome({ node: project, budget: hard(pool()), quota, terminationDate: project.termination_date, resources: RESOURCES, myProjects: [project] });
        expect(change({ cpu: 9, ram: 8 })).toBe('blocked');
        expect(change({ cpu: 1, ram: 8 })).toBe('instant');
    });

    it('means nothing without auto-approve', () => {
        expect(requestOutcome({ budget: hard(budget()), quota: { cpu: 1 }, resources: RESOURCES, myProjects: [] })).toBe('approval');
    });
});

describe('a budget that leaves extensions to its managers', () => {
    const noExt = (b) => ({ ...b, auto_approve_extensions: false });
    const project = { id: 'p1', parent_id: 'b1', status: 'approved', limit: { cpu: 2, ram: 8 }, termination_date: '2027-03-31T00:00:00Z' };
    const change = (b, quota, terminationDate) =>
        changeOutcome({ node: project, budget: b, quota, terminationDate, resources: RESOURCES, myProjects: [project] });

    it('sends an extension to a manager but still grants growth on the spot', () => {
        expect(change(noExt(pool()), { cpu: 2, ram: 8 }, '2027-06-30T00:00:00Z')).toBe('approval');
        expect(change(noExt(pool()), { cpu: 4, ram: 8 }, project.termination_date)).toBe('instant');
    });

    it('lets an extension wait even under a hard limit', () => {
        const b = noExt({ ...pool(), allow_requests_beyond_auto_approve: false });
        expect(change(b, { cpu: 2, ram: 8 }, '2027-06-30T00:00:00Z')).toBe('approval');
        expect(change(b, { cpu: 9, ram: 8 }, '2027-06-30T00:00:00Z')).toBe('blocked');
    });
});

describe('latestProjectEnd', () => {
    const now = Date.parse('2026-10-01T12:00:00Z');
    const day = 24 * 60 * 60 * 1000;

    it('is nothing where neither an end nor a term bounds the project', () => {
        expect(latestProjectEnd(budget(), now)).toBeNull();
        expect(latestProjectEnd(null, now)).toBeNull();
    });

    it('is the term from today where that comes first, and says so', () => {
        expect(latestProjectEnd(budget({ max_project_term_days: 180 }), now))
            .toEqual({ date: new Date(now + 180 * day), term: 180 });
        expect(latestProjectEnd(budget({ max_project_term_days: 30, termination_date: '2027-12-31T00:00:00Z' }), now))
            .toEqual({ date: new Date(now + 30 * day), term: 30 });
    });

    it('is the budget\'s end where that comes first', () => {
        expect(latestProjectEnd(budget({ max_project_term_days: 180, termination_date: '2026-11-30T00:00:00Z' }), now))
            .toEqual({ date: new Date('2026-11-30T00:00:00Z'), term: null });
    });
});

describe('end dates as days (10.11.2026)', () => {
    it('reads a stored day as local midnight and sends a picked date as its local day', () => {
        const d = endDate('2026-12-31');
        expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 11, 31, 0]);
        expect(endDay(d)).toBe('2026-12-31');
        expect(endDay(new Date(2027, 5, 30))).toBe('2027-06-30');
        expect(endDate(null)).toBe(null);
        expect(endDay(null)).toBe(null);
        expect(endDate('2026-12-30T23:00:00.000Z').getTime()).toBe(Date.parse('2026-12-30T23:00:00.000Z'));
    });
    it('picking the stored day again is no change of the end', () => {
        const node = { termination_date: '2026-12-31', limit: {} };
        const picked = new Date(2026, 11, 31); // what the picker reports for 31 December
        expect(changeOutcome({ node, budget: null, quota: {}, terminationDate: picked, resources: [] })).toBe('instant');
    });
});
