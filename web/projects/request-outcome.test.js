import { describe, expect, it } from 'vitest';
import { autoApproveHeadroom, isPoolAutoApprove } from './util-project.jsx';

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
