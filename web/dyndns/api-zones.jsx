import { useMemo } from 'react';
import { apiErrorMessage } from '/helper/api-error.js';
import { useClient } from '/providers/client.jsx';
// Named imports, not `sdk.<op>`: a property access on a namespace is still
// only wrong at runtime, while a missing named export fails the build — which
// is the whole point of depending on the client by version (see d6).
import {
    addZoneOwner, createDelegation, createDnsRecord, createPolicyRule,
    createToken, createZone, deleteDelegation, deleteDnsRecord,
    deleteOrphanedZone, deletePolicyRule, deleteToken, deleteZone, getZone,
    joinZone, listDelegations, listDnsRecords, listOrphanedZones,
    listPolicyRules, listTokens, listZones, removeZoneOwner, rotateZoneKeys,
    updateDelegation, updatePolicyRule,
} from '@dhbw-cloud/dynamic-zones-client';

// useZonesApi is to the dyndns section what useNodesApi is to projects: the one
// place that knows the transport. Every call either returns clean data or
// THROWS an Error carrying the server's message, so views never touch the
// hey-api envelope, never repeat the error extraction, and never assemble
// headers themselves.
//
// EVERY call goes through the generated SDK. Ten of these used to be hand-built
// `client.get/post/put/delete` calls with the URL and path template spelled out
// at the call site — four of them for operations the SDK already had, six for
// endpoints missing from the spec because their Go handlers carried no swagger
// annotations. Both were fixed at the source (see routes_delegation.go). When
// an operation is missing here, the fix is to annotate the handler and
// regenerate (`make bundle` in the API repo), never to reach past the SDK: a
// hand-written URL is a second, silent copy of the API contract.
//

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
    const client = useClient('dyndns');

    return useMemo(() => {

        return {
            // ── Zones ────────────────────────────────────────────────────
            listZones: async () => unwrap(await listZones({ client }))?.zones ?? [],
            getZone: async (zone) => unwrap(await getZone({ client, path: { zone } })),
            createZone: async (zone) => unwrap(await createZone({ client, path: { zone } })),
            deleteZone: async (zone) => unwrap(await deleteZone({ client, path: { zone } })),

            // Zone sharing.
            joinZone: async (zone) => unwrap(await joinZone({ client, path: { zone } })),
            leaveZone: async (zone, owner) =>
                unwrap(await removeZoneOwner({ client, path: { zone, owner } })),
            rotateKeys: async (zone) => unwrap(await rotateZoneKeys({ client, path: { zone } })),
            addOwner: async (zone, email) =>
                unwrap(await addZoneOwner({ client, path: { zone }, body: { email }, headers: JSON_HEADERS })),

            // ── API tokens ───────────────────────────────────────────────
            listTokens: async () => unwrap(await listTokens({ client }))?.tokens ?? [],
            // The created token is the ONLY time the server returns the secret
            // in clear text (they are stored hashed) — the caller must show it
            // straight away or it is gone.
            //
            // ttlHours is passed through as the API defines it: 0 (or omitted)
            // takes the configured default, -1 asks for a token that never
            // expires. Translating that here would put a second vocabulary
            // between the form and the server.
            createToken: async ({ readOnly = false, description = '', ttlHours = 0 } = {}) =>
                unwrap(await createToken({
                    client,
                    body: { read_only: readOnly, description, ttl_hours: ttlHours },
                    headers: JSON_HEADERS,
                }))?.token,
            deleteToken: async (id) => unwrap(await deleteToken({ client, path: { id } })),

            // ── Policy rules ─────────────────────────────────────────────
            listPolicyRules: async () => unwrap(await listPolicyRules({ client })),
            createPolicyRule: async (body) =>
                unwrap(await createPolicyRule({ client, body, headers: JSON_HEADERS })),
            updatePolicyRule: async (id, body) =>
                unwrap(await updatePolicyRule({ client, path: { id }, body, headers: JSON_HEADERS })),
            deletePolicyRule: async (id) =>
                unwrap(await deletePolicyRule({ client, path: { id } })),

            // ── Delegations and orphaned zones (super-admin) ─────────────
            listDelegations: async () =>
                unwrap(await listDelegations({ client }))?.delegations ?? [],
            createDelegation: async (body) =>
                unwrap(await createDelegation({ client, body, headers: JSON_HEADERS })),
            updateDelegation: async (id, body) =>
                unwrap(await updateDelegation({ client, path: { id }, body, headers: JSON_HEADERS })),
            deleteDelegation: async (id) =>
                unwrap(await deleteDelegation({ client, path: { id } })),
            listOrphanedZones: async () =>
                unwrap(await listOrphanedZones({ client }))?.zones ?? [],
            deleteOrphanedZone: async (zone) =>
                unwrap(await deleteOrphanedZone({ client, path: { zone } })),

            // ── DNS records ──────────────────────────────────────────────
            // No Authorization header is assembled here: the client interceptor
            // (providers/client.jsx) sets it on every request, and in BFF mode
            // the proxy injects it server-side anyway. dns-record-list.jsx used
            // to pass it a second time by hand.
            listDnsRecords: async (zone, tsigKey) =>
                unwrap(await listDnsRecords({
                    client, query: { zone }, headers: tsigHeaders(tsigKey),
                }))?.records ?? [],
            // createDnsRecord is an upsert: the API replaces the record set, so
            // editing an existing record is the same call as creating one.
            saveDnsRecord: async (zone, tsigKey, fields) =>
                unwrap(await createDnsRecord({
                    client, body: { ...fields, zone, ...tsigBody(tsigKey) }, headers: JSON_HEADERS,
                })),
            deleteDnsRecord: async (zone, tsigKey, fields) =>
                unwrap(await deleteDnsRecord({
                    client, body: { ...fields, zone, ...tsigBody(tsigKey) }, headers: JSON_HEADERS,
                })),
        };
    }, [client]);
}
