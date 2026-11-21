// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
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
    listen_port: 51820, endpoint_v6: 'wg6.example', endpoint: 'wg4.example', reenroll_seconds: 3600, package_id: 'de.dhbw.llm', allowed_serials: 0,
    package: { file: 'dhbw-llm-1.2.pkg', size: 2097152, sha256: 'abc', uploaded_at: '2026-10-01T10:00:00Z' },
    self_update: { mode: 'alle', canary: [], scripts: { 'dhbw-llm-enroll.sh': '1a2b3c' } },
    peers: [
        { serial: 'S1', name: 'wimac01', address: '10.90.4.2', primary_ip: '141.72.16.101', profile: 'm4-24', ram_gb: 24, model: 'qwen3:14b', models: ['qwen3:14b'],
          model_state: 'erfüllt', state: 'aktiv', inference: 'erreichbar', script_state: 'aktuell', last_seen: '2026-10-08T10:00:00Z',
          location: 'DHBW Mannheim', contact: 'it@example.org', os: 'darwin' },
        { serial: 'S2', name: 'wimac02', address: '10.90.4.3', profile: 'm4-16', ram_gb: 16, model: 'qwen3:8b', models: ['gemma3'],
          model_state: 'abweichend', state: 'ohne Rückmeldung', quiet_seconds: 20000, inference: 'gestört',
          inference_error: 'timeout', script_state: 'veraltet', blocked: false },
        { serial: 'S3', name: 'wimac03', address: '10.90.4.4', profile: 'm4-16', ram_gb: 16, model: 'qwen3:8b', models: [],
          state: 'wartet auf Freigabe', pending: true, has_secret: false, inference: 'nicht registriert' },
    ],
};

const POOL = {
    enabled: true, url: 'https://inference.example',
    pods: [
        { replica: 'gap-gpu-1', pod: 'p1', site: 'gpu-gap-gpu-1', node: 'gpu-1', gpu_class: 'l4-3q', role: 'gap-filler',
          model: 'Qwen/Qwen2.5-0.5B-Instruct', state: 'bereit', since: '2026-10-10T18:31:00Z' },
        { replica: 'base-l4-3q-0', pod: 'p2', site: 'gpu-base-l4-3q-0', gpu_class: 'l4-3q', role: 'base-load',
          model: 'Qwen/Y', state: 'wartet auf GPU', since: '2026-10-10T18:00:00Z' },
    ],
};

const ALIASES = {
    health_known: true,
    aliases: [
        { alias: 'chat-default', models: [{ model: 'qwen3.6:35b-a3b-coding-nvfp4', deployments: 33, healthy: 31 }] },
        { alias: 'chat-fast', models: [] },
        { alias: 'code', models: [{ model: 'qwen3.6:35b-a3b-coding-nvfp4', deployments: 33, healthy: 31 }, { model: 'Qwen/Qwen3.6-35B-A3B-FP8', deployments: 3, healthy: 3 }] },
    ],
};

