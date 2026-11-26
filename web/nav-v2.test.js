import { describe, expect, it } from 'vitest';
import { legacyRedirect, navSectionsV2, subNavRuns } from './nav-v2.js';

const t = (key) => key;
const ids = (sections) => sections.map(s => s.id);
const items = (sections, id) => sections.find(s => s.id === id)?.items.map(i => i.href) ?? [];

const STUDENT = { cloudProjects: true, dnsZones: true, workspaces: 'member', llmArea: 'member', llm: {} };
const STAFF = { ...STUDENT, hasBudgets: true, groupsVisible: true };
const ADMIN = { ...STAFF, isRoot: true, llm: { isAdmin: true, isFleetAdmin: true } };

describe('navSectionsV2', () => {
    it('has at most five entries and no Start (the logo is the way there)', () => {
        for (const ctx of [STUDENT, STAFF, ADMIN]) {
            const s = navSectionsV2(t, ctx);
            expect(s.length).toBeLessThanOrEqual(5);
            expect(ids(s)).not.toContain('home');
        }
    });

    it('gives a student four entries, without Verwaltung', () => {
        expect(ids(navSectionsV2(t, STUDENT))).toEqual(['projects', 'workspaces', 'llm', 'dyndns']);
    });

    it('gives budget managers Verwaltung with budgets and groups only', () => {
        const s = navSectionsV2(t, STAFF);
        expect(ids(s)).toEqual(['projects', 'workspaces', 'llm', 'dyndns', 'admin']);
        expect(items(s, 'admin')).toEqual(['/admin/budgets', '/admin/groups']);
    });

    it('adds the fleets, the models and the root admin for admins', () => {
        expect(items(navSectionsV2(t, ADMIN), 'admin')).toEqual(['/admin/budgets', '/admin/groups', '/admin/workspaces/gpus', '/admin/llm/fleet', '/admin/llm/models', '/admin/budgets/admin']);
    });

    it('offers someone who may request sub-budgets the budgets too', () => {
        expect(items(navSectionsV2(t, { ...STUDENT, canRequestBudgets: true }), 'admin')).toEqual(['/admin/budgets']);
    });

    it('draws the kinds as one group and the resources apart', () => {
        const runs = subNavRuns(navSectionsV2(t, STUDENT).find(x => x.id === 'projects').items);
        expect(runs.map(r => r.items.map(i => i.href))).toEqual([['/projects/all', '/projects/cloud', '/projects/workspaces', '/projects/llm'], ['/projects/offers']]);
        expect(runs.map(r => r.apart)).toEqual([false, true]);
    });

    it('lists the kinds as filters of the projects, and what one can get', () => {
        expect(items(navSectionsV2(t, STUDENT), 'projects')).toEqual(['/projects/all', '/projects/cloud', '/projects/workspaces', '/projects/llm', '/projects/offers']);
        expect(items(navSectionsV2(t, { cloudProjects: true }), 'projects')).toEqual(['/projects/all', '/projects/cloud', '/projects/offers']);
    });

    it('keeps the workspace and LLM tools for their members only; an offer is reached through the projects', () => {
        const s = navSectionsV2(t, { ...STUDENT, workspaces: 'offer', llmArea: false });
        expect(ids(s)).toEqual(['projects', 'dyndns']);
        expect(items(s, 'projects')).toContain('/projects/workspaces');
    });

    it('has the TLS certificates beside the zones, the administration only with a rule', () => {
        expect(items(navSectionsV2(t, STUDENT), 'dyndns')).toEqual(['/dyndns/zones', '/dyndns/tls']);
        // The zones' administration is under "Verwaltung", not next to the zones.
        expect(items(navSectionsV2(t, { ...STUDENT, hasPolicy: true }), 'dyndns')).toEqual(['/dyndns/zones', '/dyndns/tls']);
        expect(items(navSectionsV2(t, { ...STUDENT, hasPolicy: true }), 'admin')).toContain('/admin/dns/administration');
    });

    it('goes to the first item and marks waiting decisions on Verwaltung', () => {
        const s = navSectionsV2(t, { ...STAFF, pending: 2 });
        const admin = s.find(x => x.id === 'admin');
        expect(admin.href).toBe('/admin/budgets');
        expect(admin.dot).toBe(true);
    });
});

describe('legacyRedirect', () => {
    it('sends the old project lists to the filters, with their query', () => {
        expect(legacyRedirect('/cloud/projects', '?project=p1')).toBe('/projects/cloud?project=p1');
        expect(legacyRedirect('/cloud')).toBe('/projects/cloud');
        expect(legacyRedirect('/workspaces/projects')).toBe('/projects/workspaces');
        expect(legacyRedirect('/llm/projects', 'project=x')).toBe('/projects/llm?project=x');
    });

    it('moves budgets, groups, fleets and models below /admin, with what is below them', () => {
        expect(legacyRedirect('/budgets')).toBe('/admin/budgets');
        expect(legacyRedirect('/budgets/b_1')).toBe('/admin/budgets/b_1');
        expect(legacyRedirect('/budgets/admin/users')).toBe('/admin/budgets/admin/users');
        expect(legacyRedirect('/groups/g1')).toBe('/admin/groups/g1');
        expect(legacyRedirect('/dyndns/administration/delegations')).toBe('/admin/dns/administration/delegations');
        expect(legacyRedirect('/workspaces/gpus')).toBe('/admin/workspaces/gpus');
        expect(legacyRedirect('/llm/fleet/nodes')).toBe('/admin/llm/fleet/nodes');
        expect(legacyRedirect('/llm/models')).toBe('/admin/llm/models');
    });

    it('leaves everything else where it is', () => {
        for (const p of ['/', '/projects', '/projects/start', '/cloud/tokens', '/cloud/api-doc', '/workspaces/servers', '/workspaces/jobs/1', '/llm/keys', '/dyndns/zones', '/budgetsx', '/admin/budgets']) {
            expect(legacyRedirect(p), p).toBeNull();
        }
    });
});
