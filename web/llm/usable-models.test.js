import { describe, expect, it } from 'vitest';
import { contextLabel, curlExample, healthState, shortTokens, summaryOf } from '/llm/usable-models.js';

describe('shortTokens', () => {
    it('writes context sizes as they are spoken of', () => {
        expect(shortTokens(24576)).toBe('24k');
        expect(shortTokens(98304)).toBe('96k');
        expect(shortTokens(8192)).toBe('8k');
        expect(shortTokens(1536)).toBe('1.5k');
        expect(shortTokens(500)).toBe('500');
        expect(shortTokens(0)).toBe('');
        expect(shortTokens(undefined)).toBe('');
    });
});

describe('contextLabel', () => {
    it('is prompt / answer, a range where the deployments differ', () => {
        const same = { min: { max_input_tokens: 24576, max_output_tokens: 8192 }, max: { max_input_tokens: 24576, max_output_tokens: 8192 } };
        expect(contextLabel(same)).toBe('24k / 8k');
        const range = { min: { max_input_tokens: 24576, max_output_tokens: 8192 }, max: { max_input_tokens: 98304, max_output_tokens: 32768 } };
        expect(contextLabel(range)).toBe('24k–96k / 8k–32k');
    });

    it('is empty when nothing is declared', () => {
        expect(contextLabel({ min: { max_input_tokens: 0, max_output_tokens: 0 }, max: { max_input_tokens: 0, max_output_tokens: 0 } })).toBe('');
        expect(contextLabel(undefined)).toBe('');
    });
});

describe('summaryOf', () => {
    it('takes the summary, else the first paragraph, of the first described model', () => {
        expect(summaryOf({ models: [{ description: null }, { description: { summary: 'Kurz.', description: 'Lang.' } }] })).toBe('Kurz.');
        expect(summaryOf({ models: [{ description: { summary: '', description: '# T\n\nErster **Absatz**.\n\nZweiter.' } }] })).toBe('Erster Absatz.');
        expect(summaryOf({ models: [] })).toBe('');
    });
});

describe('healthState', () => {
    it('tells how a name is doing', () => {
        expect(healthState({ deployments: 0, healthy: 0 }, true)).toBe('none');
        expect(healthState({ deployments: 3, healthy: 0 }, false)).toBe('unknown');
        expect(healthState({ deployments: 3, healthy: 3 }, true)).toBe('ok');
        expect(healthState({ deployments: 3, healthy: 1 }, true)).toBe('partial');
        expect(healthState({ deployments: 3, healthy: 0 }, true)).toBe('down');
    });
});

describe('curlExample', () => {
    it('calls the chat completions under the name', () => {
        const c = curlExample('https://api.llm.services.dhbw.cloud/v1/', 'qwen3.8-flash-next-iq3_s');
        expect(c).toContain('curl https://api.llm.services.dhbw.cloud/v1/chat/completions');
        expect(c).toContain('"model":"qwen3.8-flash-next-iq3_s"');
        expect(c).toContain('$DHBW_API_KEY');
        expect(curlExample('', 'chat-default')).toContain('https://api.llm.services.dhbw.cloud/v1/chat/completions');
    });
});
