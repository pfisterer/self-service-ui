import { UNLIMITED_QUOTA } from './util-project.jsx';

// The catalogue's LLM resources (PROVIDER_RESOURCES of the AI service, see openstack-management-api provider/aiaas): the token pool per 30 days in millions, and the rate limits per minute for the whole project, all members and keys together.
export const LLM_TOKENS = 'llm-mtokens';
export const LLM_RPM = 'llm-rpm';
export const LLM_TPM = 'llm-tpm';

// Below these a rate limit is set but hardly usable: a single chat request with its history and answer already takes a few thousand tokens, a coding agent sends 20 000 to 60 000 tokens per request (system prompt, tool definitions, history), and LiteLLM rejects a request larger than the per-minute token limit outright, however long the client waits. A coding tool also sends several requests per action. A budget may still set less on purpose (a test, a deliberate throttle), so the UI only warns and never blocks.
export const MIN_USABLE_TPM = 50_000;
export const MIN_USABLE_RPM = 5;

// What a project to try things out with sensibly gets: 10 M tokens per 30 days, 30 requests and 100 000 tokens per minute. Shown as a recommendation in the request form, not applied.
export const RECOMMENDED_LLM = { [LLM_TOKENS]: 10, [LLM_RPM]: 30, [LLM_TPM]: 100_000 };

// isLowRate: a rate that is set (more than 0, not unlimited) but below the usable minimum. 0 or missing is the AI service's default, -1 no limit — neither is low.
export function isLowRate(value, min) {
    return typeof value === 'number' && value > 0 && value < min;
}

// llmLimitIssues reads what keeps a project's LLM part from being usable out of its limit (allocations included): no tokens at all (no access to chat and API keys), and rate limits too low for a request to pass. Only for resources the catalogue has; null when it has none of them.
export function llmLimitIssues(limit, resources) {
    const ids = new Set((resources || []).map(r => r.id));
    if (![LLM_TOKENS, LLM_RPM, LLM_TPM].some(id => ids.has(id))) return null;
    const l = limit || {};
    const tokens = l[LLM_TOKENS];
    return {
        noTokens: ids.has(LLM_TOKENS) && !(tokens === UNLIMITED_QUOTA || (typeof tokens === 'number' && tokens > 0)),
        lowRpm: ids.has(LLM_RPM) && isLowRate(l[LLM_RPM], MIN_USABLE_RPM) ? l[LLM_RPM] : null,
        lowTpm: ids.has(LLM_TPM) && isLowRate(l[LLM_TPM], MIN_USABLE_TPM) ? l[LLM_TPM] : null,
    };
}

// lowRates: the rate limits of a pool as the AI service reports it (getUsage: rpm and tpm, 0 = no limit) that are too low to use, as { rpm, tpm } with null where fine.
export function lowRates(pool) {
    return {
        rpm: isLowRate(pool?.rpm, MIN_USABLE_RPM) ? pool.rpm : null,
        tpm: isLowRate(pool?.tpm, MIN_USABLE_TPM) ? pool.tpm : null,
    };
}

// hasLlmIssue: whether llmLimitIssues found anything to say.
export function hasLlmIssue(issues) {
    return !!issues && (issues.noTokens || issues.lowRpm !== null || issues.lowTpm !== null);
}
