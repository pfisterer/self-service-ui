// Tools that accept an OpenAI- or Anthropic-compatible endpoint, with the setup guide each project publishes itself. Names and links are the projects' own and stay untranslated. Tools with `config` get a ready-made file from toolConfigs after a key was created.
export const VSCODE_DOCS = 'https://code.visualstudio.com/docs/agent-customization/language-models';
export const LITELLM_CLIENT_DOCS = 'https://docs.litellm.ai/docs/proxy/user_keys';

export const TOOLS = [
    { id: 'vscode', name: 'VS Code', url: VSCODE_DOCS },
    { id: 'opencode', name: 'OpenCode', url: 'https://opencode.ai/docs/providers/#custom-provider', config: true },
    { id: 'claude-code', name: 'Claude Code', url: 'https://code.claude.com/docs/en/llm-gateway', config: true },
    { id: 'codex', name: 'Codex', url: 'https://learn.chatgpt.com/docs/config-file/config-advanced', config: true },
    { id: 'continue', name: 'Continue', url: 'https://docs.continue.dev/customize/model-providers/top-level/openai', config: true },
    { id: 'cline', name: 'Cline', url: 'https://docs.cline.bot/provider-config/openai-compatible' },
    { id: 'roo', name: 'Roo Code', url: 'https://docs.roocode.com/providers/openai-compatible' },
    { id: 'kilo', name: 'Kilo Code', url: 'https://kilo.ai/docs/ai-providers/openai-compatible' },
    { id: 'zed', name: 'Zed', url: 'https://zed.dev/docs/ai/llm-providers' },
    { id: 'aider', name: 'Aider', url: 'https://aider.chat/docs/llms/openai-compat.html' },
    { id: 'cherry', name: 'Cherry Studio', url: 'https://docs.cherry-ai.com/en-us/pre-basic/providers' },
    { id: 'anythingllm', name: 'AnythingLLM', url: 'https://docs.anythingllm.com/setup/llm-configuration/cloud/openai-generic' },
    { id: 'msty', name: 'Msty', url: 'https://docs.msty.app/getting-started/onboarding/remote-model-providers' },
];

// The stable alias names. They are LiteLLM model groups, not concrete models, and the only names worth writing into a configuration. `agent` holds only models with a context of 64k and more, for coding agents; `code` and the chat aliases also run on machines with 32k.
export const STABLE_MODELS = ['chat-default', 'chat-fast', 'code', 'agent'];

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

// The API base without a trailing slash, e.g. https://api.llm.services.dhbw.cloud/v1; Anthropic clients want the root without /v1.
const base = (apiUrl) => apiUrl.replace(/\/+$/, '');
const root = (apiUrl) => base(apiUrl).replace(/\/v1$/, '');

// Model entries for VS Code (Copilot Chat, provider "Custom Endpoint", file chatLanguageModels.json). The id is the LiteLLM alias — the most common mistake was the provider's name there ("Invalid model name"). maxInputTokens is what every machine behind the alias takes; VS Code then summarises the history itself.
export function vscodeModels(apiUrl, names, limits) {
    const url = `${base(apiUrl)}/chat/completions`;
    const m = (id, name) => {
        const l = limitOf(limits, id);
        return { id, name, url, toolCalling: true, vision: false, maxInputTokens: l.input, maxOutputTokens: l.output };
    };
    return JSON.stringify({
        models: [
            m('code', names.code),
            m('agent', names.agent),
            m('chat-default', names.chat),
            m('chat-fast', names.fast),
        ],
    }, null, 2).slice(2, -2).replace(/^ {2}/gm, '');
}

