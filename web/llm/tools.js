// Tools that accept an OpenAI- or Anthropic-compatible endpoint, with the setup guide each project publishes itself. Names and links are the projects' own and stay untranslated. Tools with `config` get a ready-made file or the fields to fill in from toolConfigs after a key was created.
export const VSCODE_DOCS = 'https://code.visualstudio.com/docs/agent-customization/language-models';
export const LITELLM_CLIENT_DOCS = 'https://docs.litellm.ai/docs/proxy/user_keys';

export const TOOLS = [
    { id: 'vscode', name: 'VS Code', url: VSCODE_DOCS },
    { id: 'opencode', name: 'OpenCode', url: 'https://opencode.ai/docs/providers/#custom-provider', config: true },
    { id: 'claude-code', name: 'Claude Code', url: 'https://code.claude.com/docs/en/llm-gateway', config: true },
    { id: 'codex', name: 'Codex', url: 'https://learn.chatgpt.com/docs/config-file/config-advanced', config: true },
    { id: 'continue', name: 'Continue', url: 'https://docs.continue.dev/customize/model-providers/top-level/openai', config: true },
    { id: 'cline', name: 'Cline', url: 'https://docs.cline.bot/provider-config/openai-compatible', config: true },
    { id: 'roo', name: 'Roo Code', url: 'https://roocodeinc.github.io/Roo-Code/providers/openai-compatible', config: true },
    { id: 'kilo', name: 'Kilo Code', url: 'https://kilo.ai/docs/code-with-ai/agents/custom-models', config: true },
    { id: 'zed', name: 'Zed', url: 'https://zed.dev/docs/ai/use-api-access#openai-compatible', config: true },
    { id: 'aider', name: 'Aider', url: 'https://aider.chat/docs/llms/openai-compat.html' },
    { id: 'cherry', name: 'Cherry Studio', url: 'https://docs.cherry-ai.com/en-us/pre-basic/providers' },
    { id: 'anythingllm', name: 'AnythingLLM', url: 'https://docs.anythingllm.com/setup/llm-configuration/cloud/openai-generic' },
    { id: 'msty', name: 'Msty', url: 'https://docs.msty.app/getting-started/onboarding/remote-model-providers' },
];

// The stable alias names. They are LiteLLM model groups, not concrete models, and the only names worth writing into a configuration. `agent` holds only models with a context of 64k and more, for coding agents; `code` and the chat aliases also run on machines with 32k.
export const STABLE_MODELS = ['chat-default', 'chat-fast', 'code', 'agent'];

// grantedModels: the names the service lists beyond the stable ones (getModelAliases), i.e. a model group a project of the person was granted, like chat-large. Everybody else never sees them.
export function grantedModels(aliases) {
    return (aliases?.aliases ?? []).map(a => a.alias).filter(a => !STABLE_MODELS.includes(a)).sort();
}

// The display name of a granted model group in the tools: chat-large → DHBW Large.
export const grantedName = (alias) => `DHBW ${alias.replace(/^chat-/, '').replace(/(^|-)(\w)/g, (_, sep, c) => (sep ? ' ' : '') + c.toUpperCase())}`;

// What every deployment behind an alias takes when the service names no limit (an older service, or no deployment declares one): a 32k Mac, prompt plus answer. `agent` promises 64k.
const DEFAULT_LIMITS = {
    agent: { input: 57344, output: 8192 },
    'chat-fast': { input: 12288, output: 4096 },
};
const DEFAULT_LIMIT = { input: 24576, output: 8192 };

// limitsFrom turns the answer of getModelAliases into { alias: { input, output } }: the longest prompt and answer every deployment of the alias takes. Tools that know these numbers shorten their history themselves; without them the backend cuts the beginning off.
export function limitsFrom(aliases) {
    const out = {};
    for (const a of aliases?.aliases ?? []) {
        const input = a.limit?.max_input_tokens;
        const output = a.limit?.max_output_tokens;
        if (input > 0) out[a.alias] = { input, output: output > 0 ? output : (DEFAULT_LIMITS[a.alias] ?? DEFAULT_LIMIT).output };
    }
    return out;
}

