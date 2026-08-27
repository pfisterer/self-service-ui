// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import '/test/jsdom-stubs.js';
import { McpConfigBlock, mcpConfigJson } from './mcp-config.jsx';

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

    // What it returns is one entry of an mcpServers object, so it is a fragment
    // and does not parse on its own — the braces are the caller's, both here and
    // in the config file someone pastes it into.
    const parseEntry = (fragment) => JSON.parse(`{${fragment}}`);

    it('carries the endpoint and the token as a bearer header', () => {
        const cfg = parseEntry(mcpConfigJson(scope, 'dynz_token_secret'));

        expect(cfg['dhbw-cloud-dns']).toEqual({
            type: 'http',
            url: 'https://dyndnsapi.example.com/mcp',
            headers: { Authorization: 'Bearer dynz_token_secret' },
        });
    });

    // The wrapper is what someone would have to strip off before pasting, and
    // pasting it whole would produce a second mcpServers key — invalid JSON that
    // costs the servers already configured.
    it('brings no mcpServers wrapper of its own', () => {
        expect(mcpConfigJson(scope, '')).not.toMatch(/mcpServers/);
        expect(mcpConfigJson(scope, '').trimStart()).toMatch(/^"dhbw-cloud-dns":/);
    });

    // The field that was missing, given a test of its own because of HOW it
    // failed: Claude Code drops an entry without `type` silently — no error, no
    // warning, the server just never appears. A snippet that is wrong this way
    // looks exactly like one that is right until someone goes looking.
    it('declares the transport, without which some clients discard the entry', () => {
        const cfg = parseEntry(mcpConfigJson(scope, ''));

        expect(cfg['dhbw-cloud-dns'].type).toBe('http');
    });

    // Where the secret is gone, what stands in for it has to FAIL if pasted
    // unedited — a plausible-looking fake would break at some later, stranger
    // point instead of at the first request.
    it('never emits something that could pass for a token', () => {
        const cfg = parseEntry(mcpConfigJson(scope, ''));
        const auth = cfg['dhbw-cloud-dns'].headers.Authorization;

        expect(auth).toBe('Bearer <your-token>');
        expect(auth).not.toMatch(/dynz_token_/);
    });
});

// The wrapper is shown and not copied, and those are two different facts about
// two different strings. Either one alone reads as correct while the pair is
// broken: copy the wrapper too and the pasted file gets a second mcpServers key;
// stop showing it and the reader has no idea where the entry goes.
describe('the block on the page', () => {
    const scope = {
        id: 'projects',
        mcpUrl: 'https://projects.example.com/mcp',
        mcpServerName: 'dhbw-cloud-projects',
    };

    afterEach(cleanup);

    const renderBlock = () => render(
        <MantineProvider>
            <McpConfigBlock scope={scope} />
        </MantineProvider>,
    );

    it('shows the surrounding mcpServers object', () => {
        renderBlock();

        expect(screen.getByText(/"mcpServers"/)).toBeTruthy();
    });

    it('shows the entry indented inside it', () => {
        const { container } = renderBlock();
        // <pre>, not 'pre, code' — the first Code on the block is the inline one
        // holding the endpoint, and it matched instead.
        const block = container.querySelector('pre');

        expect(block.textContent).toContain('    "dhbw-cloud-projects"');
    });

    // The copy value is the fragment, and the fragment is what the other tests
    // above pin. Stated here as well because this is the component where the two
    // strings meet, and where someone would "fix" the mismatch by copying what
    // is displayed.
    it('does not copy what it only shows', () => {
        expect(mcpConfigJson(scope, '')).not.toContain('mcpServers');
    });

    it('renders nothing where the deployment has no endpoint', () => {
        const { container } = render(
            <MantineProvider>
                <McpConfigBlock scope={{ id: 'dns', mcpUrl: '' }} />
            </MantineProvider>,
        );

        // Not "the container is empty": MantineProvider injects its own style
        // tags, so it never is. What has to be absent is this component's output.
        expect(container.querySelector('pre')).toBeNull();
        expect(screen.queryByRole('button')).toBeNull();
    });
});
