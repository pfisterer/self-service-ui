// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { renderView } from '/test/render-harness.jsx';
import i18n from '/i18n/index.js';

// MoreMenu (new layout): a menu of one entry is that entry as a button, no "Mehr" to open first.

const { MoreMenu } = await import('/projects/project-tile.jsx');

afterEach(cleanup);

describe('MoreMenu', () => {
    it('shows a single entry directly and runs it', () => {
        const ran = [];
        renderView(<MoreMenu items={[{ id: 'release', danger: true }]} run={(id) => ran.push(id)} copied={false} />);
        expect(screen.queryByRole('button', { name: i18n.t('projects.v2.more') })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: i18n.t('projects.v2.action.release') }));
        expect(ran).toEqual(['release']);
    });

    it('keeps "Mehr" for two entries or more', () => {
        renderView(<MoreMenu items={[{ id: 'jobs', danger: false }, { id: 'release', danger: true }]} run={() => {}} copied={false} />);
        expect(screen.getByRole('button', { name: i18n.t('projects.v2.more') })).toBeTruthy();
    });
});
