import { formatDuration } from '/helper/duration.js';

// Release times of a project (docs/todo.md idle_release in aiaas-deployment): what its servers per profile and its GPU kernels enforce, in seconds, as the AI service sends them with the project (release in the start options, release_effective in the project list). max 0 = no upper bound.

// releaseOf is what a server of the profile in the project enforces; null when the AI service sends no release times (then the profile's own limits apply).
export function releaseOf(project, profile) {
    return project?.release?.servers?.[profile] ?? project?.release_effective?.servers?.[profile] ?? null;
}

// kernelReleaseOf is what the project's GPU kernels enforce, or null.
export function kernelReleaseOf(project) {
    return project?.release?.kernel ?? project?.release_effective?.kernel ?? null;
}

// releaseIdle is the idle part: "Rückgabe nach 30 Min. ohne Aktivität, ohne offenen Tab nach 10 Min.".
export function releaseIdle(r, t, lang) {
    const open = formatDuration(r.idle_open * 1000, lang);
    if (r.idle_open === r.idle_closed) return t('gpu.release.idle', { open });
    return t('gpu.release.idleBoth', { open, closed: formatDuration(r.idle_closed * 1000, lang) });
}

// oneDot ends a sentence that ends in an abbreviation ("nach 8 Std.") with that abbreviation's dot, not a second one.
export function oneDot(text) {
    return text.replace(/\.\.(?=\s|$)/g, '.');
}

// releaseText is the whole sentence for a start: idle times and the upper bound.
export function releaseText(r, t, lang) {
    const idle = releaseIdle(r, t, lang);
    return oneDot(r.max > 0 ? t('gpu.release.withMax', { idle, max: formatDuration(r.max * 1000, lang) }) : t('gpu.release.noMax', { idle }));
}

const RELEASE_FIELDS = { 'idle-open': 'idle_open_minutes', 'idle-closed': 'idle_closed_minutes', 'max-hours': 'max_hours' };

// releaseCapDefaults is the AI service's release times where no budget sets any (releaseDefaults of its catalogue, per kind) by the id of the cap in os-mgt (release-<kind>-<time>): what the budget dialog shows as placeholder of an empty release time. Empty without the catalogue. They depend on the AI service's profiles, which is why they are no Cap.Default.
export function releaseCapDefaults(releaseDefaults) {
    const out = {};
    for (const [kind, times] of Object.entries(releaseDefaults || {})) {
        for (const [suffix, field] of Object.entries(RELEASE_FIELDS)) {
            const v = times?.[field];
            if (v !== undefined && v !== null) out[`release-${kind}-${suffix}`] = v;
        }
    }
    return out;
}
