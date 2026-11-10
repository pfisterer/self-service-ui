// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { fakeNodesApi, fixtureTree, renderView } from '/test/render-harness.jsx';
import { llmLimitIssues, lowRates, MIN_USABLE_RPM, MIN_USABLE_TPM } from './util-llm-limits.js';

// The hints for an LLM project that cannot be used: no tokens (no chat, no API keys), or rate limits too low for a request to pass (case of a project with tpm 100).

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

const { ProjectCard } = await import('/projects/card-project.jsx');
const { ProjectFormModal } = await import('/projects/modal-project-form.jsx');
const { LlmPoolWarnings } = await import('/projects/component-llm-limits.jsx');

const LLM = [
    { id: 'cores', name: 'Cores', default: 4, min: 0, max: 64, provider: 'openstack', area: 'cloud' },
    { id: 'llm-mtokens', name: 'LLM tokens', unit: 'M tokens', kind: 'window', window: '30d', group: 'LLM', default: 0, min: 0, max: 1000, provider: 'aiaas', area: 'llm' },
    { id: 'llm-rpm', name: 'LLM requests per minute', unit: 'req/min', group: 'LLM', default: 60, min: 0, max: 100000, provider: 'aiaas', area: 'llm' },
    { id: 'llm-tpm', name: 'LLM tokens per minute', unit: 'tokens/min', group: 'LLM', default: 200000, min: 0, max: 100000000, provider: 'aiaas', area: 'llm' },
];

const NO_TOKENS = /Ohne Token-Kontingent ist kein Zugang|Without a token quota there is no access/;
const LOW = /werden Anfragen voraussichtlich abgelehnt|requests will likely be rejected/;

function project(limit, extra = {}) {
    const p = fixtureTree().children.b_ma.items[0];
    return { ...p, status: 'approved', limit, allocations: [], parent_name: 'Mannheim', parent_path: [{ id: 'b_ma', name: 'Mannheim' }], ...extra };
}

let consoleErrors = [];
beforeEach(() => {
    globalThis.__testApi = fakeNodesApi(fixtureTree());
    consoleErrors = [];
    vi.spyOn(console, 'error').mockImplementation((...args) => { consoleErrors.push(args.join(' ')); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const fatal = () => consoleErrors.filter(e => /Error|Warning: Maximum|is not defined|Cannot read/.test(e));

describe('llmLimitIssues', () => {
    it('finds no tokens and rates below the usable minimum', () => {
        expect(llmLimitIssues({ 'llm-mtokens': 0, 'llm-rpm': 60, 'llm-tpm': 100 }, LLM)).toEqual({ noTokens: true, lowRpm: null, lowTpm: 100 });
        expect(llmLimitIssues({ 'llm-mtokens': 10, 'llm-rpm': 2 }, LLM)).toEqual({ noTokens: false, lowRpm: 2, lowTpm: null });
    });

    it('takes unlimited, unset and 0 rates as fine, and the recommended values too', () => {
        expect(llmLimitIssues({ 'llm-mtokens': -1, 'llm-rpm': -1, 'llm-tpm': 0 }, LLM)).toEqual({ noTokens: false, lowRpm: null, lowTpm: null });
        expect(llmLimitIssues({ 'llm-mtokens': 10, 'llm-rpm': 30, 'llm-tpm': 100000 }, LLM)).toEqual({ noTokens: false, lowRpm: null, lowTpm: null });
        expect(llmLimitIssues({ 'llm-mtokens': 1, 'llm-rpm': MIN_USABLE_RPM, 'llm-tpm': MIN_USABLE_TPM }, LLM)).toEqual({ noTokens: false, lowRpm: null, lowTpm: null });
    });

    it('is null for a catalogue without LLM resources', () => {
        expect(llmLimitIssues({ cores: 2 }, [LLM[0]])).toBeNull();
    });

    it('reads the pools of the AI service, where 0 is no limit', () => {
        expect(lowRates({ rpm: 0, tpm: 100 })).toEqual({ rpm: null, tpm: 100 });
        expect(lowRates({ rpm: 60, tpm: 200000 })).toEqual({ rpm: null, tpm: null });
    });
});

describe('LLM hints render', () => {
    it('a card of an LLM project without tokens says there is no access, and warns about a tpm of 100', async () => {
        renderView(<ProjectCard node={project({ 'llm-mtokens': 0, 'llm-rpm': 60, 'llm-tpm': 100 })} resources={LLM} />);
        expect(await screen.findByText(NO_TOKENS)).toBeTruthy();
        expect(screen.getByText(LOW)).toBeTruthy();
        expect(screen.getByText(/100 (Tokens pro Minute|tokens per minute)/)).toBeTruthy();
        expect(fatal()).toEqual([]);
    });

    it('a card of a usable LLM project and of a cloud project says nothing', async () => {
        renderView(<>
            <ProjectCard node={project({ 'llm-mtokens': 10, 'llm-rpm': 30, 'llm-tpm': 100000 })} resources={LLM} />
            <ProjectCard node={project({ cores: 2 })} resources={LLM} />
        </>);
        expect(await screen.findAllByText('Mein Projekt')).toHaveLength(2);
        expect(screen.queryByText(NO_TOKENS)).toBeNull();
        expect(screen.queryByText(LOW)).toBeNull();
    });

    it('the form of a new LLM project shows the recommended values and warns while low values are entered', async () => {
        const tree = fixtureTree();
        const budget = { ...tree.roots[0], id: 'b_llm', name: 'LLM budget', available_resources: ['llm-mtokens', 'llm-rpm', 'llm-tpm'], limit: { 'llm-mtokens': 1000, 'llm-rpm': 1000, 'llm-tpm': 10000000 } };
        renderView(<ProjectFormModal opened onClose={() => {}} resources={LLM} roles={['member']} myBudgets={[budget]} initialKind="llm" />);
        fireEvent.click(await screen.findByRole('tab', { name: /Resources|Ressourcen/ }));
        expect(await screen.findByText(/(Empfehlung zum Ausprobieren|Recommended to try things out): 10 M/)).toBeTruthy();
        // The default of 0 tokens: no access.
        expect(screen.getByText(NO_TOKENS)).toBeTruthy();
        expect(screen.queryByText(LOW)).toBeNull();
        const tpm = screen.getByRole('textbox', { name: /Tokens per minute/ });
        fireEvent.change(tpm, { target: { value: '100' } });
        expect(await screen.findByText(LOW)).toBeTruthy();
        expect(fatal()).toEqual([]);
    });

    it('the LLM area warns about a pool whose limits are too low', async () => {
        renderView(<LlmPoolWarnings projects={[{ slug: 'p1', name: 'Nils Test', rpm: 60, tpm: 100 }, { slug: 'p2', name: 'Fine', rpm: 30, tpm: 100000 }]} />);
        expect(await screen.findByText(/Nils Test/)).toBeTruthy();
        expect(screen.queryByText(/Fine/)).toBeNull();
    });
});
