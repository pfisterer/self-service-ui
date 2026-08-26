// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mcpConfigJson } from './mcp-config.jsx';

// Two questions, and the first is the one that has actually gone wrong: does the
// deployment's configuration REACH the scope? Everything on the panel hangs off
// `scope.mcpUrl`, so a value that is plumbed through five files and then not read
// produces no error anywhere — the section simply is not there, which is exactly
// what it looks like on a deployment that has no MCP endpoint.

// The scopes module reads window.appconfig once, at import time. So the config
// has to be in place BEFORE the import, and the module registry reset between
// cases that configure it differently.
async function scopesWith(appconfig) {
    vi.resetModules();
    window.appconfig = appconfig;
    return (await import('./scopes.js')).TOKEN_SCOPES;
}

const BOTH_APIS = {
    dynamicZonesBaseUrl: 'https://dyndnsapi.example.com',
    cloudResourcesBaseUrl: 'https://projects.example.com',
};

describe('token scopes and their MCP endpoints', () => {
    beforeEach(() => { delete window.appconfig; });

    it('gives each scope the endpoint configured for its own API', async () => {
        const scopes = await scopesWith({
            ...BOTH_APIS,
            dynamicZonesMcpUrl: 'https://dyndnsapi.example.com/mcp',
            cloudResourcesMcpUrl: 'https://projects.example.com/mcp',
        });

        expect(scopes.map((s) => [s.id, s.mcpUrl])).toEqual([
            ['dns', 'https://dyndnsapi.example.com/mcp'],
            ['projects', 'https://projects.example.com/mcp'],
        ]);
    });

    // The addresses are separate values, not one flag: a deployment can run a
    // version of one service that speaks MCP and a version of the other that
    // does not, and the panel has to stay silent for the second one.
    it('leaves a scope without a configured endpoint empty', async () => {
        const scopes = await scopesWith({ ...BOTH_APIS, cloudResourcesMcpUrl: 'https://projects.example.com/mcp' });

        expect(scopes.find((s) => s.id === 'dns').mcpUrl).toBe('');
        expect(scopes.find((s) => s.id === 'projects').mcpUrl).toBeTruthy();
    });

    it('names the servers distinctly, so both can be configured in one client', async () => {
        const scopes = await scopesWith(BOTH_APIS);
        const names = scopes.map((s) => s.mcpServerName);

        expect(new Set(names).size).toBe(names.length);
    });
});

describe('the config snippet handed to a client', () => {
    const scope = { id: 'dns', mcpUrl: 'https://dyndnsapi.example.com/mcp', mcpServerName: 'dhbw-cloud-dns' };

    it('carries the endpoint and the token as a bearer header', () => {
        const cfg = JSON.parse(mcpConfigJson(scope, 'dynz_token_secret'));

        expect(cfg.mcpServers['dhbw-cloud-dns']).toEqual({
            type: 'http',
            url: 'https://dyndnsapi.example.com/mcp',
            headers: { Authorization: 'Bearer dynz_token_secret' },
        });
    });

    // The field that was missing, given a test of its own because of HOW it
    // failed: Claude Code drops an entry without `type` silently — no error, no
    // warning, the server just never appears. A snippet that is wrong this way
    // looks exactly like one that is right until someone goes looking.
    it('declares the transport, without which some clients discard the entry', () => {
        const cfg = JSON.parse(mcpConfigJson(scope, ''));

        expect(cfg.mcpServers['dhbw-cloud-dns'].type).toBe('http');
    });

    // Where the secret is gone, what stands in for it has to FAIL if pasted
    // unedited — a plausible-looking fake would break at some later, stranger
    // point instead of at the first request.
    it('never emits something that could pass for a token', () => {
        const cfg = JSON.parse(mcpConfigJson(scope, ''));
        const auth = cfg.mcpServers['dhbw-cloud-dns'].headers.Authorization;

        expect(auth).toBe('Bearer <your-token>');
        expect(auth).not.toMatch(/dynz_token_/);
    });
});
