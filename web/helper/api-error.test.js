import { describe, it, expect } from 'vitest';
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

    it('stringifies an error that carries none of the known keys', () => {
        expect(apiErrorMessage({ error: 'plain string' })).toBe('plain string');
    });

    // A non-2xx whose body is not the usual JSON — a proxy's HTML page, an
    // empty 502 — leaves `error` unset. Without this branch the UI reported
    // success and quietly did nothing.
    it('falls back to the response when the body carried no error', () => {
        expect(apiErrorMessage({ response: { ok: false, status: 502, statusText: 'Bad Gateway' } }))
            .toBe('Bad Gateway');
        expect(apiErrorMessage({ response: { ok: false, status: 502, statusText: '' } }))
            .toBe('HTTP 502');
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
