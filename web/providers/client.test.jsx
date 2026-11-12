// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import i18n from '/i18n/index.js';
import { getGpuJob } from '@dhbw-cloud/llm-client';
import { useClient } from './client.jsx';
import { requestSession } from './request-session.js';

// The generated clients get the shared headers through their interceptors (client.jsx), the same ones helper/upload.js sends.
afterEach(() => {
    vi.unstubAllGlobals();
    requestSession.token = null;
    requestSession.actAs = null;
    requestSession.expire = () => { };
});

describe('generated clients', () => {
    it('send the token, X-Act-As and the UI language, and raise an expired session on 401', async () => {
        const seen = [];
        vi.stubGlobal('fetch', vi.fn(async (request) => {
            seen.push(request);
            return new Response(JSON.stringify({ error: 'Sitzung abgelaufen', code: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        }));
        const expire = vi.fn();
        requestSession.token = 'tok';
        requestSession.actAs = 'erika@dhbw.de';
        requestSession.expire = expire;
        await i18n.changeLanguage('en');

        // useClient is a plain lookup, no hook inside. An absolute base: Node's Request takes no relative URL.
        const client = useClient('llm');
        const res = await getGpuJob({ client, baseUrl: 'https://ai.example', path: { id: 'j-1' } });

        expect(seen[0].headers.get('Authorization')).toBe('Bearer tok');
        expect(seen[0].headers.get('X-Act-As')).toBe('erika@dhbw.de');
        expect(seen[0].headers.get('Accept-Language')).toBe('en');
        expect(expire).toHaveBeenCalledTimes(1);
        expect(res.error).toEqual({ error: 'Sitzung abgelaufen', code: 'unauthorized' });

        await i18n.changeLanguage('de');
        requestSession.token = null;
        await getGpuJob({ client, baseUrl: 'https://ai.example', path: { id: 'j-1' } });
        expect(seen[1].headers.get('Authorization')).toBeNull();
        expect(seen[1].headers.get('Accept-Language')).toBe('de');
    });
});
