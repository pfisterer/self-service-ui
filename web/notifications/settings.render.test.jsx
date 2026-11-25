// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import i18n from '/i18n/index.js';
import { renderView } from '/test/render-harness.jsx';
import { NotificationSettings } from './settings.jsx';

const PREFS = { recipient: 'person@example.edu', is_default: true, language: 'de', classes: { action: 'immediate', disruption: 'immediate', info: 'digest' }, digest: 'weekly', quiet_hours: { enabled: true, start: '20:00', end: '07:00', weekends: true }, unsubscribed: [] };
const TYPES = { types: [{ type: 'approval.waiting', class: 'action', name: 'Request awaiting a decision' }], modes: { action: ['immediate', 'digest'], disruption: ['immediate', 'digest', 'off'], info: ['digest', 'off'] } };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function stubFetch(calls) {
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
        calls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body });
        const path = String(url);
        const body = path.includes('/v1/types') ? TYPES : path.includes('/v1/notifications') ? [] : (init?.method === 'PUT' ? { ...JSON.parse(init.body), recipient: PREFS.recipient, is_default: false } : PREFS);
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
});
