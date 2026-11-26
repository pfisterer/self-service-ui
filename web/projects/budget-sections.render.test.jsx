// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderView } from '/test/render-harness.jsx';
import i18n from '/i18n/index.js';

// BudgetResourceSections (new layout): an open section shows its quantities. Mantine's Collapse opens with "expanded"; with any other prop the section stayed shut although its chevron said open.

const { BudgetResourceSections } = await import('/projects/component-budget-sections.jsx');

afterEach(cleanup);

const RESOURCES = [{ id: 'cores', name: 'Cores', area: 'cloud' }];
const NODE = { id: 'b1', limit: { cores: 100 }, usage: { approved: { limit: { cores: 8 } } }, subtree_in_use: { cores: 4 } };

describe('BudgetResourceSections', () => {
    it('shows the quantities of the open cloud section and hides them when it is folded', () => {
        renderView(<BudgetResourceSections node={NODE} resources={RESOURCES} />);
        const header = screen.getAllByRole('button').find(b => b.textContent.includes(i18n.t('projects.v2.budget.section.cloud')));
        expect(header.getAttribute('aria-expanded')).toBe('true');
        expect(screen.getByText('Cores').closest('[aria-hidden="true"]')).toBeNull();
        fireEvent.click(header);
        expect(header.getAttribute('aria-expanded')).toBe('false');
    });
});
