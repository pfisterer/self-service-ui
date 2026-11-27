// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderView } from '/test/render-harness.jsx';
import i18n from '/i18n/index.js';

// RowButtons (new layout, list view): the buttons of a row stand one under the other in a fixed order, so they line up from row to row.

const { RowButtons } = await import('/projects/project-tile.jsx');

afterEach(cleanup);

const labels = () => screen.getAllByRole('button').map(b => b.textContent);

describe('RowButtons', () => {
    it('shows primary, second and "Details" in this order and runs them', () => {
        const ran = [];
        renderView(<RowButtons actions={{ primary: 'openstack', secondary: 'edit', menu: [] }} run={(id) => ran.push(id)} />);
        expect(labels()).toEqual(['openstack', 'edit', 'details'].map(id => i18n.t(`projects.v2.action.${id}`)));
        fireEvent.click(screen.getByRole('button', { name: i18n.t('projects.v2.action.details') }));
        expect(ran).toEqual(['details']);
    });

    it('keeps the order of the others when one is missing', () => {
        renderView(<RowButtons actions={{ primary: 'openstack', secondary: 'details', menu: [] }} run={() => {}} />);
        expect(labels()).toEqual(['openstack', 'details'].map(id => i18n.t(`projects.v2.action.${id}`)));
    });
});
