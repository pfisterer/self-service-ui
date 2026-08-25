import { describe, it, expect } from 'vitest';
import {
    autoApproveHeadroom,
    childrenById,
    expiryTone,
    freeAmount,
    isExpired,
    isProvisioning,
    limitDelta,
    nodeChanges,
    nodeTitle,
    normalizeObjectResponse,
    overageEntries,
    overageText,
    ownerEmail,
    quotaFits,
    requestType,
    resourceBarSegments,
    resourceSummaryText,
    statusLabel,
    usedAmount,
    UNLIMITED_QUOTA,
} from './util-project.jsx';

const RESOURCES = [
    { id: 'cpu', name: 'vCPUs' },
    { id: 'ram', name: 'RAM', unit: 'GB' },
];

const daysFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString();

describe('ownerEmail', () => {
    it('strips the user: prefix', () => {
        expect(ownerEmail({ owner: 'user:a@example.com' })).toBe('a@example.com');
    });

    it('leaves a token without the prefix alone and copes with no owner', () => {
        expect(ownerEmail({ owner: 'group:staff' })).toBe('group:staff');
        expect(ownerEmail({})).toBe('');
        expect(ownerEmail(undefined)).toBe('');
    });
});

describe('nodeTitle', () => {
    it('falls back from name to reason to id', () => {
        expect(nodeTitle({ name: 'Budget A', reason: 'r', id: '1' })).toBe('Budget A');
        expect(nodeTitle({ reason: 'Course project', id: '1' })).toBe('Course project');
        expect(nodeTitle({ id: '1' })).toBe('1');
        expect(nodeTitle(null)).toBe('');
    });

    // An imported project is named by OpenStack, not by us — showing our own
    // empty name for it would make it unidentifiable in the very list where
    // someone has to decide whether to adopt it.
    it('prefers the OpenStack name for imported nodes', () => {
        expect(nodeTitle({ status: 'imported', os_project_name: 'legacy-proj', name: 'ignored' }))
            .toBe('legacy-proj');
        expect(nodeTitle({ status: 'imported', os_project_id: 'abc123' })).toBe('abc123');
    });
});

describe('usedAmount / freeAmount', () => {
    const budget = {
        limit: { cpu: 10 },
        usage: {
            approved: { limit: { cpu: 4 } },
            pending: { limit: { cpu: 1 } },
        },
    };

    it('sums usage across every status', () => {
        expect(usedAmount(budget, 'cpu')).toBe(5);
        expect(usedAmount(budget, 'ram')).toBe(0);
        expect(usedAmount({}, 'cpu')).toBe(0);
    });

    it('subtracts usage from the cap', () => {
        expect(freeAmount(budget, 'cpu')).toBe(5);
    });

    // A missing cap is not a cap of zero: an uncapped budget must not read as
    // "full", which is what a 0 default would do at every call site.
    it('treats an unset or unlimited cap as infinite', () => {
        expect(freeAmount({ limit: {} }, 'cpu')).toBe(Infinity);
        expect(freeAmount({ limit: { cpu: UNLIMITED_QUOTA } }, 'cpu')).toBe(Infinity);
        expect(freeAmount({ limit: { cpu: null } }, 'cpu')).toBe(Infinity);
    });

    it('can go negative when a budget is over-committed', () => {
        expect(freeAmount({ limit: { cpu: 2 }, usage: { approved: { limit: { cpu: 5 } } } }, 'cpu')).toBe(-3);
    });
});

describe('quotaFits', () => {
    const budget = { limit: { cpu: 10, ram: 32 }, usage: { approved: { limit: { cpu: 4 } } } };

    it('is true only when every resource fits', () => {
        expect(quotaFits(budget, { cpu: 6, ram: 32 }, RESOURCES)).toBe(true);
        expect(quotaFits(budget, { cpu: 7, ram: 32 }, RESOURCES)).toBe(false);
        expect(quotaFits(budget, { cpu: 6, ram: 33 }, RESOURCES)).toBe(false);
    });

    it('treats a resource the request omits as zero', () => {
        expect(quotaFits(budget, { cpu: 6 }, RESOURCES)).toBe(true);
    });
});