// Ready-made configuration files for the agents, with the key filled in: OpenCode, Claude Code, Codex and Continue. Each names its file and the place it belongs; the code is what goes into it.
export function toolConfigs(apiUrl, key, limits) {
    const agent = limitOf(limits, 'agent');
    const fast = limitOf(limits, 'chat-fast');
    const code = limitOf(limits, 'code');

    // OpenCode: provider "dhbw" through @ai-sdk/openai-compatible; limit.context is prompt plus answer, OpenCode compacts before it. Sharing a session would upload it to opencode.ai, so it is off.
    const ocModel = (name, l) => ({ name, tool_call: true, limit: { context: l.input + l.output, output: l.output } });
    const opencode = JSON.stringify({
        $schema: 'https://opencode.ai/config.json',
        provider: {
            dhbw: {
                npm: '@ai-sdk/openai-compatible',
                name: 'DHBW',
                options: { baseURL: base(apiUrl), apiKey: key },
                models: {
                    agent: ocModel('DHBW Agent', agent),
                    code: ocModel('DHBW Code', code),
                    'chat-fast': ocModel('DHBW Schnell', fast),
                },
            },
        },
        model: 'dhbw/agent',
        small_model: 'dhbw/chat-fast',
        share: 'disabled',
    }, null, 2);

    // Claude Code: the gateway speaks Anthropic's Messages API at its root. Every model slot names one of our aliases; without CLAUDE_CODE_MAX_CONTEXT_TOKENS it assumes 200k for an unknown name and compacts far too late. CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC keeps telemetry and error reports from going to Anthropic.
    const claude = JSON.stringify({
        env: {
            ANTHROPIC_BASE_URL: root(apiUrl),
            ANTHROPIC_AUTH_TOKEN: key,
            ANTHROPIC_MODEL: 'agent',
            ANTHROPIC_DEFAULT_OPUS_MODEL: 'agent',
            ANTHROPIC_DEFAULT_SONNET_MODEL: 'agent',
            ANTHROPIC_DEFAULT_HAIKU_MODEL: 'chat-fast',
            CLAUDE_CODE_SUBAGENT_MODEL: 'agent',
            CLAUDE_CODE_MAX_CONTEXT_TOKENS: String(agent.input + agent.output),
            CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(agent.output),
            CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
            CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '1',
        },
    }, null, 2);

    // Codex: only the Responses API (wire_api), the key from the environment variable DHBW_API_KEY; auto-compaction below the context of `agent`.
    const codex = [
        'model = "agent"',
        'model_provider = "dhbw"',
        `model_context_window = ${agent.input + agent.output}`,
        `model_auto_compact_token_limit = ${agent.input}`,
        '',
        '[model_providers.dhbw]',
        'name = "DHBW"',
        `base_url = "${base(apiUrl)}"`,
        'env_key = "DHBW_API_KEY"',
        'wire_api = "responses"',
        '',
    ].join('\n');

    // Continue (config.yaml): agent for chat and agent mode, code for edits; contextLength is prompt plus answer.
    const cModel = (name, model, l, roles) => [
        `  - name: ${name}`,
        '    provider: openai',
        `    model: ${model}`,
        `    apiBase: ${base(apiUrl)}`,
        `    apiKey: ${key}`,
        `    roles: [${roles.join(', ')}]`,
        '    capabilities: [tool_use]',
        '    defaultCompletionOptions:',
        `      contextLength: ${l.input + l.output}`,
        `      maxTokens: ${l.output}`,
    ];
    const cont = [
        'name: DHBW',
        'version: 1.0.0',
        'schema: v1',
        'models:',
        ...cModel('DHBW Agent', 'agent', agent, ['chat']),
        ...cModel('DHBW Code', 'code', code, ['chat', 'edit', 'apply']),
        '',
    ].join('\n');

    return [
        { id: 'opencode', name: 'OpenCode', file: 'opencode.json', path: '~/.config/opencode/opencode.json', language: 'json', code: opencode },
        { id: 'claude-code', name: 'Claude Code', file: 'settings.json', path: '~/.claude/settings.json', language: 'json', code: claude },
        { id: 'codex', name: 'Codex', file: 'config.toml', path: '~/.codex/config.toml', language: 'ini', code: codex, env: `export DHBW_API_KEY=${key}` },
        { id: 'continue', name: 'Continue', file: 'config.yaml', path: '~/.continue/config.yaml', language: 'yaml', code: cont },
    ];
}
