import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requestSession } from '/providers/request-session.js';
import { isAbort, progressOf, upload, uploadUrl } from './upload.js';

// A stand-in for XMLHttpRequest: records what upload() set, and lets a test play the network's part (progress, an answer, a dropped connection).
class FakeXHR {
    static last = null;
    constructor() {
        this.headers = {};
        this.upload = {};
        this.status = 0;
        this.statusText = '';
        this.responseText = '';
        this.responseHeaders = {};
        this.aborted = false;
        FakeXHR.last = this;
    }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(name, value) { this.headers[name] = value; }
    getResponseHeader(name) { return this.responseHeaders[name.toLowerCase()] ?? null; }
    send(body) { this.body = body; }
    abort() { this.aborted = true; this.onabort?.(); }
    progress(loaded, total, lengthComputable = true) { this.upload.onprogress?.({ loaded, total, lengthComputable }); }
    respond(status, body = '', { contentType = 'application/json', statusText = '' } = {}) {
        this.status = status;
        this.statusText = statusText;
        this.responseText = typeof body === 'string' ? body : JSON.stringify(body);
        this.responseHeaders = contentType ? { 'content-type': contentType } : {};
        this.onload?.();
    }
    fail() { this.onerror?.(); }
}

const client = { getConfig: () => ({ baseUrl: 'https://ai.example' }) };
const file = () => new Blob(['x'.repeat(1000)]);

