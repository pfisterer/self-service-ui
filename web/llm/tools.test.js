import { describe, expect, it } from 'vitest';
import { limitsFrom, toolConfigs, vscodeModels } from '/llm/tools.js';

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
});
