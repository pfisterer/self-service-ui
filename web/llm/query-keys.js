// The cached server state of the LLM section (see dyndns/query-keys.js for
// why keys are arrays). `me` is read by the navigation on every page, so it is
// the one key the rest of the app touches.
export const llmKeys = {
    me: () => ['llm', 'me'],
    usage: () => ['llm', 'usage'],
    fleet: () => ['llm', 'fleet'],
    fleetInference: () => ['llm', 'fleet', 'inference'],
    tiers: () => ['llm', 'tiers'],
    models: () => ['llm', 'models'],
    aliases: () => ['llm', 'aliases'],
    usable: () => ['llm', 'usable'],
    descriptions: () => ['llm', 'descriptions'],
    apiTokens: () => ['llm', 'api-tokens'],
    // Prefix only; the autocomplete appends the search term and limit.
    principals: () => ['llm', 'principals'],
};
