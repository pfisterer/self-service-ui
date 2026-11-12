import { describe, it, expect, vi, beforeEach } from 'vitest';
import i18n from '/i18n/index.js';
import { applyRequestHeaders, noteResponseStatus, requestHeaders, requestSession } from './request-session.js';

beforeEach(async () => {
    requestSession.token = null;
    requestSession.actAs = null;
    requestSession.useDummyAuth = false;
    requestSession.expire = () => { };
    await i18n.changeLanguage('de');
});

describe('requestHeaders', () => {
    it('carries the UI language and follows a switch at runtime', async () => {
        expect(requestHeaders()).toEqual({ 'Accept-Language': 'de' });
        await i18n.changeLanguage('en');
        expect(requestHeaders()).toEqual({ 'Accept-Language': 'en' });
        // A regional variant from the browser is read as the language the UI speaks.
        await i18n.changeLanguage('de-DE');
        expect(requestHeaders()['Accept-Language']).toBe('de');
    });

    it('adds the token pre-BFF and X-Act-As while acting for somebody', () => {
        requestSession.token = 'tok';
        requestSession.actAs = 'erika@dhbw.de';
        expect(requestHeaders()).toEqual({ Authorization: 'Bearer tok', 'X-Act-As': 'erika@dhbw.de', 'Accept-Language': 'de' });
    });
});

describe('applyRequestHeaders', () => {
    it('sets the headers on a Headers object and drops an Authorization without a token', () => {
        const h = new Headers({ Authorization: 'Bearer stale', 'Content-Type': 'application/json' });
        applyRequestHeaders(h);
        expect(h.get('Authorization')).toBeNull();
        expect(h.get('Content-Type')).toBe('application/json');
        expect(h.get('Accept-Language')).toBe('de');

        requestSession.token = 'tok';
        requestSession.actAs = 'erika@dhbw.de';
        applyRequestHeaders(h);
        expect(h.get('Authorization')).toBe('Bearer tok');
        expect(h.get('X-Act-As')).toBe('erika@dhbw.de');
    });
});

describe('noteResponseStatus', () => {
    it('expires the session on 401 only, and not in dummy mode', () => {
        const expire = vi.fn();
        requestSession.expire = expire;
        noteResponseStatus(200);
        noteResponseStatus(403);
        expect(expire).not.toHaveBeenCalled();
        noteResponseStatus(401);
        expect(expire).toHaveBeenCalledTimes(1);
        requestSession.useDummyAuth = true;
        noteResponseStatus(401);
        expect(expire).toHaveBeenCalledTimes(1);
    });
});
