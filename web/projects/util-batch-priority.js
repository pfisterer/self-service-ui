// How the batch jobs of a budget's projects run at the AI service (batch_priority in os-mgt): "preemptible" (a workspace may evict a job, it starts again) or "guaranteed" (not evicted, same priority as workspaces). Not a quantity: the strictest value along the chain applies ("preemptible" wins), a budget may only tighten what the budgets above allow (inherited_batch_priority). Where no budget sets one, jobs are preemptible.

export const BATCH_GUARANTEED = 'guaranteed';
export const BATCH_PREEMPTIBLE = 'preemptible';

// normalizeBatchPriority is one of the two values, null when not set (or unknown).
export function normalizeBatchPriority(v) {
    return v === BATCH_GUARANTEED || v === BATCH_PREEMPTIBLE ? v : null;
}

// effectiveBatchPriority is what applies below a node: the stricter of its own value and what it inherits; null when neither is set.
export function effectiveBatchPriority(node) {
    const own = normalizeBatchPriority(node?.batch_priority);
    const above = normalizeBatchPriority(node?.inherited_batch_priority);
    if (own === BATCH_PREEMPTIBLE || above === BATCH_PREEMPTIBLE) return BATCH_PREEMPTIBLE;
    return own ?? above;
}

// batchPriorityErrors checks a budget's own value like the server does, keyed by the form path (batchPriority): "guaranteed" is refused under a budget that makes jobs preemptible.
export function batchPriorityErrors(t, value, above) {
    const v = normalizeBatchPriority(value);
    if (v === BATCH_GUARANTEED && normalizeBatchPriority(above) === BATCH_PREEMPTIBLE) {
        return { batchPriority: t('projects.batchPriority.errAbove') };
    }
    return {};
}

// batchPrioritySummary is a value for the history: "verdrängbar", "garantiert", or "none of its own".
export function batchPrioritySummary(t, v) {
    const n = normalizeBatchPriority(v);
    return n === null ? t('projects.batchPriority.none') : t(`projects.batchPriority.${n}`);
}
