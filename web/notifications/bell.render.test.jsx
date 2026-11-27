// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import i18n from '/i18n/index.js';
import { renderView } from '/test/render-harness.jsx';
import { NotificationBell } from './bell.jsx';
import { readSeen, writeSeen } from './bell.js';

const PERSON = 'person@example.edu';

const RECENT = [
    { id: 9, type: 'approval.waiting', class: 'action', title: 'Request awaiting a decision: Course project', text: '', url: `${window.location.origin}/projects?project=p_1`, status: 'sent', created_at: '2026-11-27T09:00:00Z', open: true },
    { id: 8, type: 'approval.decided', class: 'info', title: 'Request approved: Thesis', text: '', status: 'sent', created_at: '2026-11-26T09:00:00Z', open: false },
    { id: 7, type: 'allocation.expired', class: 'action', title: 'Allocation expired: Old course', text: '', url: 'https://elsewhere.example.edu/x', status: 'sent', created_at: '2026-11-20T09:00:00Z', open: false },
];

// A storage of its own per test, as in helper/tree.render.test.jsx: Node's own localStorage (without --localstorage-file) hides jsdom's.
beforeEach(() => {
    const store = new Map();
    vi.stubGlobal('localStorage', { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear() });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function stubFetch(answer) {
    const fetch = vi.fn(async () => answer());
    vi.stubGlobal('fetch', fetch);
    return fetch;
}

const ok = (body) => () => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('NotificationBell', () => {
    it('counts what came since the list was last opened, lists it on click and marks it seen', async () => {
        await i18n.changeLanguage('en');
        writeSeen(PERSON, '2026-11-25T00:00:00Z');
        const fetch = stubFetch(ok(RECENT));
        renderView(<NotificationBell person={PERSON} />);
        const bell = await screen.findByRole('button', { name: 'Notifications, new: 2' });
        expect(String(fetch.mock.calls[0][0])).toContain('/v1/notifications?limit=20');
        expect(screen.getByText('2')).toBeTruthy();

        fireEvent.click(bell);
        expect(await screen.findByText('Request awaiting a decision: Course project')).toBeTruthy();
        expect(screen.getByText('Allocation expired: Old course')).toBeTruthy();
        const link = screen.getByText('Request awaiting a decision: Course project').closest('a');
        expect(link.getAttribute('href')).toContain('/projects?project=p_1');
        expect(screen.getByText('Allocation expired: Old course').closest('a').getAttribute('target')).toBe('_blank');
        expect(screen.getByText('Request approved: Thesis').closest('a')).toBeNull();

        expect(readSeen(PERSON)).toBe('2026-11-27T09:00:00Z');
        await waitFor(() => expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy());
    });

    it('stays a plain bell when the service fails', async () => {
        await i18n.changeLanguage('en');
        stubFetch(() => new Response('upstream down', { status: 502 }));
        renderView(<NotificationBell person={PERSON} />);
        await waitFor(() => expect(fetch).toHaveBeenCalled());
        const bell = screen.getByRole('button', { name: 'Notifications' });
        fireEvent.click(bell);
        expect(await screen.findByText('Notifications cannot be reached right now.')).toBeTruthy();
        expect(readSeen(PERSON)).toBeNull();
    });
});
