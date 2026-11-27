// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderView } from '/test/render-harness.jsx';

// The AI service as a token scope: present exactly where the deployment has the service, wired to the LLM facade, and saying on the page that these tokens are not the LLM keys.

// The page asks the AI service whether the caller is an admin (for "never expires") and the act-as state whom the page acts for; both per test, nobody and nobody by default.
vi.mock('/llm/use-llm-me.jsx', () => ({ useLlmMe: () => ({ isAdmin: !!globalThis.__llmAdmin }) }));
vi.mock('/providers/act-as.jsx', () => ({ useActAs: () => ({ actingAs: globalThis.__actingAs ?? null }) }));

vi.mock('/llm/api-llm.jsx', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, useLlmApi: () => globalThis.__llmApi };
});

const TOKEN = {
    id: 7, user: 'dennis.pfisterer@dhbw.de', token_prefix: 'aiaas_ab12cd34', read_only: true, description: 'nightly GPU report',
    created_at: '2026-10-19T10:00:00Z', expires_at: '2027-10-19T10:00:00Z', last_used_at: null,
};

// scopes.js and features.js read window.appconfig once, at import time, so the configuration has to be in place before the import.
async function withConfig(appconfig) {
    vi.resetModules();
    window.appconfig = appconfig;
    return {
        scopes: (await import('./scopes.js')).TOKEN_SCOPES,
        ApiTokens: (await import('./api-tokens.jsx')).ApiTokens,
        scopeLifetimes: (await import('./token-scope-panel.jsx')).scopeLifetimes,
    };
}

describe('AI service token scope', () => {
    beforeEach(() => {
        delete window.appconfig;
        globalThis.__llmAdmin = false;
        globalThis.__actingAs = null;
        globalThis.__llmApi = {
            listApiTokens: vi.fn(async () => [TOKEN]),
            createApiToken: vi.fn(async () => ({})),
            deleteApiToken: vi.fn(async () => ({})),
        };
    });
    afterEach(() => cleanup());

    it('exists only where the AI service is configured', async () => {
        expect((await withConfig({})).scopes.map(s => s.id)).not.toContain('ai');
        const ai = (await withConfig({ llmBaseUrl: '/api/llm/' })).scopes.find(s => s.id === 'ai');
        expect(ai).toMatchObject({ prefix: 'aiaas_', allowNever: 'readOnlyOrAdmin', mcpUrl: '' });
    });

    it('offers "never expires" only for a read-only token or an admin, as the service does', async () => {
        const { scopes, scopeLifetimes } = await withConfig({ llmBaseUrl: '/api/llm/' });
        const t = (k) => k;
        const ai = scopes.find(s => s.id === 'ai');
        expect(scopeLifetimes(ai, t).map(l => l.value)).toEqual(['720', '2160', '8760']);
        expect(scopeLifetimes(ai, t, true).map(l => l.value)).toContain('-1');
        expect(scopeLifetimes({ ...ai, isAdmin: true }, t).map(l => l.value)).toContain('-1');
        expect(scopeLifetimes({ id: 'dns' }, t).map(l => l.value)).toContain('-1');
        expect(scopeLifetimes({ id: 'x', allowNever: false }, t, true).map(l => l.value)).not.toContain('-1');
    });

    it('lists the tokens through the LLM facade and tells them apart from the LLM keys', async () => {
        const { ApiTokens } = await withConfig({ llmBaseUrl: '/api/llm/' });
        renderView(<ApiTokens scope="ai" />);
        expect(await screen.findByText('aiaas_ab12cd34…')).toBeTruthy();
        expect(screen.getByText('nightly GPU report')).toBeTruthy();
        expect(screen.getByText(/LLM → API Keys/)).toBeTruthy();
        expect(globalThis.__llmApi.listApiTokens).toHaveBeenCalled();
    });

    it('shows who created a token on the owner\'s behalf', async () => {
        globalThis.__llmApi.listApiTokens = vi.fn(async () => [{ ...TOKEN, created_by: 'admin@dhbw.de' }]);
        const { ApiTokens } = await withConfig({ llmBaseUrl: '/api/llm/' });
        renderView(<ApiTokens scope="ai" />);
        expect(await screen.findByText(/admin@dhbw\.de/)).toBeTruthy();
    });

    it('acting on behalf: says whose token it is, and the admin role does not unlock "never expires"', async () => {
        globalThis.__llmAdmin = true;
        globalThis.__actingAs = 'student@dhbw.de';
        const { ApiTokens, scopeLifetimes } = await withConfig({ llmBaseUrl: '/api/llm/' });
        renderView(<ApiTokens scope="ai" />);
        expect(await screen.findByText(/student@dhbw\.de/)).toBeTruthy();
        const button = screen.getByRole('button', { name: /Token erstellen|Create Token/ });
        expect(button.disabled).toBe(false);

        // An admin role (the person's, as /me answers while acting) does not unlock "never" on behalf; read-only does.
        const ai = (await withConfig({ llmBaseUrl: '/api/llm/' })).scopes.find(s => s.id === 'ai');
        const t = (k) => k;
        expect(scopeLifetimes({ ...ai, isAdmin: true, actingAs: 'student@dhbw.de' }, t).map(l => l.value)).not.toContain('-1');
        expect(scopeLifetimes({ ...ai, isAdmin: true, actingAs: 'student@dhbw.de' }, t, true).map(l => l.value)).toContain('-1');
        expect(scopeLifetimes({ ...ai, isAdmin: true }, t).map(l => l.value)).toContain('-1');
    });
});
