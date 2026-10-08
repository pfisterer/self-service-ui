// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { renderView } from '/test/render-harness.jsx';

// Does each LLM view render at all, with data in it? Same question and same
// reasoning as projects/views.render.test.jsx: a view that cannot render is
// what lint, unit tests and the build all let through.

const ME = {
    email: 'dennis.pfisterer@dhbw.de', role: 'admin', tier: 'staff', matched_token: 'user:dennis.pfisterer@dhbw.de',
    chat_url: 'https://chat.example', api_url: 'https://api.example/v1', admin_ui_url: 'https://admin.example/autologin',
};

vi.mock('/llm/use-llm-me.jsx', () => ({
    useLlmMe: () => ({ query: { isPending: false, isError: false }, me: ME, hasAccess: true, isFleetAdmin: true, isAdmin: true }),
}));
vi.mock('/llm/api-llm.jsx', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, useLlmApi: () => globalThis.__llmApi };
});

const USAGE = {
    spend: 1.5, budget: 20, budget_duration: '30d', reset_at: '2026-11-01T00:00:00Z', rpm: 60, tpm: 200000,
    models: ['chat-default', 'code'], max_keys: 5, own_keys: 1,
    keys: [
        { id: 'k1', name: 'vscode', spend: 0.25, budget: 2, budget_duration: '4h', reset_at: '2026-10-08T16:00:00Z' },
        { id: 'k2', chat: true, spend: 0, budget: 2, budget_duration: '4h' },
    ],
};

const FLEET = {
    enabled: true, pool: '10.90.4.0/22', capacity: 1022, enroll_host: 'enroll.example', enroll_token: 'tok',
    listen_port: 51820, endpoint_v6: '2001:db8::1', reenroll_seconds: 3600, package_id: 'de.dhbw.llm', allowed_serials: 0,
    package: { file: 'dhbw-llm-1.2.pkg', size: 2097152, sha256: 'abc', uploaded_at: '2026-10-01T10:00:00Z' },
    self_update: { mode: 'alle', canary: [], scripts: { 'dhbw-llm-enroll.sh': '1a2b3c' } },
    peers: [
        { serial: 'S1', name: 'wimac01', address: '10.90.4.2', profile: 'm4-24', ram_gb: 24, model: 'qwen3:14b', models: ['qwen3:14b'],
          model_state: 'erfüllt', state: 'aktiv', inference: 'erreichbar', script_state: 'aktuell', last_seen: '2026-10-08T10:00:00Z',
          location: 'DHBW Mannheim', contact: 'it@example.org', os: 'darwin' },
        { serial: 'S2', name: 'wimac02', address: '10.90.4.3', profile: 'm4-16', ram_gb: 16, model: 'qwen3:8b', models: ['gemma3'],
          model_state: 'abweichend', state: 'ohne Rückmeldung', quiet_seconds: 20000, inference: 'gestört',
          inference_error: 'timeout', script_state: 'veraltet', blocked: false },
    ],
};

const RULES = [
    { token: 'user:dennis.pfisterer@dhbw.de', role: 'admin', tier: 'staff', bootstrap: true },
    { id: 7, token: 'group:wwi23seb', role: 'user', tier: 'student', comment: 'Kurs', updated_by: 'a@dhbw.de', updated_at: '2026-10-07T09:00:00Z' },
];

const { LlmOverview } = await import('/llm/overview.jsx');
const { LlmKeys } = await import('/llm/keys.jsx');
const { LlmUsage } = await import('/llm/usage.jsx');
const { LlmFleet } = await import('/llm/fleet.jsx');
const { LlmAccessRules } = await import('/llm/access-rules.jsx');

let consoleErrors = [];
beforeEach(() => {
    globalThis.__llmApi = {
        getUsage: async () => USAGE,
        getFleet: async () => FLEET,
        listAccessRules: async () => RULES,
        listTiers: async () => ['staff', 'student'],
        searchGroups: async () => [],
    };
    consoleErrors = [];
    vi.spyOn(console, 'error').mockImplementation((...args) => { consoleErrors.push(args.join(' ')); });
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

function expectNoRenderFailure() {
    const fatal = consoleErrors.filter(e =>
        /Maximum update depth|is not defined|is not a function|Cannot read/.test(e));
    expect(fatal).toEqual([]);
}

describe('the LLM views render', () => {
    it('Overview shows the endpoint and the tools', async () => {
        renderView(<LlmOverview />);
        expect(await screen.findByText('Continue')).toBeTruthy();
        expectNoRenderFailure();
    });

    it('API keys lists the keys', async () => {
        renderView(<LlmKeys />);
        expect(await screen.findByText('vscode')).toBeTruthy();
        expectNoRenderFailure();
    });

    it('Usage shows the quota and the keys', async () => {
        renderView(<LlmUsage />);
        expect(await screen.findByText('vscode')).toBeTruthy();
        expectNoRenderFailure();
    });

    it('Fleet shows the machines', async () => {
        renderView(<LlmFleet />);
        expect(await screen.findByText('wimac02')).toBeTruthy();
        expectNoRenderFailure();
    });

    it('Access rules lists the rules', async () => {
        renderView(<LlmAccessRules />);
        expect(await screen.findByText('group:wwi23seb')).toBeTruthy();
        expectNoRenderFailure();
    });
});