describe('autoApproveHeadroom', () => {
    const budget = {
        id: 'b1',
        limit: { cpu: 10, ram: 64 },
        usage: { approved: { limit: { cpu: 4 } } },
        auto_approve: { per_requester_limit: { cpu: 8, ram: 16 } },
    };

    it('returns null when the budget has no auto-approve policy', () => {
        expect(autoApproveHeadroom({ id: 'b1' }, RESOURCES, [])).toBeNull();
    });

    it('subtracts what this user already holds under the budget', () => {
        const mine = [{ parent_id: 'b1', status: 'approved', limit: { cpu: 3, ram: 4 } }];
        expect(autoApproveHeadroom(budget, RESOURCES, mine)).toEqual({ cpu: 5, ram: 12 });
    });

    // The server grants instantly only while BOTH hold: the personal cap and
    // the budget's own capacity. Mirroring just the personal half would promise
    // an instant approval the backend then refuses.
    it('is capped by the budget’s remaining capacity, not only by the personal limit', () => {
        const tight = { ...budget, limit: { cpu: 6, ram: 64 }, usage: { approved: { limit: { cpu: 4 } } } };
        expect(autoApproveHeadroom(tight, RESOURCES, []).cpu).toBe(2); // personal 8, free 2
    });

    it('counts only active projects of this user under this budget', () => {
        const mine = [
            { parent_id: 'b1', status: 'approved', limit: { cpu: 1 } },
            { parent_id: 'b1', status: 'change_pending', limit: { cpu: 1 } },
            { parent_id: 'b1', status: 'pending', limit: { cpu: 4 } },   // not yet granted
            { parent_id: 'b1', status: 'released', limit: { cpu: 4 } },  // gone
            { parent_id: 'other', status: 'approved', limit: { cpu: 4 } },
        ];
        expect(autoApproveHeadroom(budget, RESOURCES, mine).cpu).toBe(6); // 8 - 2
    });

    it('never goes below zero when the user is already over the cap', () => {
        const mine = [{ parent_id: 'b1', status: 'approved', limit: { cpu: 20 } }];
        expect(autoApproveHeadroom(budget, RESOURCES, mine).cpu).toBe(0);
    });
});

describe('resourceSummaryText', () => {
    it('joins the non-zero resources with their units', () => {
        expect(resourceSummaryText(RESOURCES, { cpu: 8, ram: 16 })).toBe('8 vCPUs · 16 GB RAM');
    });

    it('leaves out what was not requested', () => {
        expect(resourceSummaryText(RESOURCES, { cpu: 8, ram: 0 })).toBe('8 vCPUs');
        expect(resourceSummaryText(RESOURCES, {})).toBe('');
    });

    it('writes an unlimited quota as ∞', () => {
        expect(resourceSummaryText(RESOURCES, { cpu: UNLIMITED_QUOTA })).toBe('∞ vCPUs');
    });
});

describe('statusLabel / isProvisioning', () => {
    it('translates the known statuses and passes an unknown one through', () => {
        expect(statusLabel('pending')).toBe('Awaiting approval');
        expect(statusLabel('approved')).toBe('Active');
        expect(statusLabel('whatever')).toBe('whatever');
    });

    // "Active" for a project OpenStack has not created yet sends people looking
    // for something that is not there; the reconciler runs on an interval.
    it('says "Setting up" for an approved leaf without an OpenStack project', () => {
        const node = { kind: 'project', status: 'approved' };
        expect(isProvisioning(node, true)).toBe(true);
        expect(statusLabel('approved', true)).toBe('Setting up');
    });

    it('is not provisioning once the project exists, or when nothing provisions', () => {
        expect(isProvisioning({ kind: 'project', status: 'approved', os_project_id: 'x' }, true)).toBe(false);
        expect(isProvisioning({ kind: 'project', status: 'approved' }, false)).toBe(false);
        expect(isProvisioning({ kind: 'budget', status: 'approved' }, true)).toBe(false);
    });
});

describe('requestType', () => {
    it('classifies what a manager has to decide on', () => {
        expect(requestType({ status: 'imported' })).toBe('imported');
        expect(requestType({ status: 'change_pending' })).toBe('change');
        expect(requestType({ status: 'pending', kind: 'budget' })).toBe('budget');
        expect(requestType({ status: 'pending', kind: 'project' })).toBe('project');
    });

    it('returns null for anything that waits for nobody', () => {
        expect(requestType({ status: 'approved', kind: 'project' })).toBeNull();
        expect(requestType(undefined)).toBeNull();
    });
});

describe('resourceBarSegments', () => {
    it('turns amounts into rounded percentages', () => {
        expect(resourceBarSegments(10, { approved: 5 })).toEqual({
            approvedPct: 50, pendingPct: 0, incomingPct: 0, totalPct: 50,
        });
    });

    // The clamping is the reason this is a function: three segments that each
    // rounded up would otherwise draw a bar wider than its own track.
    it('never lets the segments sum past 100', () => {
        const s = resourceBarSegments(10, { approved: 8, changePending: 8, incoming: 8 });
        expect(s.approvedPct).toBe(80);
        expect(s.pendingPct).toBe(20);
        expect(s.incomingPct).toBe(0);
        expect(s.totalPct).toBe(100);
    });

    it('clamps a single over-committed segment', () => {
        expect(resourceBarSegments(10, { approved: 25 }).approvedPct).toBe(100);
    });

    it('reports zero rather than dividing by a zero or negative limit', () => {
        expect(resourceBarSegments(0, { approved: 5 }).totalPct).toBe(0);
        expect(resourceBarSegments(-1, { approved: 5 }).totalPct).toBe(0);
    });

    it('defaults every amount to zero', () => {
        expect(resourceBarSegments(10)).toEqual({
            approvedPct: 0, pendingPct: 0, incomingPct: 0, totalPct: 0,
        });
    });
});

