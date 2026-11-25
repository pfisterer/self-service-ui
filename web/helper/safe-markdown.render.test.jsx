// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { renderView } from '/test/render-harness.jsx';
import { SafeMarkdown } from './safe-markdown.jsx';

afterEach(cleanup);

describe('SafeMarkdown', () => {
    it('renders the subset and never links, images or HTML', () => {
        const { container } = renderView(<SafeMarkdown text={'**Fett** und *kursiv*\n\n- eins\n- `zwei`\n\n[Link](https://evil.example) <img src=x onerror=alert(1)> <a href="x">a</a>'} />);
        expect(container.querySelector('strong')?.textContent).toBe('Fett');
        expect(container.querySelector('em')?.textContent).toBe('kursiv');
        expect(container.querySelectorAll('li')).toHaveLength(2);
        expect(container.querySelector('code')?.textContent).toBe('zwei');
        expect(container.querySelector('a')).toBeNull();
        expect(container.querySelector('img')).toBeNull();
        expect(container.textContent).toContain('[Link](https://evil.example) <img src=x onerror=alert(1)> <a href="x">a</a>');
    });
});