// The usable names as llm-management-api gives them (getUsableModels): an alias on Macs, an alias over GB10s and Macs, a model under its own name granted to a project; descriptions with Markdown that must arrive sanitised.
const LIM = (i, o) => ({ max_input_tokens: i, max_output_tokens: o });
const USABLE = {
    health_known: true,
    names: [
        { name: 'chat-default', kind: 'alias', base: true, projects: [], deployments: 28, healthy: 27, limits: { min: LIM(24576, 8192), max: LIM(24576, 8192) },
          models: [{ model: 'qwen3.6:35b-a3b-coding-nvfp4', deployments: 28, healthy: 27, description: null,
              devices: [{ device: 'mac', engine: 'ollama', limits: { min: LIM(24576, 8192), max: LIM(24576, 8192) }, deployments: 28, healthy: 27 }] }] },
        { name: 'chat-large', kind: 'alias', base: false, projects: [{ slug: 'p1', name: 'KI-Labor' }], deployments: 27, healthy: 26, limits: { min: LIM(24576, 8192), max: LIM(98304, 32768) },
          models: [
              { model: 'qwen3.8-flash-next-iq3_s', deployments: 2, healthy: 2,
                description: { model: 'qwen3.8-flash-next-iq3_s', summary: '', description: 'Großes **MoE**-Modell.\n\n<script>window.__pwned = true</script><img src=x onerror="window.__pwned = true">[Seite](https://huggingface.co/x)', source_url: 'https://huggingface.co/x/y', license: 'Apache-2.0', parameters: '80B (3B aktiv)', quantisation: 'IQ3_S', tool_calls: true, reasoning: null },
                devices: [{ device: 'gb10', engine: 'strata', limits: { min: LIM(98304, 32768), max: LIM(98304, 32768) }, deployments: 2, healthy: 2 }] },
              { model: 'qwen3.8-flash-next-gyro-gyro-s', deployments: 25, healthy: 24, description: null,
                devices: [{ device: 'mac', engine: 'strata', limits: { min: LIM(24576, 8192), max: LIM(24576, 8192) }, deployments: 25, healthy: 24 }] },
          ] },
        { name: 'qwen3.8-flash-next-iq3_s', kind: 'model', base: false, projects: [{ slug: 'p1', name: 'KI-Labor' }], deployments: 0, healthy: 0, limits: { min: LIM(0, 0), max: LIM(0, 0) }, models: [] },
    ],
};

const { LlmOverview } = await import('/llm/overview.jsx');
const { LlmAvailableModels } = await import('/llm/available.jsx');
const { ModelDescriptionsAdmin } = await import('/llm/model-descriptions.jsx');
const { LlmKeys } = await import('/llm/keys.jsx');
const { LlmUsage } = await import('/llm/usage.jsx');
const { LlmFleet } = await import('/llm/fleet.jsx');
const { ToolsDialog } = await import('/llm/tool-setup.jsx');

