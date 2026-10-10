// The cached server state of the LLM section (see dyndns/query-keys.js for
// why keys are arrays). `me` is read by the navigation on every page, so it is
// the one key the rest of the app touches.
export const llmKeys = {
    me: () => ['llm', 'me'],
    usage: () => ['llm', 'usage'],
    fleet: () => ['llm', 'fleet'],
    fleetInference: () => ['llm', 'fleet', 'inference'],
    accessRules: () => ['llm', 'access-rules'],
    tiers: () => ['llm', 'tiers'],
    gpuTiers: () => ['llm', 'gpu-tiers'],
    // Prefix only; the autocomplete appends the search term and limit.
    principals: () => ['llm', 'principals'],
};
