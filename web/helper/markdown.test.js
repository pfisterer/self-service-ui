// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { firstParagraph, markdownToHtml } from '/helper/markdown.js';

// The model descriptions are Markdown written by admins and end up in innerHTML: whatever marked lets through, DOMPurify must catch.
describe('markdownToHtml', () => {
    it('renders the structure of a description', () => {
        const html = markdownToHtml('## Qwen\n\n**MoE** with `35B`.\n\n- one\n- two\n\n| a | b |\n|---|---|\n| 1 | 2 |');
        expect(html).toContain('<h2>Qwen</h2>');
        expect(html).toContain('<strong>MoE</strong>');
        expect(html).toContain('<code>35B</code>');
        expect(html).toContain('<li>two</li>');
        expect(html).toContain('<td>2</td>');
    });

    it('drops scripts, handlers, images, styles and dangerous links', () => {
        const html = markdownToHtml([
            '<script>alert(1)</script>',
            '<img src=x onerror="alert(2)">',
            '<p onclick="alert(3)" style="color:red">p</p>',
            '[js](javascript:alert(4)) [data](data:text/html,x) ![img](https://example.org/i.png)',
            '<iframe src="https://example.org"></iframe><form><input></form>',
        ].join('\n\n'));
        for (const bad of ['<script', 'alert(1)', 'onerror', '<img', 'onclick', 'style=', 'javascript:', 'data:', '<iframe', '<form', '<input']) {
            expect(html).not.toContain(bad);
        }
    });

    it('opens links in a new tab without a referrer', () => {
        const html = markdownToHtml('[Hugging Face](https://huggingface.co/Qwen)');
        expect(html).toContain('href="https://huggingface.co/Qwen"');
        expect(html).toContain('target="_blank"');
        expect(html).toContain('rel="noopener noreferrer"');
    });

    it('is empty for no text', () => {
        expect(markdownToHtml('')).toBe('');
        expect(markdownToHtml(null)).toBe('');
    });
});

describe('firstParagraph', () => {
    it('is the plain text of the first paragraph, headings skipped', () => {
        expect(firstParagraph('# Title\n\nA **fast** model for [code](https://x.org)\nand chat.\n\nSecond.')).toBe('A fast model for code and chat.');
    });

    it('is empty without a paragraph', () => {
        expect(firstParagraph('# Only a heading')).toBe('');
        expect(firstParagraph('')).toBe('');
    });
});
