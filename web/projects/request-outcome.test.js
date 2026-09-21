import { describe, expect, it } from 'vitest';
import { autoApproveHeadroom, changeOutcome, isPoolAutoApprove, requestOutcome } from './util-project.jsx';

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