let consoleErrors = [];
const store = new Map();
beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear() });
    globalThis.__llmApi = {
        getUsage: async () => USAGE,
        getFleet: async () => FLEET,
        getFleetInference: async () => POOL,
        getModelAliases: async () => ALIASES,
        getUsableModels: async () => USABLE,
        getModelDescriptions: async () => ({ descriptions: [USABLE.names[1].models[0].description], served: ['qwen3.6:35b-a3b-coding-nvfp4', 'qwen3.8-flash-next-iq3_s'] }),
    };
    consoleErrors = [];
    vi.spyOn(console, 'error').mockImplementation((...args) => { consoleErrors.push(args.join(' ')); });
});
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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

    it('Overview shows which model stands behind each alias', async () => {
        renderView(<LlmOverview />);
        // code: the most deployed model first, the other one counted.
        expect(await screen.findByText(/(meist|mostly) qwen3\.6:35b-a3b-coding-nvfp4 \(\+1/)).toBeTruthy();
        expect(screen.getAllByText(/^(meist|mostly) qwen3\.6:35b-a3b-coding-nvfp4/)).toHaveLength(2);
        expect(screen.getByText(/derzeit kein Modell|no model at the moment/)).toBeTruthy();
        expect(screen.getByText('x-litellm-model-name')).toBeTruthy();
        expectNoRenderFailure();
    });

    it('Overview warns about a project whose per-minute limits are too low', async () => {
        globalThis.__llmApi.getUsage = async () => ({ ...USAGE, projects: [{ slug: 'p1', name: 'Testprojekt', mtokens: 10, rpm: 60, tpm: 100 }] });
        renderView(<LlmOverview />);
        expect(await screen.findByText(/Testprojekt.*(voraussichtlich abgelehnt|likely be rejected)/)).toBeTruthy();
        expectNoRenderFailure();
    });

    it('The tools dialog offers every tool with every usable name and the placeholder', async () => {
        renderView(<ToolsDialog opened onClose={() => {}} apiUrl="https://api.example/v1" />);
        const dialog = await screen.findByRole('dialog');
        for (const name of ['VS Code', 'OpenCode', 'Claude Code', 'Codex', 'Continue', 'Kilo Code', 'Zed', 'Cline', 'Roo Code', 'curl']) expect(await within(dialog).findByRole('tab', { name })).toBeTruthy();
        // VS Code is open first, with every usable name and its smallest limits.
        const text = dialog.textContent.replace(/\s+/g, ' ');
        for (const id of ['chat-default', 'chat-large', 'qwen3.8-flash-next-iq3_s']) expect(text).toContain(`"id": "${id}"`);
        expect(text).toContain('"maxInputTokens": 24576');
        fireEvent.click(within(dialog).getByRole('tab', { name: 'Cline' }));
        expect((await within(dialog).findAllByText('$DHBW_API_KEY')).length).toBe(2);
        expect(within(dialog).getByText('https://api.example/v1')).toBeTruthy();
        expectNoRenderFailure();
    });

    it('The tools dialog fills in a key it is given', async () => {
        renderView(<ToolsDialog opened onClose={() => {}} apiUrl="https://api.example/v1" apiKey="sk-new" />);
        const dialog = await screen.findByRole('dialog');
        fireEvent.click(await within(dialog).findByRole('tab', { name: 'Cline' }));
        expect(await within(dialog).findByText('sk-new')).toBeTruthy();
        expect(within(dialog).queryByText('$DHBW_API_KEY')).toBeNull();
        expectNoRenderFailure();
    });

    it('Available models lists the usable names with kind, context, state and project', async () => {
        renderView(<LlmAvailableModels />);
        expect(await screen.findByText('chat-large')).toBeTruthy();
        expect(screen.getByRole('button', { name: /(Werkzeuge einrichten|Set up tools)/ })).toBeTruthy();
        expect(screen.getByText('24k–96k / 8k–32k')).toBeTruthy();
        expect(screen.getAllByText('KI-Labor')).toHaveLength(2);
        // The short description is the first paragraph, as plain text.
        expect(screen.getByText('Großes MoE-Modell.')).toBeTruthy();
        expect(screen.getByText(/(derzeit nicht bereitgestellt|not deployed at the moment)/)).toBeTruthy();
        expect(screen.getByText(/(das Modell dahinter kann wechseln|the model behind it may change)/)).toBeTruthy();
        expectNoRenderFailure();
    });

    it('A row opens a compact header and the sanitised description on request, without the tools', async () => {
        renderView(<LlmAvailableModels />);
        fireEvent.click(await screen.findByRole('button', { name: 'chat-large' }));
        const dialog = await screen.findByRole('dialog');
        // Header: short description (first paragraph), origin and licence of the described model, the context of every deployment.
        expect(within(dialog).getByText('Großes MoE-Modell.')).toBeTruthy();
        expect(within(dialog).getByText('Apache-2.0')).toBeTruthy();
        expect(within(dialog).getByRole('link', { name: /(Modellseite|Model page)/ }).getAttribute('href')).toBe('https://huggingface.co/x/y');
        expect(within(dialog).getByText('24k–96k / 8k–32k')).toBeTruthy();
        expect(within(dialog).getByText(/(Kontext \(Eingabe \/ Antwort\)|Context \(input \/ answer\))/)).toBeTruthy();
        // No device classes any more.
        expect(within(dialog).queryByText('GB10')).toBeNull();
        // The longer description behind the toggle, sanitised.
        fireEvent.click(within(dialog).getByRole('button', { name: /(Mehr zum Modell|More about the model)/ }));
        const html = within(dialog).getByTestId('model-description').innerHTML;
        expect(html).toContain('<strong>MoE</strong>');
        expect(html).not.toContain('<script');
        expect(html).not.toContain('onerror');
        expect(window.__pwned).toBeUndefined();
        // The setup of the tools is not in here.
        expect(within(dialog).queryByRole('tab')).toBeNull();
        expectNoRenderFailure();
    });

    it('Model descriptions for admins mark a served model without a description', async () => {
        renderView(<ModelDescriptionsAdmin />);
        expect(await screen.findByText('qwen3.6:35b-a3b-coding-nvfp4')).toBeTruthy();
        expect(screen.getByText(/(ohne Beschreibung|no description)/)).toBeTruthy();
        fireEvent.click(screen.getAllByRole('button', { name: /(Ändern|Change)/ })[0]);
        expect(await screen.findByRole('dialog')).toBeTruthy();
        expectNoRenderFailure();
    });

    it('API keys lists the keys', async () => {
        renderView(<LlmKeys />);
        expect(await screen.findByText('vscode')).toBeTruthy();
        expectNoRenderFailure();
    });

    it('A new key shows its secret once, without tool tabs, and hands it to the tools dialog', async () => {
        globalThis.__llmApi.createKey = async () => ({ key: 'sk-fresh-123' });
        renderView(<LlmKeys />);
        fireEvent.change(await screen.findByPlaceholderText(/(Name \(Pflicht\)|Name \(required\))/), { target: { value: 'laptop' } });
        fireEvent.click(screen.getByRole('button', { name: /(API Key erstellen|Create API key)/ }));
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getAllByText(/sk-fresh-123/).length).toBeGreaterThan(0);
        expect(within(dialog).queryByRole('tab')).toBeNull();
        fireEvent.click(within(dialog).getByRole('button', { name: /(Werkzeuge einrichten|Set up tools)/ }));
        const tools = await screen.findByRole('dialog', { name: /(Werkzeuge einrichten|Set up tools)/ });
        fireEvent.click(await within(tools).findByRole('tab', { name: 'Cline' }));
        expect(await within(tools).findByText('sk-fresh-123')).toBeTruthy();
        expect(within(tools).queryByText('$DHBW_API_KEY')).toBeNull();
        expect(JSON.stringify([...store.values()])).not.toContain('sk-fresh-123');
        expectNoRenderFailure();
    });

    it('Usage shows the quota and the keys', async () => {
        renderView(<LlmUsage />);
        expect(await screen.findByText('vscode')).toBeTruthy();
        expectNoRenderFailure();
    });

    it('Fleet shows the machines', async () => {
        renderView(<LlmFleet params={{ page: 'machines' }} />);
        expect(await screen.findByText('wimac02')).toBeTruthy();
        // The machine's own address under the tunnel address.
        expect(screen.getByText('141.72.16.101')).toBeTruthy();
        expectNoRenderFailure();
    });

    it('Fleet offers a machine waiting for approval to be approved, without an address yet', async () => {
        renderView(<LlmFleet params={{ page: 'machines' }} />);
        expect(await screen.findByText('wimac03')).toBeTruthy();
        expect(screen.getByText(/wartet auf Freigabe|awaiting approval/)).toBeTruthy();
        expect(screen.getByText(/nur per Schlüssel erkannt|recognised by key only/)).toBeTruthy();
        // Its address is not handed out before the approval.
        expect(screen.queryByText('10.90.4.4')).toBeNull();
        expectNoRenderFailure();
    });

    // The service lists machines by tunnel address, the ones waiting for approval (no address yet) first; the table orders them itself.
    const SORT_FLEET = {
        ...FLEET,
        peers: [
            { serial: 'P1', name: 'wimac10', state: 'wartet auf Freigabe', pending: true, profile: 'm4-16', model: 'qwen3:8b' },
            { serial: 'A1', name: 'dmmac17-10', address: '10.90.4.20', profile: 'm4-16', model: 'qwen3:8b', state: 'aktiv' },
            { serial: 'A2', name: 'Wimac2', address: '10.90.4.100', profile: 'm4-24', model: 'gemma3', state: 'aktiv' },
            { serial: 'A3', name: 'dmmac17-2', address: '10.90.4.9', profile: 'm4-16', model: 'qwen3:14b', state: 'gesperrt', blocked: true },
        ],
    };
    const machineOrder = () => screen.getAllByRole('row').slice(1).map(r => within(r).getAllByText(/mac/i)[0].textContent);
    const header = (name) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

    it('Fleet lists the machines by name in natural order, not in the service\'s order', async () => {
        globalThis.__llmApi.getFleet = async () => SORT_FLEET;
        renderView(<LlmFleet params={{ page: 'machines' }} />);
        await screen.findByText('wimac10');
        expect(machineOrder()).toEqual(['dmmac17-2', 'dmmac17-10', 'Wimac2', 'wimac10']);
        expect(header('Name').getAttribute('aria-sort')).toBe('ascending');
        expectNoRenderFailure();
    });

    it('Fleet sorts by address numerically, machines without one last, and toggles the direction', async () => {
        globalThis.__llmApi.getFleet = async () => SORT_FLEET;
        renderView(<LlmFleet params={{ page: 'machines' }} />);
        await screen.findByText('wimac10');
        fireEvent.click(header('(Adresse|Address)'));
        expect(machineOrder()).toEqual(['dmmac17-2', 'dmmac17-10', 'Wimac2', 'wimac10']);
        fireEvent.click(header('(Adresse|Address)'));
        expect(machineOrder()).toEqual(['Wimac2', 'dmmac17-10', 'dmmac17-2', 'wimac10']);
        expect(header('(Adresse|Address)').getAttribute('aria-sort')).toBe('descending');
        // Remembered for the next visit.
        expect(JSON.parse(localStorage.getItem('self-service.llm-fleet.sort'))).toEqual({ key: 'address', order: 'desc' });
        fireEvent.click(header('Name'));
        expect(machineOrder()).toEqual(['dmmac17-2', 'dmmac17-10', 'Wimac2', 'wimac10']);
        fireEvent.click(header('Name'));
        expect(machineOrder()).toEqual(['wimac10', 'Wimac2', 'dmmac17-10', 'dmmac17-2']);
        expectNoRenderFailure();
    });

    it('Fleet starts with the sort the browser kept and picks the same machines whatever the order', async () => {
        globalThis.__llmApi.getFleet = async () => SORT_FLEET;
        localStorage.setItem('self-service.llm-fleet.sort', JSON.stringify({ key: 'model', order: 'desc' }));
        renderView(<LlmFleet params={{ page: 'machines' }} />);
        await screen.findByText('wimac10');
        expect(machineOrder()).toEqual(['dmmac17-2', 'dmmac17-10', 'wimac10', 'Wimac2']);
        fireEvent.click(screen.getByRole('checkbox', { name: 'Wimac2' }));
        fireEvent.click(header('Name'));
        expect(screen.getByRole('checkbox', { name: 'Wimac2' }).checked).toBe(true);
        expect(screen.getByRole('checkbox', { name: 'dmmac17-2' }).checked).toBe(false);
        expectNoRenderFailure();
    });

    it('Fleet shows the GPU cluster\'s inference pool', async () => {
        renderView(<LlmFleet params={{ page: 'gpu' }} />);
        expect(await screen.findByText('gap-gpu-1')).toBeTruthy();
        expect(screen.getByText('Qwen/Qwen2.5-0.5B-Instruct')).toBeTruthy();
        expect(screen.getByText('gpu-base-l4-3q-0')).toBeTruthy();
        expectNoRenderFailure();
    });

    it('Fleet shows the setup with the Linux install command', async () => {
        renderView(<LlmFleet params={{ page: 'setup' }} />);
        expect(await screen.findByText(/dhbw-llm-agent\.sh/)).toBeTruthy();
        // The firewall rule names the endpoint the machines actually dial.
        expect(screen.getByText(/wg4\.example/)).toBeTruthy();
        expectNoRenderFailure();
    });
});
