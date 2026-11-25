import { describe, it, expect } from 'vitest';
import i18n from '/i18n/index.js';
import { apiError, apiErrorMessage, CONFLICT, formatError } from './api-error.js';

describe('apiErrorMessage', () => {
    it('returns null when the call succeeded', () => {
        expect(apiErrorMessage({ data: { ok: true }, response: { ok: true, status: 200 } })).toBeNull();
        expect(apiErrorMessage(undefined)).toBeNull();
    });

    // The precedence is the reason this module exists: six copies had drifted
    // into two different orders, so the same response read differently
    // depending on which file handled it. `error` wins because that is the
    // field both Go APIs actually send.
    it('prefers error over detail and message', () => {
        expect(apiErrorMessage({ error: { error: 'from error', detail: 'from detail', message: 'from message' } }))
            .toBe('from error');
        expect(apiErrorMessage({ error: { detail: 'from detail', message: 'from message' } }))
            .toBe('from detail');
        expect(apiErrorMessage({ error: { message: 'from message' } }))
            .toBe('from message');
    });

    // A body that is not JSON is never shown (a proxy's HTML page while a backend restarts, an empty 502): a neutral sentence with the status and the request ID instead (bug of 25.11.2026, the estimator showed the BFF's 502 page as text).
    it('never shows a body that is not JSON', () => {
        const page = '<!doctype html><html><body><h1>Portal gerade nicht erreichbar</h1><p>Statuscode 502</p><p>There was a problem connecting to the upstream server.</p><p>Request ID: 3e39eda0-63f1-41aa-adcd-cc970a1df924</p></body></html>';
        const msg = apiErrorMessage({ error: page, response: { ok: false, status: 502, statusText: 'Bad Gateway' } });
        expect(msg).toBe(`${i18n.t('helper.apiError.unavailable')} (${i18n.t('helper.apiError.status', { status: 502 })}, ${i18n.t('helper.apiError.requestId', { id: '3e39eda0-63f1-41aa-adcd-cc970a1df924' })})`);
        expect(msg).not.toMatch(/<|upstream/);
        expect(apiErrorMessage({ error: 'plain string' })).toBe(i18n.t('helper.apiError.unavailable'));
    });

    it('takes the request ID from a response header first', () => {
        const headers = new Headers({ 'X-Request-Id': 'abc-123' });
        expect(apiErrorMessage({ error: '', response: { ok: false, status: 503, headers } })).toContain('abc-123');
    });

    // A non-2xx without a body must not read as success.
    it('falls back to the response when the body carried no error', () => {
        expect(apiErrorMessage({ response: { ok: false, status: 502, statusText: 'Bad Gateway' } }))
            .toBe(`${i18n.t('helper.apiError.unavailable')} (${i18n.t('helper.apiError.status', { status: 502 })})`);
        expect(apiErrorMessage({ error: '', response: { ok: false, status: 502 } })).toContain('502');
    });

    it('keeps the message of a thrown error and of a JSON body without the known keys', () => {
        expect(apiErrorMessage({ error: new TypeError('Failed to fetch') })).toBe('Failed to fetch');
        expect(apiErrorMessage({ error: { foo: 1 }, response: { ok: false, status: 500 } })).toContain('500');
    });

    it('does not treat an empty error field as a failure', () => {
        expect(apiErrorMessage({ error: null, response: { ok: true, status: 204 } })).toBeNull();
    });
});

describe('apiError', () => {
    it('carries the HTTP status alongside the message', () => {
        const err = apiError({ error: { error: 'stale' }, response: { ok: false, status: CONFLICT } });
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('stale');
        // 409 is what lets a caller tell "the world moved on" from "your input
        // is wrong"; without the status every failure reads as a validation error.
        expect(err.status).toBe(409);
    });

    it('carries the code and the body of a refusal, not of a thrown error or a text', () => {
        const err = apiError({ error: { error: 'Nur lesen', code: 'read_only' }, response: { ok: false, status: 403 } });
        expect(err.code).toBe('read_only');
        expect(err.body).toEqual({ error: 'Nur lesen', code: 'read_only' });
        expect(apiError({ error: new TypeError('Failed to fetch') }).body).toBeUndefined();
        expect(apiError({ error: 'Bad Gateway', response: { ok: false, status: 502 } }).code).toBeUndefined();
    });

    it('falls back to a generic message rather than throwing null', () => {
        const err = apiError({});
        expect(err.message).toBe('Request failed');
        expect(err.status).toBeUndefined();
    });
});

describe('formatError', () => {
    it('reads a thrown Error', () => {
        expect(formatError(new Error('boom'))).toBe('boom');
    });

    it('stringifies anything else', () => {
        expect(formatError('boom')).toBe('boom');
        expect(formatError(undefined)).toBe('undefined');
    });
});