export function limitOf(limits, alias) {
    return limits?.[alias] ?? DEFAULT_LIMITS[alias] ?? DEFAULT_LIMIT;
}

// What the files hold in place of the key when none was just created: the variable the shell examples set.
export const KEY_PLACEHOLDER = '$DHBW_API_KEY';

// The display name of a model in the tools: the stable aliases by their own names, anything else as a granted group (chat-large → DHBW Large).
const DISPLAY_NAMES = { agent: 'DHBW Agent', code: 'DHBW Code', 'chat-default': 'DHBW Chat', 'chat-fast': 'DHBW Schnell' };
export const displayName = (id) => DISPLAY_NAMES[id] ?? grantedName(id);

// toolCallsOf says whether a usable name takes tool calls: true when every model behind it is described with tool_calls true, false when one is described without, null when that is not known.
export function toolCallsOf(entry) {
    const models = entry?.models ?? [];
    if (models.some(m => m.description?.tool_calls === false)) return false;
    if (models.length > 0 && models.every(m => m.description?.tool_calls === true)) return true;
    return null;
}

// modelPlan turns the usable names (getUsableModels) into what the configurations name: list holds every name the person may use, in the service's order, limits each one's smallest limits (what all its deployments take), tools whether it takes tool calls. agent is the default of the coding agents, only ever a name known to take tool calls: agent, else the first alias with them, else the first name with them; when none is known, a name not known to lack them stands in (agentKnown false). chat is the default of the other tools (chat-default), small the one for titles and summaries (chat-fast if usable).
export function modelPlan(usable) {
    const names = usable?.names ?? [];
    const list = names.map(n => n.name);
    const tools = Object.fromEntries(names.map(n => [n.name, toolCallsOf(n)]));
    const limits = limitsFrom({ aliases: names.map(n => ({ alias: n.name, limit: n.limits?.min })) });
    const has = (id) => list.includes(id);
    const chat = has('chat-default') ? 'chat-default' : (list[0] ?? 'chat-default');
    const withTools = names.filter(n => tools[n.name] === true);
    const unknown = names.filter(n => tools[n.name] === null);
    const agent = (tools.agent === true && 'agent') || withTools.find(n => n.kind !== 'model')?.name || withTools[0]?.name
        || (tools.agent === null && 'agent') || unknown.find(n => n.kind !== 'model')?.name || chat;
    const small = has('chat-fast') && tools['chat-fast'] !== false ? 'chat-fast' : chat;
    return { list: list.length ? list : [chat], limits, tools, agent, chat, small, agentKnown: tools[agent] === true };
}

// The API base without a trailing slash, e.g. https://api.llm.services.dhbw.cloud/v1; Anthropic clients want the root without /v1.
const base = (apiUrl) => apiUrl.replace(/\/+$/, '');
const root = (apiUrl) => base(apiUrl).replace(/\/v1$/, '');

// A name takes tool calls unless one of its models is described without them.
const takesTools = (plan, id) => plan.tools?.[id] !== false;

// Model entries for VS Code (Copilot Chat, provider "Custom Endpoint", file chatLanguageModels.json), one per usable name, chat-default first. The id is the LiteLLM name — the most common mistake was the provider's name there ("Invalid model name"). maxInputTokens is what every deployment behind the name takes; VS Code then summarises the history itself.
const VSCODE_NAME_KEYS = { code: 'code', agent: 'agent', 'chat-default': 'chat', 'chat-fast': 'fast' };
export const vscodeName = (names, id) => (VSCODE_NAME_KEYS[id] ? names[VSCODE_NAME_KEYS[id]] : grantedName(id));
export function vscodeModels(apiUrl, names, plan) {
    const url = `${base(apiUrl)}/chat/completions`;
    const m = (id) => {
        const l = limitOf(plan.limits, id);
        return { id, name: vscodeName(names, id), url, toolCalling: takesTools(plan, id), vision: false, maxInputTokens: l.input, maxOutputTokens: l.output };
    };
    return JSON.stringify({ models: [plan.chat, ...plan.list.filter(id => id !== plan.chat)].map(m) }, null, 2).slice(2, -2).replace(/^ {2}/gm, '');
}

