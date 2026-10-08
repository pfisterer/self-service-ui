import { describe, expect, it } from 'vitest';
import { budgetLabel, budgetPathText, pathNames } from './component-budget-path.jsx';

describe('budget paths', () => {
    const path = [{ id: 'ma', name: 'DHBW Mannheim' }, { id: 'lec', name: 'Vorlesung' }];
    it('names a budget by the way to it', () => {
        expect(budgetPathText(path, 'Vorlesung')).toBe('DHBW Mannheim › Vorlesung');
    });
    it('falls back to the name where there is no path', () => {
        expect(pathNames([], 'Organization Root')).toEqual(['Organization Root']);
        expect(budgetPathText(undefined, 'X')).toBe('X');
        expect(budgetPathText(undefined, '')).toBe('');
    });
    it('labels a budget by its parent path plus itself', () => {
        expect(budgetLabel({ id: 'k', name: 'Kurs', parent_path: path })).toBe('DHBW Mannheim › Vorlesung › Kurs');
        expect(budgetLabel({ id: 'top', name: 'CAS' })).toBe('CAS');
    });
});
