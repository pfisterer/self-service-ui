// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderView } from '/test/render-harness.jsx';
import i18n from '/i18n/index.js';
import { BatchJobsBox } from '/gpu/workspace-settings.jsx';
import { notAllowedKey } from '/gpu/jobs.jsx';

afterEach(cleanup);

const project = (extra = {}) => ({ slug: 'kurs', name: 'Kurs', gpu_classes: ['l4-3q'], gpus_by_class: { 'l4-3q': 1 }, budgets: [], limits: { jobs_per_person: 2, job_max_hours: 8 }, ...extra });

describe('batch jobs of a project', () => {
    it('come from the budget: shown, locked and saying so, also for an admin', () => {
        renderView(<BatchJobsBox p={project({ tree_jobs: true })} setLimit={() => {}} locked={false} classes={[]} />);
        expect(screen.getByText(i18n.t('gpu.projects.jobs.fromTree'))).toBeTruthy();
        expect(screen.getByRole('switch').disabled).toBe(true);
        expect(screen.getByDisplayValue('2').readOnly).toBe(true);
    });

    it('without a value from the budget an admin sets them as before', () => {
        renderView(<BatchJobsBox p={project()} setLimit={() => {}} locked={false} classes={[]} />);
        expect(screen.queryByText(i18n.t('gpu.projects.jobs.fromTree'))).toBeNull();
        expect(screen.getByRole('switch').disabled).toBe(false);
        expect(screen.getByDisplayValue('2').readOnly).toBe(false);
    });

    it('a project without jobs says who switches them on', () => {
        expect(notAllowedKey({ tree_node: 'p_1', tree_jobs: true }, true)).toBe('gpu.jobs.notAllowedByBudget');
        expect(notAllowedKey({ tree_node: 'p_1' }, false)).toBe('gpu.jobs.notAllowed');
        expect(notAllowedKey({ tree_node: 'p_1' }, true)).toBe('gpu.jobs.notAllowedAdmin');
        expect(notAllowedKey({}, false)).toBe('gpu.jobs.notAllowedNoBudget');
    });
});