describe('limitDelta', () => {
    it('reports before, after and the difference', () => {
        expect(limitDelta({ cpu: 4 }, { cpu: 10 }, 'cpu')).toEqual({ before: 4, after: 10, d: 6 });
        expect(limitDelta({ cpu: 10 }, { cpu: 4 }, 'cpu')).toEqual({ before: 10, after: 4, d: -6 });
    });

    it('treats a missing key as zero', () => {
        expect(limitDelta({}, { cpu: 2 }, 'cpu')).toEqual({ before: 0, after: 2, d: 2 });
        expect(limitDelta(undefined, undefined, 'cpu')).toEqual({ before: 0, after: 0, d: 0 });
    });
});

describe('nodeChanges', () => {
    const users = (...tokens) => tokens.map(t => ({ token: t, openstack_role: 'member' }));

    it('reports nothing when nothing moved', () => {
        const c = nodeChanges({
            resources: RESOURCES,
            limitFrom: { cpu: 4 }, limitTo: { cpu: 4 },
            dateFrom: '2027-01-01', dateTo: '2027-01-01',
            usersFrom: users('user:a'), usersTo: users('user:a'),
        });
        expect(c.hasLimitChange).toBe(false);
        expect(c.hasDateChange).toBe(false);
        expect(c.hasUserChanges).toBe(false);
    });

    it('sees a limit change on any single resource', () => {
        expect(nodeChanges({
            resources: RESOURCES, limitFrom: { cpu: 4, ram: 8 }, limitTo: { cpu: 4, ram: 16 },
        }).hasLimitChange).toBe(true);
    });

    it('compares dates by instant, not by string', () => {
        expect(nodeChanges({ dateFrom: '2027-01-01T00:00:00Z', dateTo: '2027-01-01T00:00:00.000Z' })
            .hasDateChange).toBe(false);
        expect(nodeChanges({ dateFrom: '2027-01-01', dateTo: '2027-06-01' }).hasDateChange).toBe(true);
    });

    it('splits members into added, removed and role-changed', () => {
        const c = nodeChanges({
            usersFrom: [
                { token: 'user:keep', openstack_role: 'member' },
                { token: 'user:gone', openstack_role: 'member' },
                { token: 'user:promoted', openstack_role: 'member' },
            ],
            usersTo: [
                { token: 'user:keep', openstack_role: 'member' },
                { token: 'user:new', openstack_role: 'member' },
                { token: 'user:promoted', openstack_role: 'reader' },
            ],
        });
        expect(c.added.map(u => u.token)).toEqual(['user:new']);
        expect(c.removed.map(u => u.token)).toEqual(['user:gone']);
        expect(c.roleChanged.map(u => u.token)).toEqual(['user:promoted']);
        // Both ends of the arrow, so the caller need not rebuild the lookup.
        expect(c.roleChanged[0]).toMatchObject({ previous_role: 'member', openstack_role: 'reader' });
        expect(c.hasUserChanges).toBe(true);
    });

    // The API returns members in no guaranteed order; comparing by position
    // would report every reorder as a change and show a diff with no content.
    it('ignores a reorder', () => {
        expect(nodeChanges({
            usersFrom: users('user:a', 'user:b'),
            usersTo: users('user:b', 'user:a'),
        }).hasUserChanges).toBe(false);
    });

    // "not editing members" and "editing them down to none" must not collapse:
    // the second removes everybody and has to show up as a change.
    it('distinguishes an absent member list from an empty one', () => {
        expect(nodeChanges({ usersFrom: users('user:a') }).hasUserChanges).toBe(false);
        expect(nodeChanges({ usersFrom: users('user:a'), usersTo: [] }).hasUserChanges).toBe(true);
    });

    it('copes with being called with nothing at all', () => {
        const c = nodeChanges();
        expect(c.hasLimitChange).toBe(false);
        expect(c.hasUserChanges).toBe(false);
    });
});

describe('normalizeObjectResponse', () => {
    it('unwraps res.data and a doubly nested res.data.data', () => {
        expect(normalizeObjectResponse({ data: { a: 1 } })).toEqual({ a: 1 });
        expect(normalizeObjectResponse({ data: { data: { a: 1 } } })).toEqual({ a: 1 });
    });

    it('passes a bare object through and falls back otherwise', () => {
        expect(normalizeObjectResponse({ a: 1 })).toEqual({ a: 1 });
        expect(normalizeObjectResponse([1, 2])).toEqual({});
        expect(normalizeObjectResponse(null, { fallback: true })).toEqual({ fallback: true });
    });
});

