import { describe, it, expect } from 'vitest';
import { linkTarget, linkedPaths } from './project-link.js';

const RES = [{ id: 'cores', kind: 'cloud' }];
const p = (s) => new URLSearchParams(s);

describe('linkTarget', () => {
    it('opens an own project in the list of its area, with the card marked', () => {
        const mine = [{ id: 'p_1', quotas: {} }];
        expect(linkTarget({ params: p('project=p_1'), mine, resources: RES, sections: { cloud: true } })).toBe('/cloud/projects?project=p_1');
        expect(linkTarget({ params: p('project=p_1'), mine, resources: RES, sections: { workspaces: true } })).toBe('/workspaces/projects?project=p_1');
    });
    it('opens every other node in Budgets', () => {
        expect(linkTarget({ params: p('project=p_2'), mine: [], sections: { cloud: true } })).toBe('/budgets/p_2');
        expect(linkTarget({ params: p('budget=b_1') })).toBe('/budgets/b_1');
        expect(linkTarget({ params: p('node=a_1') })).toBe('/budgets/a_1');
        expect(linkTarget({ params: p('') })).toBe('/');
    });
});

describe('linkedPaths', () => {
    it('finds a project under every budget paying for it', () => {
        const project = {
            kind: 'project', allocations: [
                { budget_id: 'b_grund', status: 'approved', budget_path: [{ id: 'b_ma' }, { id: 'b_grund' }] },
                { budget_id: 'b_kurs', status: 'change_pending', budget_path: [{ id: 'b_kurs' }] },
                { budget_id: 'b_old', status: 'ended', budget_path: [{ id: 'b_old' }] },
            ],
        };
        expect(linkedPaths(project)).toEqual([['b_ma', 'b_grund'], ['b_kurs']]);
        // Given up: under the budgets that paid.
        expect(linkedPaths({ kind: 'project', allocations: [{ budget_id: 'b_x', status: 'released' }] })).toEqual([['b_x']]);
    });
    it('follows a budget’s or an allocation’s own parents', () => {
        expect(linkedPaths({ kind: 'allocation', parent_path: [{ id: 'b_ma' }, { id: 'b_grund' }] })).toEqual([['b_ma', 'b_grund']]);
        expect(linkedPaths(null)).toEqual([]);
    });
});
