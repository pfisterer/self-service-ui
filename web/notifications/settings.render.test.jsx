// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import i18n from '/i18n/index.js';
import { renderView } from '/test/render-harness.jsx';
import { NotificationSettings } from './settings.jsx';

const PREFS = { recipient: 'person@example.edu', is_default: true, language: 'de', classes: { action: 'immediate', disruption: 'immediate', info: 'digest' }, digest: 'weekly', unsubscribed: [] };
const TYPES = { types: [{ type: 'approval.waiting', class: 'action', name: 'Request awaiting a decision' }], modes: { action: ['immediate', 'digest'], disruption: ['immediate', 'digest', 'off'], info: ['digest', 'off'] } };

const RECENT = [{ id: 7, type: 'allocation.expired', class: 'action', title: 'Allocation expired: Course project', text: 'The allocation from the budget “DSKI” has expired.', url: `${window.location.origin}/projects?project=p_1`, status: 'sent', created_at: '2026-11-25T09:00:00Z', open: true }];

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function stubFetch(calls) {
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
        calls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body });
        const path = String(url);
        const body = path.includes('/v1/types') ? TYPES : path.includes('/v1/notifications') ? RECENT : (init?.method === 'PUT' ? { ...JSON.parse(init.body), recipient: PREFS.recipient, is_default: false } : PREFS);
        return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
}

describe('NotificationSettings', () => {
    it('renders the settings and saves a change', async () => {
        await i18n.changeLanguage('en');
        const calls = [];
        stubFetch(calls);
        renderView(<NotificationSettings />);
        expect(await screen.findByText('Notifications')).toBeTruthy();
        expect(screen.getByText('Request awaiting a decision')).toBeTruthy();
        const save = screen.getByRole('button', { name: 'Save' });
        expect(save.disabled).toBe(true);
        fireEvent.click(screen.getByRole('checkbox', { name: /Request awaiting a decision/ }));
        expect(save.disabled).toBe(false);
        fireEvent.click(save);
        await waitFor(() => expect(calls.some(c => c.method === 'PUT')).toBe(true));
        const put = JSON.parse(calls.find(c => c.method === 'PUT').body);
        expect(put.unsubscribed).toEqual(['approval.waiting']);
        expect(put.recipient).toBeUndefined();
    });

    it('opens a recent notification on click, with its text and a link into the portal', async () => {
        await i18n.changeLanguage('en');
        stubFetch([]);
        renderView(<NotificationSettings />);
        fireEvent.click(await screen.findByText('Allocation expired: Course project'));
        expect((await screen.findAllByText(/has expired/)).length).toBeGreaterThan(0);
        const open = screen.getAllByRole('link', { name: 'Open', hidden: true })[0];
        expect(open.getAttribute('href')).toContain('/projects?project=p_1');
    });
});
