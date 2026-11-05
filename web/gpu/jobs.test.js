import { describe, expect, it } from 'vitest';
import { DEFAULT_JOB_MAX_HOURS, formatBytes, isActive, jobBody, jobCommandLine, jobErrors, jobMaxHours, jobProjects, MAX_JOB_HOURS, parentPath, shellQuote } from '/gpu/jobs.js';

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

    it('quotes words for the shell only where needed', () => {
        expect(shellQuote('train.py')).toBe('train.py');
        expect(shellQuote('python train.py')).toBe("'python train.py'");
        expect(shellQuote("echo 'a' | tee x")).toBe(`'echo '\\''a'\\'' | tee x'`);
    });

    it('writes the command line for the form, without defaults', () => {
        const v = { mode: 'command', command: 'python train.py --epochs 10', notebook: '', name: '', workingDir: '', maxHours: 8 };
        expect(jobCommandLine('t-1', '', v, 8, '<cmd>')).toBe("dhbw-cloud job submit --project t-1 -- 'python train.py --epochs 10'");
        expect(jobCommandLine('t-1', 'l4', { ...v, name: 'run-1', maxHours: 2, workingDir: 'kurs a' }, 8, '<cmd>'))
            .toBe("dhbw-cloud job submit --project t-1 --gpu-class l4 --name run-1 --max-hours 2 --workdir 'kurs a' -- 'python train.py --epochs 10'");
        expect(jobCommandLine('t-1', '', { ...v, command: 'nvidia-smi' }, 8, '<cmd>')).toBe('dhbw-cloud job submit --project t-1 -- nvidia-smi');
        expect(jobCommandLine('t-1', '', { ...v, command: ' ' }, 8, '<cmd>')).toBe('dhbw-cloud job submit --project t-1 -- <cmd>');
        expect(jobCommandLine('t-1', '', { ...v, mode: 'notebook', notebook: 'kurs/a.ipynb' }, 8, '<nb>')).toBe('dhbw-cloud job submit --project t-1 --notebook kurs/a.ipynb');
    });
});

describe('job LLM and files', () => {
    const v = { mode: 'command', command: 'python train.py', notebook: '', name: '', workingDir: '', maxHours: 8 };
    it('sends the LLM project only when chosen, also on the command line', () => {
        expect(jobBody('ml', '', v)).not.toHaveProperty('llm_project');
        expect(jobBody('ml', '', { ...v, llmProject: 'none' }).llm_project).toBe('none');
        expect(jobCommandLine('t-1', '', { ...v, llmProject: 't-llm' }, 8, '<cmd>')).toBe("dhbw-cloud job submit --project t-1 --llm-project t-llm -- 'python train.py'");
    });
    it('goes up to the root only', () => {
        expect(parentPath('jobs/train/ckpt', '')).toBe('jobs/train');
        expect(parentPath('jobs', '')).toBe('');
        expect(parentPath('', '')).toBeNull();
        expect(parentPath('jobs/train', 'jobs/train')).toBeNull();
        expect(parentPath('jobs/train/a', 'jobs/train')).toBe('jobs/train');
    });
    it('formats sizes', () => {
        expect(formatBytes(0)).toBe('0 B');
        expect(formatBytes(2048)).toBe('2.0 KB');
        expect(formatBytes(5 * 1024 ** 3)).toBe('5.0 GB');
    });
});
