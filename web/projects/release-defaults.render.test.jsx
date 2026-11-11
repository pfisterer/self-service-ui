// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { CAPS, renderView } from '/test/render-harness.jsx';
import i18n from '/i18n/index.js';
import { CapsInputs } from '/projects/component-caps.jsx';
import { releaseCapDefaults } from '/gpu/release.js';
import { ReleaseRow } from '/gpu/workspace-settings.jsx';

afterEach(cleanup);

// The AI service's catalogue (releaseDefaults): what an empty release time stands for where no budget sets one.
const DEFAULTS = { cpu: { idle_open_minutes: 120, idle_closed_minutes: 90, max_hours: 12 }, gpu: { idle_open_minutes: 5, idle_closed_minutes: 5, max_hours: 4 } };

describe('release times show the AI service default with its value', () => {
    // The release caps of the catalogue: the generic inputs with the AI service's defaults by cap id.
    const RELEASE = CAPS.filter(c => c.id.startsWith('release-'));
    const value = (id, v) => i18n.t('projects.caps.standardValue', { value: `${v} ${i18n.t(`projects.caps.${id}.unit`)}` });

    it('in the budget dialog, where no budget above sets one', () => {
        renderView(<CapsInputs catalog={RELEASE} value={{}} inherited={{ 'release-gpu-max-hours': 2 }} defaults={releaseCapDefaults(DEFAULTS)} onChange={() => {}} />);
        expect(screen.getByPlaceholderText(value('release-cpu-idle-open', 120))).toBeTruthy();
        expect(screen.getByPlaceholderText(value('release-cpu-idle-closed', 90))).toBeTruthy();
        expect(screen.getByPlaceholderText(value('release-cpu-max-hours', 12))).toBeTruthy();
        // A value above wins over the default.
        expect(screen.getByPlaceholderText(i18n.t('projects.caps.fromAbove', { value: `2 ${i18n.t('projects.caps.release-gpu-max-hours.unit')}` }))).toBeTruthy();
        expect(screen.queryByPlaceholderText(value('release-gpu-max-hours', 4))).toBeNull();
    });

    it('in the budget dialog without the catalogue: only "default"', () => {
        renderView(<CapsInputs catalog={RELEASE} value={{}} inherited={{}} onChange={() => {}} />);
        expect(screen.getAllByPlaceholderText(i18n.t('projects.caps.standard'))).toHaveLength(6);
    });

    it('in the project settings', () => {
        renderView(<ReleaseRow kind="gpu" value={{}} inherited={{ idle_open_minutes: 3 }} defaults={DEFAULTS.gpu} onChange={() => {}} />);
        expect(screen.getByPlaceholderText(i18n.t('gpu.release.fromBudget', { value: '3' }))).toBeTruthy();
        expect(screen.getByPlaceholderText(i18n.t('gpu.release.standardMinutes', { value: 5 }))).toBeTruthy();
        expect(screen.getByPlaceholderText(i18n.t('gpu.release.standardHours', { value: 4 }))).toBeTruthy();
    });
});
