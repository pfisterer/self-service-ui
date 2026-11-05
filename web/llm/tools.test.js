import { describe, expect, it } from 'vitest';
import { grantedModels, grantedName, limitsFrom, toolConfigs, vscodeModels } from '/llm/tools.js';

const API = 'https://api.llm.services.dhbw.cloud/v1';
const ALIASES = {
    aliases: [
        { alias: 'code', models: [], limit: { max_input_tokens: 24576, max_output_tokens: 8192 } },
        { alias: 'agent', models: [], limit: { max_input_tokens: 122880, max_output_tokens: 8192 } },
        { alias: 'chat-fast', models: [], limit: { max_input_tokens: 0, max_output_tokens: 0 } },
    ],
};

describe('limits for the tools', () => {
    it('take what the service names and leave out aliases without one', () => {
        expect(limitsFrom(ALIASES)).toEqual({ code: { input: 24576, output: 8192 }, agent: { input: 122880, output: 8192 } });
        expect(limitsFrom(undefined)).toEqual({});
    });

    it('keep VS Code below the context of the smallest machine behind each alias', () => {
        const models = JSON.parse(`{${vscodeModels(API, { code: 'C', agent: 'A', chat: 'D', fast: 'F' }, limitsFrom(ALIASES))}}`).models;
        const by = Object.fromEntries(models.map(m => [m.id, [m.maxInputTokens, m.maxOutputTokens]]));
        // agent from the service; chat-default and chat-fast from the defaults, which fit a 32k Mac (prompt + answer).
        expect(by).toEqual({ code: [24576, 8192], agent: [122880, 8192], 'chat-default': [24576, 8192], 'chat-fast': [12288, 4096] });
        expect(by.code[0] + by.code[1]).toBeLessThanOrEqual(32768);
        expect(models[0].url).toBe(`${API}/chat/completions`);
    });
});

describe('configuration files for the agents', () => {
    const files = Object.fromEntries(toolConfigs(`${API}/`, 'sk-test', limitsFrom(ALIASES)).map(c => [c.id, c]));

    it('OpenCode gets the provider with the key and the context of agent', () => {
        const oc = JSON.parse(files.opencode.code);
        expect(oc.provider.dhbw.options).toEqual({ baseURL: API, apiKey: 'sk-test' });
        expect(oc.provider.dhbw.models.agent.limit).toEqual({ context: 131072, output: 8192 });
        expect(oc.model).toBe('dhbw/agent');
        expect(oc.share).toBe('disabled');
    });

    it('Claude Code talks to the gateway root and sends nothing to Anthropic', () => {
        const env = JSON.parse(files['claude-code'].code).env;
        expect(env.ANTHROPIC_BASE_URL).toBe('https://api.llm.services.dhbw.cloud');
        expect(env.ANTHROPIC_AUTH_TOKEN).toBe('sk-test');
        expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL).toBe('chat-fast');
        expect(env.CLAUDE_CODE_MAX_CONTEXT_TOKENS).toBe('131072');
        expect(env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC).toBe('1');
        expect(files['claude-code'].path).toBe('~/.claude/settings.json');
    });

    it('Codex uses the Responses API and reads the key from the environment', () => {
        expect(files.codex.code).toContain('wire_api = "responses"');
        expect(files.codex.code).toContain(`base_url = "${API}"`);
        expect(files.codex.code).not.toContain('sk-test');
        expect(files.codex.env).toBe('export DHBW_API_KEY=sk-test');
    });

    it('Continue gets agent and code with their context', () => {
        expect(files.continue.code).toContain('model: agent');
        expect(files.continue.code).toContain('contextLength: 131072');
        expect(files.continue.code).toContain('contextLength: 32768');
    });

    it('Kilo Code gets the OpenCode-style provider in kilo.jsonc', () => {
        const kc = JSON.parse(files.kilo.code);
        expect(kc.$schema).toBe('https://app.kilo.ai/config.json');
        expect(kc.provider.dhbw.npm).toBe('@ai-sdk/openai-compatible');
        expect(kc.provider.dhbw.options).toEqual({ baseURL: API, apiKey: 'sk-test' });
        expect(kc.provider.dhbw.models.agent.limit).toEqual({ context: 131072, output: 8192 });
        expect(kc.model).toBe('dhbw/agent');
        expect(files.kilo.path).toBe('~/.config/kilo/kilo.jsonc');
    });

    it('Zed gets an OpenAI-compatible provider without the key, which comes from DHBW_API_KEY', () => {
        const z = JSON.parse(files.zed.code);
        const dhbw = z.language_models.openai_compatible.dhbw;
        expect(dhbw.api_url).toBe(API);
        expect(dhbw.available_models[0]).toEqual({ name: 'agent', display_name: 'DHBW Agent', max_tokens: 131072, max_output_tokens: 8192, capabilities: { tools: true, images: false, parallel_tool_calls: false, prompt_cache_key: false } });
        expect(dhbw.available_models.find(m => m.name === 'code').max_tokens).toBe(32768);
        expect(z.agent.default_model).toEqual({ provider: 'dhbw', model: 'agent' });
        expect(files.zed.code).not.toContain('sk-test');
        expect(files.zed.env).toBe('export DHBW_API_KEY=sk-test');
    });

    it('Cline and Roo Code get the fields to fill in instead of a file', () => {
        for (const id of ['cline', 'roo']) {
            expect(files[id].code).toBeUndefined();
            expect(Object.fromEntries(files[id].fields.map(f => [f.key, f.value]))).toEqual({ baseUrl: API, apiKey: 'sk-test', modelId: 'agent', contextWindow: '131072', maxOutput: '8192' });
            expect(files[id].models.map(m => m.id)).toEqual(['agent', 'code', 'chat-fast']);
            expect(files[id].models[1]).toEqual({ id: 'code', context: 32768, output: 8192 });
        }
    });
});

describe('model groups granted on top', () => {
    const withLarge = { aliases: [...ALIASES.aliases, { alias: 'chat-large', models: [], limit: { max_input_tokens: 57344, max_output_tokens: 8192 } }] };

    it('are the names beyond the stable ones, and only those the service lists', () => {
        expect(grantedModels(withLarge)).toEqual(['chat-large']);
        expect(grantedModels(ALIASES)).toEqual([]);
        expect(grantedName('chat-large')).toBe('DHBW Large');
    });

    it('join the VS Code entries and the files of OpenCode and Continue', () => {
        const limits = limitsFrom(withLarge);
        const models = JSON.parse(`{${vscodeModels(API, { code: 'C', agent: 'A', chat: 'D', fast: 'F' }, limits, ['chat-large'])}}`).models;
        expect(models.at(-1)).toMatchObject({ id: 'chat-large', name: 'DHBW Large', maxInputTokens: 57344 });
        const files = Object.fromEntries(toolConfigs(API, 'sk-test', limits, ['chat-large']).map(c => [c.id, c]));
        expect(JSON.parse(files.opencode.code).provider.dhbw.models['chat-large'].limit).toEqual({ context: 65536, output: 8192 });
        expect(files.continue.code).toContain('model: chat-large');
        expect(JSON.parse(files.kilo.code).provider.dhbw.models['chat-large'].limit).toEqual({ context: 65536, output: 8192 });
        expect(JSON.parse(files.zed.code).language_models.openai_compatible.dhbw.available_models.at(-1)).toMatchObject({ name: 'chat-large', display_name: 'DHBW Large', max_tokens: 65536 });
        expect(files.cline.models.at(-1)).toEqual({ id: 'chat-large', context: 65536, output: 8192 });
    });
});
