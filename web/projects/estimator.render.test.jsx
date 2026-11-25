// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import i18n from '/i18n/index.js';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { fakeNodesApi, fixtureTree, renderView } from '/test/render-harness.jsx';
import { applicable, budgetVerdict, ESTIMATE_DEFAULTS, estimateInput, formsFromInput } from './component-estimator.jsx';

// The estimator in the request dialog: the form from /v1/estimate/options, the free-text field only where the server reads descriptions, the result taken into the fields.

vi.mock('/projects/api-nodes.jsx', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, useNodesApi: () => globalThis.__testApi };
});
vi.mock('/projects/token-labels.jsx', () => ({
    useTokenLabels: () => ({}),
    tokenDisplay: (t) => t,
    tokenEmail: (t) => String(t).replace(/^user:/, ''),
    TokenLabelProvider: ({ children }) => children,
}));

const { EstimatorSection } = await import('/projects/component-estimator.jsx');
const { ProjectFormModal } = await import('/projects/modal-project-form.jsx');

const LLM = [
    { id: 'llm-mtokens', name: 'LLM tokens', unit: 'M tokens', kind: 'window', window: '30d', default: 0, min: 0, max: 100000, provider: 'aiaas', area: 'llm' },
    { id: 'llm-rpm', name: 'LLM requests per minute', default: 60, min: 0, max: 100000, provider: 'aiaas', area: 'llm' },
    { id: 'llm-tpm', name: 'LLM tokens per minute', default: 200000, min: 0, max: 100000000, provider: 'aiaas', area: 'llm' },
];

const RESULT = {
    input: {},
    result: {
        limit: { 'llm-mtokens': 49, 'llm-tpm': 630000, 'llm-rpm': 100, 'llm-model-chat-large': 1 },
        assumptions: [{ code: 'llm_profile', text: 'Werkzeug code (Modell code): 10 Anfragen je Person und Stunde' }],
        warnings: [{ code: 'llm_key_window_raises_pool', text: 'Damit der Anteil eines Schlüssels reicht' }],
        profiles_version: '2026-11-25',
    },
    budget: { budget_id: 'b_ma', fits: true, auto_approved: false, plan: { parts: [] } },
};

