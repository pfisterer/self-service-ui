import { DEFAULT_JOB_MAX_HOURS, DEFAULT_JOBS_PER_PERSON } from '/gpu/jobs.js';

// The AI service's values where no budget sets a cap (the caps it declares in os-mgt's catalogue, see projects/util-caps.js), by cap id: its release times (catalogue releaseDefaults, per kind) and what switching batch jobs on in a budget sets. The budget dialog shows them as placeholders and starts with them; the ids are the AI service's.

const RELEASE_FIELDS = { 'idle-open': 'idle_open_minutes', 'idle-closed': 'idle_closed_minutes', 'max-hours': 'max_hours' };

// aiCapDefaults is the defaults by cap id; releaseDefaults: the AI service catalogue's (may be missing, then only the batch job defaults).
export function aiCapDefaults(releaseDefaults) {
    const out = { 'batch-jobs-per-person': DEFAULT_JOBS_PER_PERSON, 'batch-max-hours': DEFAULT_JOB_MAX_HOURS };
    for (const [kind, times] of Object.entries(releaseDefaults || {})) {
        for (const [suffix, field] of Object.entries(RELEASE_FIELDS)) {
            const v = times?.[field];
            if (v !== undefined && v !== null) out[`release-${kind}-${suffix}`] = v;
        }
    }
    return out;
}
