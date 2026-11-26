import { describe, expect, it } from 'vitest';
import { offerOf, offerTotals, offeredAvailabilities, termOf } from './util-offers.js';

const R = [{ id: 'cores' }, { id: 'ram' }, { id: 'net', kind: 'bool' }];

// Staff: 8 cores at once per person from a budget with 100, more on request.
const STAFF = { id: 'staff', limit: { cores: 100, ram: 400 }, usage: { approved: { limit: { cores: 20 } } }, auto_approve: { per_requester_limit: { cores: 8, ram: 16, net: 1 } }, max_project_term_days: 365 };
// A faculty budget: everything on request.
const FACULTY = { id: 'fac', limit: { cores: 50, ram: 100 }, max_project_term_days: 180 };
// A trial budget refusing what its share does not cover.
const TRIAL = { id: 'trial', limit: { cores: 10, ram: 20 }, auto_approve: { per_requester_limit: { cores: 2, ram: 4 } }, allow_requests_beyond_auto_approve: false, max_project_term_days: 30 };

describe('offerOf', () => {
    it('grants the own share at once and up to the free room on request', () => {
        expect(offerOf(STAFF, R, [])).toEqual({ cores: { now: 8, ask: 80 }, ram: { now: 16, ask: 400 } });
    });

    it('grants nothing at once without auto-approve', () => {
        expect(offerOf(FACULTY, R, [])).toEqual({ cores: { now: 0, ask: 50 }, ram: { now: 0, ask: 100 } });
    });

    it('stops at the share where the budget refuses the rest', () => {
        expect(offerOf(TRIAL, R, [])).toEqual({ cores: { now: 2, ask: 2 }, ram: { now: 4, ask: 4 } });
    });

    it('counts what the own projects already hold against the share', () => {
        const mine = [{ status: 'approved', allocations: [{ budget_id: 'staff', status: 'approved', limit: { cores: 6 } }] }];
        expect(offerOf(STAFF, R, mine).cores.now).toBe(2);
    });

    it('has no cap where the budget passes on its parent limit', () => {
        expect(offerOf({ ...FACULTY, inherits_limit: true }, R, []).cores.ask).toBe(Infinity);
    });
});

describe('offerTotals', () => {
    it('adds the budgets up per resource', () => {
        expect(offerTotals([STAFF, FACULTY, TRIAL], R, [])).toEqual({ cores: { now: 10, ask: 132 }, ram: { now: 20, ask: 504 } });
    });
});

describe('offeredAvailabilities', () => {
    it('says which availabilities come at once', () => {
        const net = { id: 'net', kind: 'bool' };
        expect(offeredAvailabilities([FACULTY], [net], 'cloud')).toEqual([{ resource: net, now: false }]);
        expect(offeredAvailabilities([FACULTY, STAFF], [net], 'cloud')).toEqual([{ resource: net, now: true }]);
    });
});

describe('termOf', () => {
    it('is the longest term at once and on request', () => {
        expect(termOf([STAFF, FACULTY, TRIAL])).toEqual({ now: 365, ask: 365 });
        expect(termOf([FACULTY, TRIAL])).toEqual({ now: 30, ask: 180 });
        expect(termOf([{ id: 'x' }]).ask).toBeNull();
    });
});
