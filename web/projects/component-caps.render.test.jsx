// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { CAPS, renderView } from '/test/render-harness.jsx';
import i18n from '/i18n/index.js';
import { CapsInputs } from '/projects/component-caps.jsx';

afterEach(cleanup);

// The batch-jobs grant block of the catalogue: two caps switched on and off together.
const BATCH = CAPS.filter(c => c.together === 'batch-jobs');
const toggle = () => screen.getByRole('switch', { name: new RegExp(`^${i18n.t('projects.caps.together.batch-jobs.label')}`) });
const reason = () => i18n.t('projects.caps.together.batch-jobs.notGranted');

describe('the batch-jobs switch', () => {
    it('is shown disabled with the reason when the budget above has not granted it', () => {
        renderView(<CapsInputs catalog={BATCH} value={{}} inherited={{}} onChange={() => {}} />);
        expect(toggle().disabled).toBe(true);
        expect(toggle().checked).toBe(false);
        expect(screen.getByText(reason())).toBeTruthy();
    });

    it('can be switched on without a reason where the budget above grants it', () => {
        renderView(<CapsInputs catalog={BATCH} value={{}} inherited={{ 'batch-jobs-per-person': 2, 'batch-max-hours': 4 }} onChange={() => {}} />);
        expect(toggle().disabled).toBe(false);
        expect(screen.queryByText(reason())).toBeNull();
    });

    it('stays on and can be switched off where the budget has its own values, even without a grant above', () => {
        renderView(<CapsInputs catalog={BATCH} value={{ 'batch-jobs-per-person': 1, 'batch-max-hours': 2 }} inherited={{}} onChange={() => {}} />);
        expect(toggle().checked).toBe(true);
        expect(toggle().disabled).toBe(false);
        expect(screen.queryByText(reason())).toBeNull();
    });

    it('names the reason in German', async () => {
        await i18n.changeLanguage('de');
        try {
            renderView(<CapsInputs catalog={BATCH} value={{}} inherited={{}} onChange={() => {}} />);
            expect(screen.getByText('Batch-Jobs sind im übergeordneten Budget nicht freigegeben. Erst dort einschalten.')).toBeTruthy();
        } finally {
            await i18n.changeLanguage('en');
        }
    });
});
