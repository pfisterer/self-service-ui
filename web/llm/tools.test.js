import { describe, expect, it } from 'vitest';
import { KEY_PLACEHOLDER, grantedModels, grantedName, limitsFrom, modelPlan, toolCallsOf, toolConfigs, vscodeModels } from '/llm/tools.js';

const API = 'https://api.llm.services.dhbw.cloud/v1';
const ALIASES = {
    aliases: [
        { alias: 'code', models: [], limit: { max_input_tokens: 24576, max_output_tokens: 8192 } },
        { alias: 'agent', models: [], limit: { max_input_tokens: 122880, max_output_tokens: 8192 } },
        { alias: 'chat-fast', models: [], limit: { max_input_tokens: 0, max_output_tokens: 0 } },
    ],
};

// Usable names as getUsableModels gives them: the base aliases, a granted alias and a granted model name; Gemma without tool calls.
const lim = (i, o) => ({ max_input_tokens: i, max_output_tokens: o });
const range = (a, b) => ({ min: a, max: b });
const described = (model, toolCalls) => ({ model, description: { model, tool_calls: toolCalls } });
const USABLE = {
    names: [
        { name: 'chat-default', kind: 'alias', limits: range(lim(24576, 8192), lim(24576, 8192)), models: [described('qwen-coding', true)] },
        { name: 'chat-fast', kind: 'alias', limits: range(lim(0, 0), lim(0, 0)), models: [] },
        { name: 'code', kind: 'alias', limits: range(lim(24576, 8192), lim(24576, 8192)), models: [described('qwen-coding', true)] },
        { name: 'agent', kind: 'alias', limits: range(lim(122880, 8192), lim(122880, 8192)), models: [described('qwen-fp8', true)] },
        { name: 'chat-large', kind: 'alias', limits: range(lim(24576, 8192), lim(98304, 32768)), models: [described('qwen-large', true), { model: 'qwen-mac', description: null }] },
        { name: 'gemma-4-31b', kind: 'model', limits: range(lim(57344, 8192), lim(57344, 8192)), models: [described('gemma-4-31b', false)] },
    ],
};
const NAMES = { code: 'C', agent: 'A', chat: 'D', fast: 'F' };

describe('limits for the tools', () => {
    it('take what the service names and leave out names without one', () => {
        expect(limitsFrom(ALIASES)).toEqual({ code: { input: 24576, output: 8192 }, agent: { input: 122880, output: 8192 } });
        expect(limitsFrom(undefined)).toEqual({});
    });
});

describe('the plan from the usable names', () => {
    const plan = modelPlan(USABLE);

    it('holds every usable name with its smallest limits', () => {
        expect(plan.list).toEqual(['chat-default', 'chat-fast', 'code', 'agent', 'chat-large', 'gemma-4-31b']);
        expect(plan.limits).toEqual({
            'chat-default': { input: 24576, output: 8192 }, code: { input: 24576, output: 8192 }, agent: { input: 122880, output: 8192 },
            'chat-large': { input: 24576, output: 8192 }, 'gemma-4-31b': { input: 57344, output: 8192 },
        });
    });

    it('knows tool calls only where every model behind a name is described with them', () => {
        expect(plan.tools).toEqual({ 'chat-default': true, 'chat-fast': null, code: true, agent: true, 'chat-large': null, 'gemma-4-31b': false });
        expect(toolCallsOf({ models: [] })).toBeNull();
    });

    it('presets agent for the agents and chat-default for the rest', () => {
        expect([plan.agent, plan.chat, plan.small, plan.agentKnown]).toEqual(['agent', 'chat-default', 'chat-fast', true]);
    });

    it('takes the first alias with tool calls when agent has none known, never a name without them', () => {
        const without = (n) => ({ names: USABLE.names.map(e => (e.name === n ? { ...e, models: [described('x', false)] } : e)) });
        expect(modelPlan(without('agent')).agent).toBe('chat-default');
        const onlyModel = { names: [USABLE.names[1], USABLE.names[5], { name: 'qwen-model', kind: 'model', limits: USABLE.names[0].limits, models: [described('q', true)] }] };
        expect(modelPlan(onlyModel).agent).toBe('qwen-model');
        const noneKnown = modelPlan({ names: [USABLE.names[5], USABLE.names[1]] });
        expect(noneKnown.agent).toBe('chat-fast');
        expect(noneKnown.agentKnown).toBe(false);
    });
});

