// Batch jobs (docs/architektur.md "Batch-Jobs" in aiaas-deployment): GPU jobs without a workspace, in the project's environment with the person's home and ~/project-shared. The bounds below are the AI service's (workspace/jobs.go).

// The run time of a job when the project sets none (job_max_hours 0), and the most a project may allow.
export const DEFAULT_JOB_MAX_HOURS = 4;
export const MAX_JOB_HOURS = 24;
// What switching jobs on in a project sets as jobs per person, and the run times offered for the project's maximum.
export const DEFAULT_JOBS_PER_PERSON = 2;
export const JOB_HOUR_CHOICES = [1, 2, 4, 8, 12, 24];

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
    if (values.llmProject) body.llm_project = values.llmProject;
    return body;
}

// shellQuote quotes a word for a POSIX shell: as it is when it holds only harmless characters, else in single quotes (a single quote inside as '\'').
export function shellQuote(s) {
    if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(s)) return s;
    return `'${s.replace(/'/g, `'\\''`)}'`;
}

// jobCommandLine is the dhbw-cloud command (the PyPI package dhbw-cloud) that submits the same job as the form: options left out where they are empty or the project's default (the run time when it is the project's maximum, the GPU class when the project has one); the command is one argument, which the CLI runs in a shell as it is. placeholder stands in for a command or notebook not yet given.
export function jobCommandLine(project, gpuClass, values, maxHours, placeholder) {
    const parts = ['dhbw-cloud', 'job', 'submit', '--project', shellQuote(project)];
    if (gpuClass) parts.push('--gpu-class', shellQuote(gpuClass));
    if (values.name?.trim()) parts.push('--name', shellQuote(values.name.trim()));
    if (values.maxHours !== '' && Number(values.maxHours) > 0 && Number(values.maxHours) !== maxHours) parts.push('--max-hours', String(Number(values.maxHours)));
    if (values.workingDir?.trim()) parts.push('--workdir', shellQuote(values.workingDir.trim()));
    if (values.llmProject) parts.push('--llm-project', shellQuote(values.llmProject));
    if (values.mode === 'notebook') parts.push('--notebook', values.notebook?.trim() ? shellQuote(values.notebook.trim()) : placeholder);
    else parts.push('--', values.command?.trim() ? shellQuote(values.command.trim()) : placeholder);
    return parts.join(' ');
}

// parentPath is the folder above path (relative to the home), or null at root, the top a person may see ('' = the home).
export function parentPath(path, root) {
    if (!path || path === root) return null;
    const i = path.lastIndexOf('/');
    const up = i < 0 ? '' : path.slice(0, i);
    return root && !(up === root || up.startsWith(root + '/')) ? null : up;
}

// formatBytes is a file size for people (B, KB, MB, GB, binary steps).
export function formatBytes(n) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let v = n || 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return i === 0 ? `${v} B` : `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}
