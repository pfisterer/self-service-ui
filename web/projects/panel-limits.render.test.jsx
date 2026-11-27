// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { CAPS, renderView } from '/test/render-harness.jsx';
import i18n from '/i18n/index.js';

// The side panel of a project (new layout): "Modelle und Grenzen" in its "Mehr" opens the edit dialog on the LLM resources, and the overview shows the caps its budgets set, read-only.

vi.mock('/projects/cloud-status.jsx', () => ({
    useCloudStatus: () => ({ isRoot: false, pending: 0, hasBudgets: false, ready: true, offered: [], refresh: () => {} }),
    CloudStatusProvider: ({ children }) => children,
}));
vi.mock('/projects/token-labels.jsx', () => ({
    useTokenLabels: () => ({ labelFor: (t) => t, loading: false }),
    tokenDisplay: (t) => t,
    tokenEmail: (t) => String(t).replace(/^user:/, ''),
    TokenLabelProvider: ({ children }) => children,
}));
// Without the AI service there are no keys to show: the primary action is "Bearbeiten", the rest in "Mehr".
vi.mock('/ai-areas.jsx', () => ({ useAiAreasVisible: () => ({ llm: {}, workspaces: null, llmArea: null, anyVisible: false }) }));

const { ProjectPanel } = await import('/projects/project-tile.jsx');

afterEach(cleanup);

const RESOURCES = [
    { id: 'ws-vcpu-hours', name: 'vCPU-Stunden', provider: 'aiaas', area: 'workspaces', kind: 'window', window: '30d' },
    { id: 'llm-mtokens', name: 'LLM tokens', unit: 'M tokens', kind: 'window', window: '30d', provider: 'aiaas', area: 'llm' },
    { id: 'llm-rpm', name: 'LLM requests per minute', provider: 'aiaas', area: 'llm' },
];
const CONFIG = { resources: RESOURCES, roles: ['member'], caps: CAPS };

const project = (extra = {}) => ({
    id: 'p_llm', kind: 'project', status: 'approved', name: 'Kurs mit Sprachmodell', owner: 'user:owner@example.org',
    limit: { 'ws-vcpu-hours': 100, 'llm-mtokens': 10, 'llm-rpm': 30 },
    allocations: [{ id: 'a_1', budget_id: 'b_1', budget_name: 'Kursbudget', status: 'approved', limit: { 'ws-vcpu-hours': 100, 'llm-mtokens': 10, 'llm-rpm': 30 }, revision: 1 }],
    funding_budget_ids: ['b_1'], authorized_users: [], created_at: '2026-11-01T10:00:00Z', termination_date: '2027-03-31',
    inherited_caps: { 'release-gpu-max-hours': 4, 'batch-jobs-per-person': 2, 'batch-max-hours': 8 },
    ...extra,
});

function renderPanel(node, perspective = 'owner', ctx = { resources: RESOURCES, filter: 'all' }) {
    const onAction = vi.fn();
    renderView(<ProjectPanel node={node} ctx={{ ...ctx, perspective }} tab="overview"
        onTab={() => {}} onClose={() => {}} onAction={onAction} onOpen={() => {}} />, { config: CONFIG, user: { profile: { email: 'owner@example.org' } } });
    return onAction;
}

describe('the side panel of an LLM project', () => {
    it('offers "Modelle und Grenzen" in its "Mehr", opening the edit dialog on the LLM resources', async () => {
        const onAction = renderPanel(project());
        fireEvent.click(await screen.findByRole('button', { name: i18n.t('projects.v2.more') }));
        fireEvent.click(await screen.findByText(i18n.t('projects.v2.action.limits')));
        expect(onAction).toHaveBeenCalledWith('change', expect.objectContaining({ id: 'p_llm' }), 'resources-llm');
    });

    it('offers "Modelle und Grenzen" also on a page filtered to another kind, which only knows that kind\'s resources', async () => {
        const workspaces = RESOURCES.filter(r => r.area === 'workspaces');
        renderPanel(project(), 'owner', { resources: workspaces, allResources: RESOURCES, filter: 'workspaces' });
        fireEvent.click(await screen.findByRole('button', { name: i18n.t('projects.v2.more') }));
        expect(await screen.findByText(i18n.t('projects.v2.action.limits'))).toBeTruthy();
    });

    it('shows the caps of its budgets in the overview, by group', async () => {
        renderPanel(project());
        expect(await screen.findByText(i18n.t('projects.v2.limits'))).toBeTruthy();
        expect(screen.getByText(i18n.t('projects.caps.group.batch-jobs.title', { defaultValue: 'Batch jobs' }))).toBeTruthy();
        expect(screen.getByText(/8 h/)).toBeTruthy();
    });

    it('shows a member the caps too, without the way to change them', async () => {
        renderPanel(project({ viewer_relation: 'member', members_hidden: 3 }), 'member');
        expect(await screen.findByText(i18n.t('projects.v2.limits'))).toBeTruthy();
        expect(screen.queryByText(i18n.t('projects.v2.action.limits'))).toBeNull();
    });
});