describe('configuration files for the agents', () => {
    const plan = modelPlan(USABLE);
    const files = Object.fromEntries(toolConfigs(`${API}/`, 'sk-test', plan).map(c => [c.id, c]));

    it('VS Code gets every name, chat-default first, with its limits and without tool calls for Gemma', () => {
        const models = JSON.parse(`{${vscodeModels(API, NAMES, plan)}}`).models;
        expect(models.map(m => m.id)).toEqual(plan.list);
        const by = Object.fromEntries(models.map(m => [m.id, [m.maxInputTokens, m.maxOutputTokens, m.toolCalling]]));
        expect(by).toEqual({
            'chat-default': [24576, 8192, true], 'chat-fast': [12288, 4096, true], code: [24576, 8192, true], agent: [122880, 8192, true],
            'chat-large': [24576, 8192, true], 'gemma-4-31b': [57344, 8192, false],
        });
        expect(models[0]).toMatchObject({ name: 'D', url: `${API}/chat/completions` });
        expect(models[4].name).toBe('DHBW Large');
    });

    it('OpenCode gets every name with its context, agent as the model', () => {
        const oc = JSON.parse(files.opencode.code);
        expect(oc.provider.dhbw.options).toEqual({ baseURL: API, apiKey: 'sk-test' });
        expect(Object.keys(oc.provider.dhbw.models)).toEqual(plan.list);
        expect(oc.provider.dhbw.models.agent.limit).toEqual({ context: 131072, output: 8192 });
        expect(oc.provider.dhbw.models['gemma-4-31b']).toEqual({ name: 'DHBW Gemma 4 31b', tool_call: false, limit: { context: 65536, output: 8192 } });
        expect([oc.model, oc.small_model]).toEqual(['dhbw/agent', 'dhbw/chat-fast']);
        expect(oc.share).toBe('disabled');
    });

    it('Claude Code talks to the gateway root, uses agent in every slot and sends nothing to Anthropic', () => {
        const env = JSON.parse(files['claude-code'].code).env;
        expect(env.ANTHROPIC_BASE_URL).toBe('https://api.llm.services.dhbw.cloud');
        expect(env.ANTHROPIC_AUTH_TOKEN).toBe('sk-test');
        expect([env.ANTHROPIC_MODEL, env.ANTHROPIC_DEFAULT_HAIKU_MODEL, env.CLAUDE_CODE_SUBAGENT_MODEL]).toEqual(['agent', 'agent', 'agent']);
        expect(env.CLAUDE_CODE_MAX_CONTEXT_TOKENS).toBe('131072');
        expect(env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC).toBe('1');
        expect(files['claude-code'].path).toBe('~/.claude/settings.json');
    });

    it('Codex uses the Responses API, agent as the model and the other names with tool calls as profiles', () => {
        const c = files.codex.code;
        expect(c).toContain('wire_api = "responses"');
        expect(c).toContain(`base_url = "${API}"`);
        expect(c.startsWith('model = "agent"\n')).toBe(true);
        expect(c).toContain('model_context_window = 131072');
        expect(c).toContain('[profiles."chat-default"]');
        expect(c).toContain('[profiles."code"]');
        expect(c).not.toContain('[profiles."agent"]');
        expect(c).not.toContain('gemma');
        expect(c).not.toContain('chat-large');
        expect(c).not.toContain('sk-test');
        expect(files.codex.env).toBe('export DHBW_API_KEY=sk-test');
    });

    it('Continue gets every name, chat-default first, tool_use only where it is not ruled out', () => {
        const c = files.continue.code;
        expect([...c.matchAll(/model: (\S+)/g)].map(m => m[1])).toEqual(plan.list);
        expect(c).toContain('contextLength: 131072');
        expect(c.split('  - name: ').find(b => b.includes('model: gemma-4-31b'))).not.toContain('tool_use');
        expect(c.split('  - name: ').find(b => b.includes('model: agent'))).toContain('tool_use');
    });

    it('Kilo Code gets the OpenCode-style provider in kilo.jsonc', () => {
        const kc = JSON.parse(files.kilo.code);
        expect(kc.$schema).toBe('https://app.kilo.ai/config.json');
        expect(kc.provider.dhbw.options).toEqual({ baseURL: API, apiKey: 'sk-test' });
        expect(Object.keys(kc.provider.dhbw.models)).toEqual(plan.list);
        expect(kc.model).toBe('dhbw/agent');
        expect(files.kilo.path).toBe('~/.config/kilo/kilo.jsonc');
    });

    it('Zed gets every name without the key, which comes from DHBW_API_KEY', () => {
        const z = JSON.parse(files.zed.code);
        const dhbw = z.language_models.openai_compatible.dhbw;
        expect(dhbw.api_url).toBe(API);
        expect(dhbw.available_models.map(m => m.name)).toEqual(plan.list);
        expect(dhbw.available_models.find(m => m.name === 'agent')).toEqual({ name: 'agent', display_name: 'DHBW Agent', max_tokens: 131072, max_output_tokens: 8192, capabilities: { tools: true, images: false, parallel_tool_calls: false, prompt_cache_key: false } });
        expect(dhbw.available_models.find(m => m.name === 'gemma-4-31b').capabilities.tools).toBe(false);
        expect(z.agent.default_model).toEqual({ provider: 'dhbw', model: 'agent' });
        expect(files.zed.code).not.toContain('sk-test');
        expect(files.zed.env).toBe('export DHBW_API_KEY=sk-test');
    });

    it('Cline and Roo Code get the fields for agent and every name with its limits', () => {
        for (const id of ['cline', 'roo']) {
            expect(files[id].code).toBeUndefined();
            expect(Object.fromEntries(files[id].fields.map(f => [f.key, f.value]))).toEqual({ baseUrl: API, apiKey: 'sk-test', modelId: 'agent', contextWindow: '131072', maxOutput: '8192' });
            expect(files[id].models.map(m => m.id)).toEqual(plan.list);
            expect(files[id].models.find(m => m.id === 'gemma-4-31b')).toEqual({ id: 'gemma-4-31b', context: 65536, output: 8192 });
        }
    });

    it('hold the placeholder when no key was just created and ask for one in the shell line', () => {
        const p = Object.fromEntries(toolConfigs(API, KEY_PLACEHOLDER, plan).map(c => [c.id, c]));
        expect(JSON.parse(p.opencode.code).provider.dhbw.options.apiKey).toBe('$DHBW_API_KEY');
        expect(p.cline.fields.find(f => f.key === 'apiKey').value).toBe('$DHBW_API_KEY');
        expect(p.codex.env).toBe('export DHBW_API_KEY=sk-…');
    });
});

describe('model groups granted on top', () => {
    it('are the names beyond the stable ones, and only those the service lists', () => {
        const withLarge = { aliases: [...ALIASES.aliases, { alias: 'chat-large', models: [] }] };
        expect(grantedModels(withLarge)).toEqual(['chat-large']);
        expect(grantedModels(ALIASES)).toEqual([]);
        expect(grantedName('chat-large')).toBe('DHBW Large');
    });
});
