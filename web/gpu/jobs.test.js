import { describe, expect, it } from 'vitest';
import { DEFAULT_JOB_MAX_HOURS, isActive, jobBody, jobErrors, jobMaxHours, jobProjects, MAX_JOB_HOURS } from '/gpu/jobs.js';

const t = (key, vars) => (vars ? `${key} ${JSON.stringify(vars)}` : key);

describe('batch jobs', () => {
    it('knows which jobs still change on their own', () => {
        expect(isActive({ state: 'queued' })).toBe(true);
        expect(isActive({ state: 'running' })).toBe(true);
        expect(isActive({ state: 'failed' })).toBe(false);
        expect(isActive(undefined)).toBe(false);
    });

    it('offers the projects of the start options that allow jobs, with their limits', () => {
        const start = [{ slug: 'a', name: 'A', gpu_classes: [{ id: 'l4' }] }, { slug: 'b', name: 'B' }, { slug: 'c', name: 'C' }];
        const mine = [{ slug: 'a', role: 'manager', limits: { jobs_per_person: 2, job_max_hours: 8 } }, { slug: 'b', limits: { jobs_per_person: 0 } }];
        const got = jobProjects(start, mine);
        expect(got.map(p => p.slug)).toEqual(['a']);
        expect(got[0]).toMatchObject({ name: 'A', role: 'manager', limits: { job_max_hours: 8 }, gpu_classes: [{ id: 'l4' }] });
        expect(jobProjects(undefined, undefined)).toEqual([]);
    });

    it('bounds the run time by the project, the default and the service maximum', () => {
        expect(jobMaxHours({ limits: { job_max_hours: 0 } })).toBe(DEFAULT_JOB_MAX_HOURS);
        expect(jobMaxHours({ limits: { job_max_hours: 10 } })).toBe(10);
        expect(jobMaxHours({ limits: { job_max_hours: 100 } })).toBe(MAX_JOB_HOURS);
        expect(jobMaxHours(undefined)).toBe(DEFAULT_JOB_MAX_HOURS);
    });

    it('checks a command or a notebook and the run time', () => {
        expect(jobErrors(t, { mode: 'command', command: 'python x.py', maxHours: 4 }, 4)).toEqual({});
        expect(jobErrors(t, { mode: 'command', command: ' ', maxHours: 4 }, 4).command).toContain('commandRequired');
        expect(jobErrors(t, { mode: 'notebook', notebook: '', command: 'x', maxHours: 4 }, 4).notebook).toContain('notebookRequired');
        expect(jobErrors(t, { mode: 'command', command: 'x', maxHours: 5 }, 4).maxHours).toContain('errHours');
        expect(jobErrors(t, { mode: 'command', command: 'x', maxHours: '' }, 4).maxHours).toContain('errHours');
    });

    it('sends only what was chosen', () => {
        expect(jobBody('ml', '', { mode: 'command', command: ' python x.py ', notebook: 'n.ipynb', name: '', workingDir: '', maxHours: 2 }))
            .toEqual({ project: 'ml', command: 'python x.py', max_hours: 2 });
        expect(jobBody('ml', 'l4', { mode: 'notebook', command: 'x', notebook: 'kurs/a.ipynb', name: 'run-1', workingDir: 'kurs', maxHours: 1.5 }))
            .toEqual({ project: 'ml', gpu_class: 'l4', name: 'run-1', notebook: 'kurs/a.ipynb', working_dir: 'kurs', max_hours: 1.5 });
    });
});
