// Batch jobs of a budget (batch_jobs in os-mgt): whether the projects below it have batch jobs at the AI service, how many a person may have waiting and running at once (jobs_per_person) and how long one may run (max_hours). Like a resource they are there or not: not set = none, here and below. The root sets the most anybody gets; a budget below may switch them on only where the budget above has them (inherited_batch_jobs), with values at most those; a budget that inherits its limit passes on those above. For a project the strictest value along its chain applies.

import { MAX_JOB_HOURS } from '/gpu/jobs.js';

// normalizeBatchJobs is the value as the API takes it: null when not set (or without jobs or run time), else both numbers.
export function normalizeBatchJobs(v) {
    if (v === null || v === undefined || typeof v !== 'object') return null;
    const jobs = Number(v.jobs_per_person) || 0;
    const hours = Number(v.max_hours) || 0;
    return jobs > 0 && hours > 0 ? { jobs_per_person: jobs, max_hours: hours } : null;
}

// stricterBatchJobs is the fewer jobs and the shorter run time of two values that are both on.
function stricter(a, b) {
    return { jobs_per_person: Math.min(a.jobs_per_person, b.jobs_per_person), max_hours: Math.min(a.max_hours, b.max_hours) };
}

// effectiveBatchJobs is what applies below a node: for one that inherits its limit what it inherits; for the root its own; else its own within what it inherits, null when either is missing.
export function effectiveBatchJobs(node) {
    if (!node) return null;
    const above = normalizeBatchJobs(node.inherited_batch_jobs);
    if (node.inherits_limit) return above;
    const own = normalizeBatchJobs(node.batch_jobs);
    if (own === null) return null;
    if (!node.parent_id) return own;
    return above === null ? null : stricter(own, above);
}

// sameBatchJobs compares two values after normalizing them.
export function sameBatchJobs(a, b) {
    return JSON.stringify(normalizeBatchJobs(a)) === JSON.stringify(normalizeBatchJobs(b));
}

// batchJobsErrors checks a budget's own value like the server does, keyed by the form path (batchJobs): at least 1 job, 1 to MAX_JOB_HOURS hours; below the root only where the budget above has them, and at most its values.
export function batchJobsErrors(t, value, above, isRoot) {
    if (value === null || value === undefined) return {};
    const jobs = Number(value.jobs_per_person);
    const hours = Number(value.max_hours);
    if (!Number.isInteger(jobs) || jobs < 1) return { batchJobs: t('projects.batchJobs.errPerPerson') };
    if (!Number.isInteger(hours) || hours < 1 || hours > MAX_JOB_HOURS) return { batchJobs: t('projects.batchJobs.errHours', { max: MAX_JOB_HOURS }) };
    if (isRoot) return {};
    const a = normalizeBatchJobs(above);
    if (a === null) return { batchJobs: t('projects.batchJobs.errNoneAbove') };
    if (jobs > a.jobs_per_person) return { batchJobs: t('projects.batchJobs.errPerPersonAbove', { value: a.jobs_per_person }) };
    if (hours > a.max_hours) return { batchJobs: t('projects.batchJobs.errHoursAbove', { value: a.max_hours }) };
    return {};
}

// batchJobsSummary is a value for the history and the hints: "none", or "2 per person, up to 4 hours".
export function batchJobsSummary(t, v) {
    const n = normalizeBatchJobs(v);
    if (n === null) return t('projects.batchJobs.off');
    return t('projects.batchJobs.onValue', { count: n.jobs_per_person, hours: n.max_hours });
}
