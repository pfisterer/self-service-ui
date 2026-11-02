// Batch jobs (docs/architektur.md "Batch-Jobs" in aiaas-deployment): GPU jobs without a workspace, in the project's environment with the person's home and ~/project-shared. The bounds below are the AI service's (workspace/jobs.go).

// The run time of a job when the project sets none (job_max_hours 0), and the most a project may allow.
export const DEFAULT_JOB_MAX_HOURS = 4;
export const MAX_JOB_HOURS = 24;

// isActive: the job still waits or runs, so its state changes on its own.
export function isActive(job) {
    return job?.state === 'queued' || job?.state === 'running';
}

// projectHasJobs: the project allows batch jobs (its limits have jobs_per_person > 0).
export function projectHasJobs(project) {
    return (project?.limits?.jobs_per_person ?? 0) > 0;
}

// jobMaxHours is the longest a job of the project may run: its job_max_hours, else the default, never above MAX_JOB_HOURS.
export function jobMaxHours(project) {
    const h = project?.limits?.job_max_hours ?? 0;
    return h > 0 ? Math.min(h, MAX_JOB_HOURS) : DEFAULT_JOB_MAX_HOURS;
}

// jobProjects are the projects a person can submit a job in: those of the start options (name, GPU classes with their hardware, environment) whose project in the person's project list allows jobs; limits and role come from there.
export function jobProjects(startProjects, mine) {
    const bySlug = Object.fromEntries((mine ?? []).map(p => [p.slug, p]));
    return (startProjects ?? [])
        .filter(p => projectHasJobs(bySlug[p.slug]))
        .map(p => ({ ...p, limits: bySlug[p.slug].limits, role: bySlug[p.slug].role }));
}

// jobErrors checks the form like the server does, keyed by field: a command or a notebook (exactly one), a run time within the project's maximum.
export function jobErrors(t, values, maxHours) {
    const errors = {};
    if (values.mode === 'notebook' ? !values.notebook?.trim() : !values.command?.trim()) {
        errors[values.mode === 'notebook' ? 'notebook' : 'command'] = t(values.mode === 'notebook' ? 'gpu.jobs.submit.notebookRequired' : 'gpu.jobs.submit.commandRequired');
    }
    const h = Number(values.maxHours);
    if (!(h > 0) || h > maxHours) errors.maxHours = t('gpu.jobs.submit.errHours', { max: maxHours });
    return errors;
}

// jobBody is the request for the form's values: only the command or the notebook, empty fields left out.
export function jobBody(project, gpuClass, values) {
    const body = { project, max_hours: Number(values.maxHours) };
    if (gpuClass) body.gpu_class = gpuClass;
    if (values.name?.trim()) body.name = values.name.trim();
    if (values.mode === 'notebook') body.notebook = values.notebook.trim();
    else body.command = values.command.trim();
    if (values.workingDir?.trim()) body.working_dir = values.workingDir.trim();
    return body;
}
