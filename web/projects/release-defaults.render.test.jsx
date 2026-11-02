// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderView } from '/test/render-harness.jsx';
import i18n from '/i18n/index.js';
import { ReleaseMaxInputs } from '/projects/component-release-max.jsx';
import { ReleaseRow } from '/gpu/workspace-settings.jsx';

afterEach(cleanup);

// The AI service's catalogue (releaseDefaults): what an empty release time stands for where no budget sets one.
const DEFAULTS = { cpu: { idle_open_minutes: 120, idle_closed_minutes: 90, max_hours: 12 }, gpu: { idle_open_minutes: 5, idle_closed_minutes: 5, max_hours: 4 } };

describe('release times show the AI service default with its value', () => {
    it('in the budget dialog, where no budget above sets one', () => {
        renderView(<ReleaseMaxInputs value={{ cpu: {}, gpu: {} }} inherited={{ gpu: { max_hours: 2 } }} defaults={DEFAULTS} onChange={() => {}} />);
        expect(screen.getByPlaceholderText(i18n.t('projects.releaseMax.standardMinutes', { value: 120 }))).toBeTruthy();
        expect(screen.getByPlaceholderText(i18n.t('projects.releaseMax.standardMinutes', { value: 90 }))).toBeTruthy();
        expect(screen.getByPlaceholderText(i18n.t('projects.releaseMax.standardHours', { value: 12 }))).toBeTruthy();
        // A value above wins over the default.
        expect(screen.getByPlaceholderText(i18n.t('projects.releaseMax.fromAbove', { value: 2 }))).toBeTruthy();
        expect(screen.queryByPlaceholderText(i18n.t('projects.releaseMax.standardHours', { value: 4 }))).toBeNull();
    });

    it('in the budget dialog without the catalogue: only "default"', () => {
        renderView(<ReleaseMaxInputs value={{ cpu: {}, gpu: {} }} inherited={null} onChange={() => {}} />);
        expect(screen.getAllByPlaceholderText(i18n.t('projects.releaseMax.standard'))).toHaveLength(6);
    });

    it('in the project settings', () => {
        renderView(<ReleaseRow kind="gpu" value={{}} inherited={{ idle_open_minutes: 3 }} defaults={DEFAULTS.gpu} onChange={() => {}} />);
        expect(screen.getByPlaceholderText(i18n.t('gpu.release.fromBudget', { value: '3' }))).toBeTruthy();
        expect(screen.getByPlaceholderText(i18n.t('gpu.release.standardMinutes', { value: 5 }))).toBeTruthy();
        expect(screen.getByPlaceholderText(i18n.t('gpu.release.standardHours', { value: 4 }))).toBeTruthy();
    });
});
