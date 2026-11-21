import { firstParagraph } from '/helper/markdown.js';

// Helpers of the page of usable model names (available.jsx), over the answer of getUsableModels: { names: [{ name, kind, base, projects, deployments, healthy, limits: { min, max }, models: [{ model, description, devices }] }], health_known }.

// The example call's address when the service names none (me.api_url).
export const DEFAULT_API_URL = 'https://api.llm.services.dhbw.cloud/v1';

// shortTokens writes a token count the way context sizes are spoken of: 24576 → 24k, 98304 → 96k, 1000 → 1k; '' for none.
export function shortTokens(n) {
    if (!n || n <= 0) return '';
    if (n < 1024) return String(n);
    const k = n / 1024;
    return `${Number.isInteger(k) ? k : k.toFixed(k < 10 ? 1 : 0)}k`;
}

// One side of a range: "24k", or "24k–96k" when smallest and largest differ.
function span(lo, hi) {
    const a = shortTokens(lo), b = shortTokens(hi);
    if (!a && !b) return '';
    if (!a || !b || a === b) return a || b;
    return `${a}–${b}`;
}

// contextLabel is the context of a range of limits in short form, prompt / answer: "24k / 8k", for an alias with differing deployments "24k–96k / 8k–32k"; '' when none declares one.
export function contextLabel(limits) {
    const input = span(limits?.min?.max_input_tokens, limits?.max?.max_input_tokens);
    const output = span(limits?.min?.max_output_tokens, limits?.max?.max_output_tokens);
    if (!input && !output) return '';
    return `${input || '?'} / ${output || '?'}`;
}

// summaryOf is the short description of a name: the summary of the first model behind it that has a description, else the first paragraph of its text; '' when none of its models is described.
export function summaryOf(entry) {
    for (const m of entry?.models ?? []) {
        const d = m.description;
        if (!d) continue;
        const s = d.summary?.trim() || firstParagraph(d.description);
        if (s) return s;
    }
    return '';
}

// healthState says how a name is doing: 'none' (nothing serves it right now), 'unknown' (health not readable), 'ok' (every deployment healthy), 'partial' or 'down'.
export function healthState(entry, healthKnown) {
    if (!entry?.deployments) return 'none';
    if (!healthKnown) return 'unknown';
    if (entry.healthy >= entry.deployments) return 'ok';
    return entry.healthy > 0 ? 'partial' : 'down';
}

// curlExample is a short call of the chat completions under the name, with the key from an environment variable.
export function curlExample(apiUrl, name) {
    const base = String(apiUrl || DEFAULT_API_URL).replace(/\/+$/, '');
    const body = JSON.stringify({ model: name, messages: [{ role: 'user', content: 'Hallo!' }] });
    return [
        `curl ${base}/chat/completions \\`,
        '  -H "Authorization: Bearer $DHBW_API_KEY" \\',
        '  -H "Content-Type: application/json" \\',
        `  -d '${body}'`,
    ].join('\n');
}
