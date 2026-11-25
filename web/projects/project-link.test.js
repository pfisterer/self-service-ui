import { describe, it, expect } from 'vitest';
import { linkTarget } from './project-link.js';

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
