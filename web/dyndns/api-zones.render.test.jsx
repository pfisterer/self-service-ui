// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { useZonesApi } from './api-zones.jsx';

// A stand-in for the hey-api client the generated SDK calls: it records what each operation asks for and answers like a successful response, or like a refusal once `refuse` is set.
const calls = [];
let refuse = null;
const answer = async (options) => {
    calls.push(options);
    return refuse ? { error: { error: refuse }, response: { ok: false, status: 403 } } : { data: { ok: true }, response: { ok: true, status: 200 } };
};
const client = { post: vi.fn(answer), delete: vi.fn(answer) };
vi.mock('/providers/client.jsx', () => ({ useClient: () => client }));

afterEach(() => {
    cleanup();
    calls.length = 0;
    refuse = null;
    vi.clearAllMocks();
});

const api = () => renderHook(() => useZonesApi()).result.current;

// Sharing a zone with a group goes through the generated operations addZoneGroupShare and removeZoneGroupShare of @dhbw-cloud/dynamic-zones-client, with the API's paths, not through URLs written here.
describe('group shares of a zone', () => {
    it('adds a group with a JSON body', async () => {
        expect(await api().addGroupShare('wi24a.lehre.example', 'group:stg-wi#member')).toEqual({ ok: true });
        expect(client.post).toHaveBeenCalledTimes(1);
        const [options] = calls;
        expect(options.url).toBe('/v1/zones/{zone}/groups');
        expect(options.path).toEqual({ zone: 'wi24a.lehre.example' });
        expect(options.body).toEqual({ group: 'group:stg-wi#member' });
        expect(options.headers['Content-Type']).toBe('application/json');
    });

    it('removes a group by its token', async () => {
        expect(await api().removeGroupShare('wi24a.lehre.example', 'group:stg-wi#member')).toEqual({ ok: true });
        expect(client.delete).toHaveBeenCalledTimes(1);
        const [options] = calls;
        expect(options.url).toBe('/v1/zones/{zone}/groups/{group}');
        expect(options.path).toEqual({ zone: 'wi24a.lehre.example', group: 'group:stg-wi#member' });
    });

    it('throws the server message when the share is refused', async () => {
        refuse = 'sharing is not allowed for this zone';
        await expect(api().addGroupShare('wi24a.lehre.example', 'group:stg-wi')).rejects.toThrow('sharing is not allowed for this zone');
        await expect(api().removeGroupShare('wi24a.lehre.example', 'group:stg-wi')).rejects.toThrow('sharing is not allowed for this zone');
    });
});
