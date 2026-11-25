import { describe, expect, it } from 'vitest';
import { parseBlocks, parseInline } from './safe-markdown.js';

describe('parseBlocks', () => {
    it('splits paragraphs and lists', () => {
        const b = parseBlocks('Zwei Projekte:\n\n- **Kurs R**\n* ML Seminar\n\n1. erstens\n2. zweitens\nSchluss');
        expect(b).toEqual([
            { type: 'p', lines: ['Zwei Projekte:'] },
            { type: 'list', ordered: false, items: ['**Kurs R**', 'ML Seminar'] },
            { type: 'list', ordered: true, items: ['erstens', 'zweitens'] },
            { type: 'p', lines: ['Schluss'] },
        ]);
    });
    it('drops heading markers and keeps their text', () => {
        expect(parseBlocks('## Titel')).toEqual([{ type: 'p', lines: ['Titel'] }]);
    });
    it('handles empty input', () => {
        expect(parseBlocks('')).toEqual([]);
        expect(parseBlocks(undefined)).toEqual([]);
    });
});

describe('parseInline', () => {
    it('marks bold, italics and code', () => {
        expect(parseInline('a **b** *c* _d_ `e`')).toEqual([
            { text: 'a ' }, { text: 'b', bold: true }, { text: ' ' }, { text: 'c', italic: true }, { text: ' ' }, { text: 'd', italic: true }, { text: ' ' }, { text: 'e', code: true },
        ]);
    });
    it('leaves links, HTML and snake_case literal', () => {
        expect(parseInline('[hier](https://evil.example) <img src=x> llm_mtokens')).toEqual([{ text: '[hier](https://evil.example) <img src=x> llm_mtokens' }]);
    });
});