beforeEach(() => {
    vi.stubGlobal('XMLHttpRequest', FakeXHR);
    FakeXHR.last = null;
    requestSession.token = null;
    requestSession.actAs = null;
    requestSession.useDummyAuth = false;
    requestSession.expire = () => { };
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('uploadUrl', () => {
    it('joins base, path and query like the generated clients', () => {
        expect(uploadUrl({ client, url: '/v1/gpu/files', query: { project: 'p 1', path: 'a/b c.py', none: undefined, nil: null } }))
            .toBe('https://ai.example/v1/gpu/files?project=p%201&path=a%2Fb%20c.py');
        expect(uploadUrl({ baseUrl: 'https://x.example/', url: '/v1/f', query: { tag: ['a', 'b'] } })).toBe('https://x.example/v1/f?tag=a&tag=b');
        expect(uploadUrl({ url: '/v1/f' })).toBe('/v1/f');
    });
});

describe('progressOf', () => {
    it('reads percent, speed and time left', () => {
        expect(progressOf(250, 1000, 1000)).toEqual({ loaded: 250, total: 1000, percent: 25, bytesPerSec: 250, etaSec: 3 });
        expect(progressOf(0, 1000, 0)).toEqual({ loaded: 0, total: 1000, percent: 0, bytesPerSec: 0, etaSec: null });
        expect(progressOf(10, 0, 100).percent).toBe(0);
    });
});

describe('upload', () => {
    it('sends the body with the method, octet-stream and the shared headers, and resolves with the parsed answer', async () => {
        requestSession.token = 'tok';
        requestSession.actAs = 'erika@dhbw.de';
        const onDone = vi.fn();
        const body = file();
        const p = upload({ client, url: '/v1/gpu/files', query: { project: 'p', path: 'a.py' }, body, headers: { 'X-Extra': '1' }, onDone });
        const xhr = FakeXHR.last;
        expect(xhr.method).toBe('PUT');
        expect(xhr.url).toBe('https://ai.example/v1/gpu/files?project=p&path=a.py');
        expect(xhr.body).toBe(body);
        expect(xhr.withCredentials).toBe(false);
        expect(xhr.headers).toEqual({
            'X-Extra': '1',
            'Content-Type': 'application/octet-stream',
            Authorization: 'Bearer tok',
            'X-Act-As': 'erika@dhbw.de',
        });
        xhr.respond(200, { name: 'a.py', path: 'a.py', size: 1000 });
        await expect(p).resolves.toEqual({ name: 'a.py', path: 'a.py', size: 1000 });
        expect(onDone).toHaveBeenCalledWith({ name: 'a.py', path: 'a.py', size: 1000 });
    });

    it('sends no Authorization and no X-Act-As in BFF mode without acting', async () => {
        const p = upload({ baseUrl: '', url: '/v1/f', method: 'POST', body: file() });
        const xhr = FakeXHR.last;
        expect(xhr.method).toBe('POST');
        expect(xhr.headers).toEqual({ 'Content-Type': 'application/octet-stream' });
        xhr.respond(204, '');
        await expect(p).resolves.toEqual({});
    });

    it('leaves the Content-Type of FormData to the browser and keeps a given one for a Blob', async () => {
        const form = new FormData();
        form.append('f', file(), 'f.bin');
        upload({ url: '/a', method: 'POST', body: form, headers: { 'Content-Type': 'application/json' } });
        expect(FakeXHR.last.headers['Content-Type']).toBeUndefined();
        upload({ url: '/a', body: file(), headers: { 'content-type': 'text/csv' } });
        expect(FakeXHR.last.headers).toMatchObject({ 'content-type': 'text/csv' });
        expect(FakeXHR.last.headers['Content-Type']).toBeUndefined();
    });

    it('reports progress with speed and time left', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-11-12T10:00:00Z'));
        const seen = [];
        const p = upload({ url: '/a', body: file(), onProgress: (e) => seen.push(e) });
        const xhr = FakeXHR.last;
        vi.setSystemTime(new Date('2026-11-12T10:00:02Z'));
        xhr.progress(400, 1000);
        vi.setSystemTime(new Date('2026-11-12T10:00:04Z'));
        xhr.progress(800, 0, false); // no length: the body's size stands in
        xhr.respond(200, '{}');
        await p;
        expect(seen[0]).toEqual({ loaded: 400, total: 1000, percent: 40, bytesPerSec: 200, etaSec: 3 });
        expect(seen[1]).toEqual({ loaded: 800, total: 1000, percent: 80, bytesPerSec: 200, etaSec: 1 });
        expect(seen.at(-1)).toMatchObject({ loaded: 1000, total: 1000, percent: 100, etaSec: 0 });
    });

    it('cancels through the signal with an AbortError', async () => {
        const controller = new AbortController();
        const onError = vi.fn();
        const p = upload({ url: '/a', body: file(), signal: controller.signal, onError });
        controller.abort();
        expect(FakeXHR.last.aborted).toBe(true);
        const err = await p.catch(e => e);
        expect(isAbort(err)).toBe(true);
        expect(onError).toHaveBeenCalledWith(err);
    });

    it('does not start with a signal that is already aborted', async () => {
        const controller = new AbortController();
        controller.abort();
        const err = await upload({ url: '/a', body: file(), signal: controller.signal }).catch(e => e);
        expect(isAbort(err)).toBe(true);
        expect(FakeXHR.last).toBeNull();
    });

    it('fails like a facade: message from the body, status, code and body', async () => {
        const onError = vi.fn();
        const p = upload({ url: '/a', body: file(), onError });
        FakeXHR.last.respond(409, { error: 'Der Ordner ist schreibgeschützt.', code: 'read_only' }, { statusText: 'Conflict' });
        const err = await p.catch(e => e);
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('Der Ordner ist schreibgeschützt.');
        expect(err.status).toBe(409);
        expect(err.code).toBe('read_only');
        expect(err.body).toEqual({ error: 'Der Ordner ist schreibgeschützt.', code: 'read_only' });
        expect(onError).toHaveBeenCalledWith(err);
    });

    it('reads a body that is not JSON as the message, and an empty one as the status text', async () => {
        let p = upload({ url: '/a', body: file() });
        FakeXHR.last.respond(502, '<html>Bad Gateway</html>', { contentType: 'text/html', statusText: 'Bad Gateway' });
        let err = await p.catch(e => e);
        expect(err.message).toBe('<html>Bad Gateway</html>');
        expect(err.status).toBe(502);
        expect(err.code).toBeUndefined();

        p = upload({ url: '/a', body: file() });
        FakeXHR.last.respond(413, '', { contentType: null, statusText: 'Payload Too Large' });
        err = await p.catch(e => e);
        expect(err.message).toBe('Payload Too Large');
        expect(err.status).toBe(413);
    });

    it('fails a dropped connection as fetch does', async () => {
        const p = upload({ url: '/a', body: file() });
        FakeXHR.last.fail();
        const err = await p.catch(e => e);
        expect(err.message).toBe('Failed to fetch');
        expect(err.status).toBeUndefined();
        expect(isAbort(err)).toBe(false);
    });

    it('raises an expired session on 401, but not in dummy mode', async () => {
        const expire = vi.fn();
        requestSession.expire = expire;
        let p = upload({ url: '/a', body: file() });
        FakeXHR.last.respond(401, { error: 'unauthorized' });
        await p.catch(() => { });
        expect(expire).toHaveBeenCalledTimes(1);

        requestSession.useDummyAuth = true;
        p = upload({ url: '/a', body: file() });
        FakeXHR.last.respond(401, { error: 'unauthorized' });
        await p.catch(() => { });
        expect(expire).toHaveBeenCalledTimes(1);
    });
});