// The texts asserted are the German ones, the portal's language.
let before;
beforeAll(async () => { before = i18n.language; await i18n.changeLanguage('de'); });
afterAll(async () => { await i18n.changeLanguage(before); });
beforeEach(() => {
    globalThis.__testApi = fakeNodesApi(fixtureTree());
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('estimateInput', () => {
    it('builds the body of an LLM estimate with numbers', () => {
        expect(estimateInput('llm', { ...ESTIMATE_DEFAULTS.llm, persons: '20', hours_per_session: 3.5 }, 'typical')).toEqual({
            level: 'typical', llm: { tool: 'code', persons: 20, sessions_per_week: 1, hours_per_session: 3.5, weeks: 12, together: true },
        });
    });
    it('leaves out empty flavour rows and volumes, and participants unless per person', () => {
        const body = estimateInput('cloud', { flavors: [{ flavor: 'm1.large', count: 3 }, { flavor: '', count: 1 }], volumes: [{ size_gb: '', count: 1 }], per_person: false, participants: 20 }, 'high');
        expect(body).toEqual({ level: 'high', cloud: { flavors: [{ flavor: 'm1.large', count: 3 }], per_person: false } });
        expect(estimateInput('cloud', { flavors: [{ flavor: 'm1.small', count: 1 }], volumes: [{ size_gb: 10, count: 2 }], per_person: true, participants: 30 }, 'typical').cloud)
            .toEqual({ flavors: [{ flavor: 'm1.small', count: 1 }], volumes: [{ size_gb: 10, count: 2 }], per_person: true, participants: 30 });
    });
    it('names the GPU class of a workspace only when one is chosen', () => {
        expect(estimateInput('workspaces', ESTIMATE_DEFAULTS.workspaces, 'typical').workspaces.gpu_class).toBeUndefined();
        expect(estimateInput('workspaces', { ...ESTIMATE_DEFAULTS.workspaces, kind: 'gpu', gpu_class: 'l4' }, 'typical').workspaces).toMatchObject({ kind: 'gpu', gpu_class: 'l4' });
    });
});

describe('formsFromInput', () => {
    it('takes what the model filled and keeps the rest', () => {
        const out = formsFromInput(ESTIMATE_DEFAULTS, { llm: { tool: 'agent', persons: 3, sessions_per_week: 2, hours_per_session: 1, weeks: 6, together: false } });
        expect(out.llm).toMatchObject({ tool: 'agent', persons: 3, together: false });
        expect(out.cloud).toBe(ESTIMATE_DEFAULTS.cloud);
    });
});

describe('applicable', () => {
    it('splits a proposal into what the form offers and what it does not', () => {
        expect(applicable({ 'llm-mtokens': 49, 'llm-model-chat-large': 1 }, LLM)).toEqual({ take: { 'llm-mtokens': 49 }, missing: ['llm-model-chat-large'] });
    });
});

describe('budgetVerdict', () => {
    it('says whether the budget grants at once, lets part wait, lacks something or could not be asked', () => {
        expect(budgetVerdict(null)).toBeNull();
        expect(budgetVerdict({ fits: true, auto_approved: true }).key).toBe('budgetInstant');
        expect(budgetVerdict({ fits: true, auto_approved: false }).key).toBe('budgetWaits');
        expect(budgetVerdict({ fits: false, plan: { unplaced: { cores: 4 } } })).toEqual({ key: 'budgetMissing', tone: 'negative', vars: { list: 'cores' } });
        expect(budgetVerdict({ error: 'Keine Berechtigung.' }).key).toBe('budgetError');
    });
});

describe('EstimatorSection', () => {
    // The feature gate (GET /v1/config features.estimator): closed, the helper is not there at all; a config without features leaves it open.
    it('is hidden where the estimator gate is closed to the person', () => {
        globalThis.__testApi = { ...fakeNodesApi(fixtureTree()) };
        renderView(<EstimatorSection kind="llm" offered={LLM} budgetId="b_ma" onApply={() => {}} />, { config: { resources: LLM, roles: [], features: { estimator: false } } });
        expect(screen.queryByRole('button', { name: 'Schätzen' })).toBeNull();
        cleanup();
        renderView(<EstimatorSection kind="llm" offered={LLM} budgetId="b_ma" onApply={() => {}} />, { config: { resources: LLM, roles: [], features: { estimator: true } } });
        expect(screen.getAllByRole('button', { name: 'Schätzen' }).length).toBeGreaterThan(0);
    });

    it('computes, shows assumptions, warnings and the budget, and takes the offered amounts into the fields', async () => {
        const estimate = vi.fn(async () => RESULT);
        globalThis.__testApi = { ...fakeNodesApi(fixtureTree()), estimate };
        const onApply = vi.fn();
        renderView(<EstimatorSection kind="llm" offered={LLM} budgetId="b_ma" onApply={onApply} />);
        fireEvent.click(screen.getAllByRole('button', { name: 'Schätzen' })[0]);
        await screen.findByText('Beschreibung der Nutzung');
        await waitFor(() => expect(screen.getByRole('button', { name: /Berechnen/ }).disabled).toBe(false));
        fireEvent.click(screen.getByRole('button', { name: /Berechnen/ }));
        await screen.findByTestId('estimate-result');
        expect(estimate).toHaveBeenCalledWith(expect.objectContaining({ budgetId: 'b_ma', input: expect.objectContaining({ llm: expect.objectContaining({ tool: 'code', persons: 20 }) }) }));
        expect(screen.getByText(/10 Anfragen je Person und Stunde/)).toBeTruthy();
        expect(screen.getByText(/Anteil eines Schlüssels/)).toBeTruthy();
        expect(screen.getByText(/wartet auf die Entscheidung der Verwaltenden/)).toBeTruthy();
        expect(screen.getByText(/Nicht in diesem Formular verfügbar: llm-model-chat-large/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'In die Felder übernehmen' }));
        expect(onApply).toHaveBeenCalledWith({ 'llm-mtokens': 49, 'llm-tpm': 630000, 'llm-rpm': 100 });
    });

    it('fills the form from a description and shows what the model assumed or dropped', async () => {
        const estimateDescribe = vi.fn(async () => ({
            ...RESULT,
            described: { input: { llm: { tool: 'chat', persons: 5, sessions_per_week: 1, hours_per_session: 1, weeks: 4, together: false } }, assumptions: ['Ein Semester hat 12 Wochen'], corrections: [{ code: 'model_dropped', text: 'Das Modell „gpt-9“ ist unbekannt' }] },
        }));
        globalThis.__testApi = { ...fakeNodesApi(fixtureTree()), estimateDescribe };
        renderView(<EstimatorSection kind="llm" offered={LLM} onApply={() => {}} />);
        fireEvent.click(screen.getAllByRole('button', { name: 'Schätzen' })[0]);
        const field = await screen.findByLabelText(/Beschreibung der Nutzung/);
        fireEvent.change(field, { target: { value: '5 Leute chatten eine Stunde pro Woche' } });
        fireEvent.click(screen.getByRole('button', { name: /Formular aus Beschreibung füllen/ }));
        await screen.findByText('Ein Semester hat 12 Wochen');
        expect(estimateDescribe).toHaveBeenCalledWith(expect.objectContaining({ description: '5 Leute chatten eine Stunde pro Woche' }));
        expect(screen.getByText(/gpt-9/)).toBeTruthy();
        expect(screen.getByLabelText('Personen').value).toBe('5');
    });

    it('offers no free-text field where the server reads no descriptions', async () => {
        const api = fakeNodesApi(fixtureTree());
        globalThis.__testApi = { ...api, estimateOptions: async () => ({ ...(await api.estimateOptions()), describe_enabled: false }) };
        renderView(<EstimatorSection kind="cloud" offered={[{ id: 'cores', name: 'Cores', provider: 'openstack' }]} onApply={() => {}} />);
        fireEvent.click(screen.getAllByRole('button', { name: 'Schätzen' })[0]);
        await screen.findByText('Flavor hinzufügen');
        expect(screen.queryByText('Beschreibung der Nutzung')).toBeNull();
    });

    it('is part of the request dialog of a new LLM project', async () => {
        renderView(<ProjectFormModal opened onClose={() => {}} resources={LLM} roles={['member', 'reader']}
            myBudgets={[]} eligibleBudgets={[{ id: 'b_ma', kind: 'budget', name: 'Mannheim', status: 'approved', limit: { 'llm-mtokens': 1000, 'llm-rpm': 1000, 'llm-tpm': 10000000 }, eligible_requesters: ['user:x@example.org'] }]}
            initialTab="resources" />);
        await waitFor(() => expect(screen.getAllByText(/Mengen aus der geplanten Nutzung berechnen/).length).toBeGreaterThan(0));
    });
});