// Ready-made configuration for the agents, with the key filled in: files for OpenCode, Claude Code, Codex, Continue, Kilo Code and Zed, each naming its file and the place it belongs (the code is what goes into it); for Cline and Roo Code, which read no file, the fields to fill in and every name with its limits. `plan` comes from modelPlan: every name a tool can hold, the agents on plan.agent, the others on plan.chat. With KEY_PLACEHOLDER as key, the shell line for Codex and Zed asks for the key instead.
export function toolConfigs(apiUrl, key, plan) {
    const main = limitOf(plan.limits, plan.agent);
    const envKey = key === KEY_PLACEHOLDER ? 'sk-…' : key;
    const withTools = plan.list.filter(id => plan.tools?.[id] === true && id !== plan.agent);

    // OpenCode: provider "dhbw" through @ai-sdk/openai-compatible; limit.context is prompt plus answer, OpenCode compacts before it. Sharing a session would upload it to opencode.ai, so it is off.
    const ocModels = () => Object.fromEntries(plan.list.map(id => {
        const l = limitOf(plan.limits, id);
        return [id, { name: displayName(id), tool_call: takesTools(plan, id), limit: { context: l.input + l.output, output: l.output } }];
    }));
    const opencode = JSON.stringify({
        $schema: 'https://opencode.ai/config.json',
        provider: {
            dhbw: {
                npm: '@ai-sdk/openai-compatible',
                name: 'DHBW',
                options: { baseURL: base(apiUrl), apiKey: key },
                models: ocModels(),
            },
        },
        model: `dhbw/${plan.agent}`,
        small_model: `dhbw/${plan.small}`,
        share: 'disabled',
    }, null, 2);

    // Claude Code: the gateway speaks Anthropic's Messages API at its root. Every model slot names the agents' default, since Claude Code calls tools in each of them and keeps a single context setting; without CLAUDE_CODE_MAX_CONTEXT_TOKENS it assumes 200k for an unknown name and compacts far too late. CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC keeps telemetry and error reports from going to Anthropic.
    const claude = JSON.stringify({
        env: {
            ANTHROPIC_BASE_URL: root(apiUrl),
            ANTHROPIC_AUTH_TOKEN: key,
            ANTHROPIC_MODEL: plan.agent,
            ANTHROPIC_DEFAULT_OPUS_MODEL: plan.agent,
            ANTHROPIC_DEFAULT_SONNET_MODEL: plan.agent,
            ANTHROPIC_DEFAULT_HAIKU_MODEL: plan.agent,
            CLAUDE_CODE_SUBAGENT_MODEL: plan.agent,
            CLAUDE_CODE_MAX_CONTEXT_TOKENS: String(main.input + main.output),
            CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(main.output),
            CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
            CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '1',
        },
    }, null, 2);

    // Codex: only the Responses API (wire_api), the key from the environment variable DHBW_API_KEY; auto-compaction below the context of the default. Codex names one model per file; the other names with tool calls become profiles (codex --profile NAME), each with its own context.
    const codexProfile = (id) => {
        const l = limitOf(plan.limits, id);
        return ['', `[profiles."${id}"]`, `model = "${id}"`, 'model_provider = "dhbw"', `model_context_window = ${l.input + l.output}`, `model_auto_compact_token_limit = ${l.input}`];
    };
    const codex = [
        `model = "${plan.agent}"`,
        'model_provider = "dhbw"',
        `model_context_window = ${main.input + main.output}`,
        `model_auto_compact_token_limit = ${main.input}`,
        '',
        '[model_providers.dhbw]',
        'name = "DHBW"',
        `base_url = "${base(apiUrl)}"`,
        'env_key = "DHBW_API_KEY"',
        'wire_api = "responses"',
        ...withTools.flatMap(codexProfile),
        '',
    ].join('\n');

    // Continue (config.yaml): every name, chat-default first, which Continue takes as the default for chat, edits and agent mode; tool_use only where the name takes tool calls. contextLength is prompt plus answer.
    const cModel = (name, model, l, tools) => [
        `  - name: ${name}`,
        '    provider: openai',
        `    model: ${model}`,
        `    apiBase: ${base(apiUrl)}`,
        `    apiKey: ${key}`,
        '    roles: [chat, edit, apply]',
        ...(tools ? ['    capabilities: [tool_use]'] : []),
        '    defaultCompletionOptions:',
        `      contextLength: ${l.input + l.output}`,
        `      maxTokens: ${l.output}`,
    ];
    const cont = [
        'name: DHBW',
        'version: 1.0.0',
        'schema: v1',
        'models:',
        ...[plan.chat, ...plan.list.filter(id => id !== plan.chat)].flatMap(id => cModel(displayName(id), id, limitOf(plan.limits, id), takesTools(plan, id))),
        '',
    ].join('\n');

    // Kilo Code (VS Code extension and CLI, a fork of OpenCode): the same provider block in kilo.jsonc, which both read.
    const kilo = JSON.stringify({
        $schema: 'https://app.kilo.ai/config.json',
        provider: {
            dhbw: {
                npm: '@ai-sdk/openai-compatible',
                name: 'DHBW',
                options: { baseURL: base(apiUrl), apiKey: key },
                models: ocModels(),
            },
        },
        model: `dhbw/${plan.agent}`,
        small_model: `dhbw/${plan.small}`,
    }, null, 2);

    // Zed: an OpenAI-compatible provider "dhbw" in settings.json; Zed takes the key from the variable DHBW_API_KEY it derives from the provider's name (or from its agent settings) and never from the file. max_tokens is the whole context, prompt plus answer.
    const zModel = (id) => {
        const l = limitOf(plan.limits, id);
        return {
            name: id, display_name: displayName(id), max_tokens: l.input + l.output, max_output_tokens: l.output,
            capabilities: { tools: takesTools(plan, id), images: false, parallel_tool_calls: false, prompt_cache_key: false },
        };
    };
    const zed = JSON.stringify({
        language_models: {
            openai_compatible: {
                dhbw: {
                    api_url: base(apiUrl),
                    available_models: plan.list.map(zModel),
                },
            },
        },
        agent: {
            default_model: { provider: 'dhbw', model: plan.agent },
            thread_summary_model: { provider: 'dhbw', model: plan.small },
            commit_message_model: { provider: 'dhbw', model: plan.small },
        },
    }, null, 2);

    // Cline and Roo Code keep their providers in the extension's own storage and import no file: the fields of the provider "OpenAI Compatible" to fill in, for the agents' default (the agent mode), and every name with its limits for further profiles.
    const fields = [
        { key: 'baseUrl', value: base(apiUrl) },
        { key: 'apiKey', value: key },
        { key: 'modelId', value: plan.agent },
        { key: 'contextWindow', value: String(main.input + main.output) },
        { key: 'maxOutput', value: String(main.output) },
    ];
    const rows = plan.list.map(id => {
        const l = limitOf(plan.limits, id);
        return { id, context: l.input + l.output, output: l.output };
    });

    return [
        { id: 'opencode', name: 'OpenCode', file: 'opencode.json', path: '~/.config/opencode/opencode.json', language: 'json', code: opencode },
        { id: 'claude-code', name: 'Claude Code', file: 'settings.json', path: '~/.claude/settings.json', language: 'json', code: claude },
        { id: 'codex', name: 'Codex', file: 'config.toml', path: '~/.codex/config.toml', language: 'ini', code: codex, env: `export DHBW_API_KEY=${envKey}` },
        { id: 'continue', name: 'Continue', file: 'config.yaml', path: '~/.continue/config.yaml', language: 'yaml', code: cont },
        { id: 'kilo', name: 'Kilo Code', file: 'kilo.jsonc', path: '~/.config/kilo/kilo.jsonc', language: 'json', code: kilo },
        { id: 'zed', name: 'Zed', file: 'settings.json', path: '~/.config/zed/settings.json', language: 'json', code: zed, env: `export DHBW_API_KEY=${envKey}` },
        { id: 'cline', name: 'Cline', fields, models: rows },
        { id: 'roo', name: 'Roo Code', fields, models: rows },
    ];
}
