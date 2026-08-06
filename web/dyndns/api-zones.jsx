import { useMemo } from 'react';
import { apiErrorMessage } from '/helper/api-error.js';
import { useClient } from '/providers/client.jsx';

// useZonesApi is to the dyndns section what useNodesApi is to projects: the one
// place that knows the transport. Every call either returns clean data or
// THROWS an Error carrying the server's message, so views never touch the
// hey-api envelope, never repeat the error extraction, and never assemble
// headers themselves.
//
// Before this, four files called `sdk.*` directly and each re-derived the error
// from the envelope inline.
//
// Returns null until the SDK module has loaded; callers render a loader.

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function unwrap(res) {
    const err = apiErrorMessage(res);
    if (err) throw new Error(err);
    return res?.data;
}

// Record operations authenticate to the DNS server with the zone's TSIG key,
// which travels in headers for reads and in the body for writes — that split is
// the API's, not ours, and this is the only place that has to know it.
const tsigHeaders = (tsigKey) => ({
    'X-DNS-Key-Name': tsigKey.keyname,
    'X-DNS-Key-Algorithm': tsigKey.algorithm,
    'X-DNS-Key': tsigKey.key,
});

const tsigBody = (tsigKey) => ({
    key_name: tsigKey.keyname,
    key_algorithm: tsigKey.algorithm,
    key: tsigKey.key,
});

export function useZonesApi() {
    const { client, sdk } = useClient('dyndns');

    return useMemo(() => {
        if (!client || !sdk) return null;

        return {
            // ── Zones ────────────────────────────────────────────────────
            listZones: async () => unwrap(await sdk.listZones({ client }))?.zones ?? [],
            getZone: async (zone) => unwrap(await sdk.getZone({ client, path: { zone } })),
            createZone: async (zone) => unwrap(await sdk.createZone({ client, path: { zone } })),
            deleteZone: async (zone) => unwrap(await sdk.deleteZone({ client, path: { zone } })),

            // Sharing operations the generated SDK does not cover, so they go
            // through the raw client. They were spelled out inline in zones.jsx
            // with their own ad-hoc status handling; the URLs belong here with
            // the rest of the transport.
            joinZone: async (zone) =>
                unwrap(await client.post({ url: '/v1/zones/{zone}/join', path: { zone } })),
            leaveZone: async (zone, owner) =>
                unwrap(await client.delete({ url: '/v1/zones/{zone}/owners/{owner}', path: { zone, owner } })),
            rotateKeys: async (zone) =>
                unwrap(await client.post({ url: '/v1/zones/{zone}/keys/rotate', path: { zone } })),
            addOwner: async (zone, email) =>
                unwrap(await client.post({ url: '/v1/zones/{zone}/owners', path: { zone }, body: { email } })),

            // ── API tokens ───────────────────────────────────────────────
            listTokens: async () => unwrap(await sdk.listTokens({ client }))?.tokens ?? [],
            // The created token is the ONLY time the server returns the secret
            // in clear text (they are stored hashed) — the caller must show it
            // straight away or it is gone.
            createToken: async ({ readOnly = false } = {}) =>
                unwrap(await sdk.createToken({
                    client, body: { read_only: readOnly }, headers: JSON_HEADERS,
                }))?.token,
            deleteToken: async (id) => unwrap(await sdk.deleteToken({ client, path: { id } })),

            // ── Policy rules ─────────────────────────────────────────────
            listPolicyRules: async () => unwrap(await sdk.listPolicyRules({ client })),
            createPolicyRule: async (body) =>
                unwrap(await sdk.createPolicyRule({ client, body, headers: JSON_HEADERS })),
            updatePolicyRule: async (id, body) =>
                unwrap(await sdk.updatePolicyRule({ client, path: { id }, body, headers: JSON_HEADERS })),
            deletePolicyRule: async (id) =>
                unwrap(await sdk.deletePolicyRule({ client, path: { id } })),

            // ── Delegations and orphaned zones (super-admin) ─────────────
            // Not in the generated SDK yet, so these use the raw client too.
            listDelegations: async () =>
                unwrap(await client.get({ url: '/v1/policies/delegations' }))?.delegations ?? [],
            createDelegation: async (body) =>
                unwrap(await client.post({ url: '/v1/policies/delegations', body })),
            updateDelegation: async (id, body) =>
                unwrap(await client.put({ url: '/v1/policies/delegations/{id}', path: { id }, body })),
            deleteDelegation: async (id) =>
                unwrap(await client.delete({ url: '/v1/policies/delegations/{id}', path: { id } })),
            listOrphanedZones: async () =>
                unwrap(await client.get({ url: '/v1/policies/orphaned-zones' })),
            deleteOrphanedZone: async (zone) =>
                unwrap(await client.delete({ url: '/v1/policies/orphaned-zones/{zone}', path: { zone } })),

            // ── DNS records ──────────────────────────────────────────────
            // No Authorization header is assembled here: the client interceptor
            // (providers/client.jsx) sets it on every request, and in BFF mode
            // the proxy injects it server-side anyway. dns-record-list.jsx used
            // to pass it a second time by hand.
            listDnsRecords: async (zone, tsigKey) =>
                unwrap(await sdk.listDnsRecords({
                    client, query: { zone }, headers: tsigHeaders(tsigKey),
                }))?.records ?? [],
            // createDnsRecord is an upsert: the API replaces the record set, so
            // editing an existing record is the same call as creating one.
            saveDnsRecord: async (zone, tsigKey, fields) =>
                unwrap(await sdk.createDnsRecord({
                    client, body: { ...fields, zone, ...tsigBody(tsigKey) }, headers: JSON_HEADERS,
                })),
            deleteDnsRecord: async (zone, tsigKey, fields) =>
                unwrap(await sdk.deleteDnsRecord({
                    client, body: { ...fields, zone, ...tsigBody(tsigKey) }, headers: JSON_HEADERS,
                })),
        };
    }, [client, sdk]);
}
