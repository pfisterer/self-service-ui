import { describe, expect, it } from 'vitest';
import { finalDeletion, labDeletion } from './util-project.jsx';

const resources = [{ id: 'cores', provider: 'openstack', area: 'cloud' }, { id: 'ws-storage-gb', provider: 'aiaas', area: 'workspaces' }];
const retirement = { aiaasDeleteGraceDays: 14 };

describe('labDeletion', () => {
    it('is the day after the end plus the grace days, for Lab/AI projects only', () => {
        const node = { status: 'approved', termination_date: '2026-10-05', limit: { 'ws-storage-gb': 5 } };
        expect(labDeletion(node, resources, retirement)?.slice(0, 10)).toBe('2026-10-20');
        expect(labDeletion({ ...node, limit: { cores: 2 } }, resources, retirement)).toBeNull();
        expect(labDeletion(node, resources, { aiaasDeleteGraceDays: 0 })).toBeNull();
        expect(labDeletion({ ...node, termination_date: undefined }, resources, retirement)).toBeNull();
    });
    it('counts from an earlier release day, as OpenStack tags its deletion', () => {
        const node = { status: 'released', termination_date: '2027-03-31', limit: { 'ws-storage-gb': 5 },
            history: [{ event: 'released', timestamp: '2026-09-01T10:00:00Z' }] };
        expect(labDeletion(node, resources, retirement)?.slice(0, 10)).toBe('2026-09-15');
    });
});

describe('finalDeletion', () => {
    const history = [{ event: 'released', timestamp: '2026-09-01T10:00:00Z' }];
    const both = { status: 'archived', limit: { cores: 2, 'ws-storage-gb': 5 }, history };
    it('is the later of the OpenStack and the Lab/AI day, for retired projects only', () => {
        const r = { delete: 'after-grace', deleteGraceDays: 30, aiaasDeleteGraceDays: 30 };
        expect(finalDeletion(both, resources, r)?.slice(0, 10)).toBe('2026-10-01');
        expect(finalDeletion(both, resources, { ...r, aiaasDeleteGraceDays: 40 })?.slice(0, 10)).toBe('2026-10-11');
        expect(finalDeletion({ ...both, status: 'approved' }, resources, r)).toBeNull();
    });
    it('is the Lab/AI day alone without OpenStack, and null when nothing goes by itself', () => {
        const lab = { status: 'released', limit: { 'ws-storage-gb': 5 }, history };
        expect(finalDeletion(lab, resources, { delete: 'on-request', aiaasDeleteGraceDays: 30 })?.slice(0, 10)).toBe('2026-10-01');
        expect(finalDeletion({ ...both, limit: { cores: 2 } }, resources, { delete: 'on-request', aiaasDeleteGraceDays: 30 })).toBeNull();
    });
});