describe('isExpired / expiryTone', () => {
    it('knows a past date from a future one', () => {
        expect(isExpired(daysFromNow(-1))).toBe(true);
        expect(isExpired(daysFromNow(1))).toBe(false);
        expect(isExpired(undefined)).toBe(false);
    });

    // Two steps, not a traffic light: grey until it matters, then a warning,
    // then red. A date days away is the most important thing on the card.
    it('escalates as the date approaches', () => {
        expect(expiryTone(daysFromNow(400))).toBe('gray');
        expect(expiryTone(daysFromNow(30))).toBe('orange');
        expect(expiryTone(daysFromNow(3))).toBe('red');
        expect(expiryTone(daysFromNow(-10))).toBe('red');
        expect(expiryTone(null)).toBe('gray');
    });
});

// The two rules below are the same ones the API's chargedQuota carries, and
// each of them is a way to understate usage if it is dropped.
describe('overageEntries / overageText', () => {
    const resources = [
        { id: 'cores', name: 'Cores' },
        { id: 'ram', name: 'RAM', unit: 'GB' },
        { id: 'storage', name: 'Storage', unit: 'GB' },
    ];

    it('reports only what OpenStack measures above the limit', () => {
        const node = { limit: { cores: 4, ram: 2, storage: 5 }, os_in_use: { cores: 8, ram: 1 } };
        expect(overageEntries(resources, node).map(r => r.id)).toEqual(['cores']);
        expect(overageText(overageEntries(resources, node))).toBe('8 Cores');
    });

    // A key missing from os_in_use means "not measured", not zero — treating it
    // as zero would be an overage of nothing and hide the ones that are real.
    it('ignores resources OpenStack does not measure', () => {
        const node = { limit: { cores: 4, storage: 5 }, os_in_use: { cores: 4 } };
        expect(overageEntries(resources, node)).toEqual([]);
    });

    // max(-1, n) would turn "no cap" into a finite number and report an overage
    // against a project that cannot have one.
    it('never treats an unlimited limit as exceeded', () => {
        const node = { limit: { cores: -1 }, os_in_use: { cores: 9999 } };
        expect(overageEntries(resources, node)).toEqual([]);
    });

    it('is empty when nothing was measured at all', () => {
        expect(overageEntries(resources, { limit: { cores: 4 } })).toEqual([]);
        expect(overageEntries(null, { os_in_use: { cores: 8 } })).toEqual([]);
    });

    it('formats several resources with their units', () => {
        const node = { limit: { cores: 4, ram: 2 }, os_in_use: { cores: 8, ram: 5 } };
        expect(overageText(overageEntries(resources, node))).toBe('8 Cores · 5 GB RAM');
    });
});

// The budget tree's per-branch query results, collapsed into one lookup.
//
// The container type is the point of these tests. react-query passes a
// `combine` result through replaceEqualDeep, which only preserves the previous
// reference for plain objects and arrays — a Map comes back as a new reference
// every time, the memoised tree data is rebuilt, and Mantine's Tree
// re-initialises its controller on every render. That shipped once
// (0.8.13-test.1) and took the whole section down with "Maximum update depth
// exceeded", so the shape is asserted rather than assumed.
describe('childrenById', () => {
    const page = (n) => ({ items: [{ id: `n${n}` }], total: 1 });

    it('is a plain object, so structural sharing can keep its identity', () => {
        const out = childrenById(['a'], [{ data: page(1) }]);
        expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
        expect(out instanceof Map).toBe(false);
    });

    it('keys each page by its node id', () => {
        const a = page(1);
        const b = page(2);
        expect(childrenById(['a', 'b'], [{ data: a }, { data: b }])).toEqual({ a, b });
    });

    it('leaves out branches that have no data yet', () => {
        const loaded = page(1);
        const out = childrenById(['pending', 'loaded'], [{ data: undefined }, { data: loaded }]);
        expect(out).toEqual({ loaded });
        expect('pending' in out).toBe(false);
    });

    // A branch whose query failed has no data either, and must not appear as an
    // empty page — budgetsToTreeData reads a missing entry as "not loaded" and
    // an empty one as "this budget has nothing in it".
    it('leaves out branches whose query failed', () => {
        expect(childrenById(['broken'], [{ data: undefined, isError: true }])).toEqual({});
    });

    // Same values in, same values out: the reference cannot be preserved by this
    // function, but the pages it hands back must be the very objects react-query
    // holds, or replaceEqualDeep has nothing to recognise.
    it('passes the page objects through untouched', () => {
        const p = page(1);
        expect(childrenById(['a'], [{ data: p }]).a).toBe(p);
    });
});
