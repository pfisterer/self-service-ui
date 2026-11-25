// The notification service (pfisterer/notifications), reached through this UI's proxy under /api/notifications (Caddyfile). Plain fetch rather than a generated client: the UI calls three routes of it, and every request still carries the shared headers and reports a 401 like the generated clients do (request-session.js).
import { applyRequestHeaders, noteResponseStatus } from '/providers/request-session.js';
import { apiError } from '/helper/api-error.js';

const base = () => (window?.appconfig?.notificationsBaseUrl || '').replace(/\/+$/, '');

async function call(path, { method = 'GET', body } = {}) {
    const headers = applyRequestHeaders(new Headers());
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    const response = await fetch(base() + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' });
    noteResponseStatus(response.status);
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!response.ok) {
        // A body that is not JSON (a proxy's error page) goes on as text: apiErrorMessage never shows it, it says the service is not reachable.
        throw apiError({ error: data && typeof data === 'object' ? data : text, response });
    }
    return data;
}

export const notificationsApi = {
    getPreferences: () => call('/v1/preferences'),
    putPreferences: (prefs) => call('/v1/preferences', { method: 'PUT', body: prefs }),
    getTypes: () => call('/v1/types'),
    getRecent: (limit = 20) => call(`/v1/notifications?limit=${limit}`),
};

export const notificationsKeys = {
    preferences: () => ['notifications', 'preferences'],
    types: (lang) => ['notifications', 'types', lang],
    recent: (lang) => ['notifications', 'recent', lang],
};
