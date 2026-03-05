import { useState, useEffect } from 'preact/hooks';
import { html } from 'htm/preact';
import { useAuth, authHeaders } from '/providers/auth.js';
import { generateNsUpdate } from './dns-update-cmd.js';
import { useClient } from '/providers/client.js';
import { useDynDnsConfig } from '/providers/dyndns-config.js';
import { Table, TextInput, Select, Button, Group, Alert, Loader, Stack, Text } from '@mantine/core';
import { AlertCircle, Copy, Check } from 'lucide-preact';

function normalizeRecordName(name, zone) {
    if (!name) return '';
    let trimmedName = name.trim();

    // 1. Handle Zone Apex (Crucial for user input)
    // Send '@' if the input is '@' or the escaped '\@'.
    if (trimmedName === '@' || trimmedName === '\\@') {
        return '@';
    }

    // 2. Remove any trailing dot (CRITICAL FIX for server-side double-dot issue)
    // Prevents sending 'karls.' which leads to 'karls..zone.com.' on the server.
    // Use a loop/regex for robust removal in case of multiple trailing dots, though simple replace is usually enough.
    trimmedName = trimmedName.replace(/\.+$/, '');

    // 3. Fallback check for the zone name itself (often treated as apex)
    // If the stripped name is now equivalent to the zone name (minus the final dot), 
    // it's safest to treat it as the apex.
    if (trimmedName === zone.replace(/\.$/, '')) {
        return '@';
    }

    // 4. Pass the clean relative name to the backend.
    return trimmedName;
}

/**
 * Strips the zone name from the fully qualified record name for display.
 * Handles the special case of the zone apex ('@') record.
 * @param {string} recordName - The fully qualified record name (e.g., 'www.example.com.')
 * @param {string} zoneName - The zone name (e.g., 'example.com.')
 * @returns {string} The relative name (e.g., 'www' or '@')
 */
function stripZone(recordName, zoneName) {
    // Ensure both names end with a dot for consistent comparison
    const fqdnRecord = recordName.endsWith('.') ? recordName : recordName + '.';
    const fqdnZone = zoneName.endsWith('.') ? zoneName : zoneName + '.';

    // Check for the apex record case (Name is exactly the Zone)
    if (fqdnRecord === fqdnZone) {
        return '@'; // Conventionally represents the zone apex
    }

    // Strip the zone name from the end
    if (fqdnRecord.endsWith(fqdnZone)) {
        // Remove the zone name and the dot preceding it (e.g., remove '.example.com.')
        const relativeName = fqdnRecord.slice(0, -(fqdnZone.length + 1));

        // Final trim for safety, though slice should handle it
        return relativeName.replace(/\.$/, '');
    }

    // Fallback: Return the original name if stripping failed (e.g., if it was already relative)
    return recordName;
}



// ----------------------------------------
// DNS Records Management
// ----------------------------------------
const SUPPORTED_TYPES = ["A", "AAAA"];


export function DnsRecordRow({ zone, tsigKey, record, onChange }) {
    const { config: dynDnsConfig } = useDynDnsConfig();
    const { client, sdk, } = useClient('dyndns');

    const [editing, setEditing] = useState(false);
    const [fields, setFields] = useState({ ...record });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const isEditable = SUPPORTED_TYPES.includes(record.type.toUpperCase());

    async function handleUpdate() {
        setLoading(true);
        setError(null);
        try {
            const normalizedName = normalizeRecordName(fields.name, zone);

            const createRes = await sdk.postV1DnsRecordsCreate({
                client,
                body: {
                    ...fields,
                    name: normalizedName,
                    zone,
                    key_name: tsigKey.keyname,
                    key_algorithm: tsigKey.algorithm,
                    key: tsigKey.key
                }
            });

            if (!createRes.response.ok) throw new Error(createRes.response.statusText);

            setEditing(false);
            onChange();
        } catch (e) {
            setError(e);
        } finally {
            setLoading(false);
        }
    }


    async function handleDelete() {
        setLoading(true);
        setError(null);
        try {
            const normalizedName = normalizeRecordName(fields.name, zone);

            const res = await sdk.postV1DnsRecordsDelete({
                client,
                body: {
                    ...fields,
                    name: normalizedName,
                    zone,
                    key_name: tsigKey.keyname,
                    key_algorithm: tsigKey.algorithm,
                    key: tsigKey.key
                }
            });
            if (!res.response.ok) throw new Error(res.response.statusText);
            onChange();
        } catch (e) {
            setError(e);
        } finally {
            setLoading(false);
        }
    }

    async function handleCopy() {
        const nsupdate = generateNsUpdate(fields, zone, tsigKey, dynDnsConfig);
        try {
            await navigator.clipboard.writeText(nsupdate);
            alert('nsupdate command copied!');
        } catch {
            alert('Failed to copy.');
        }
    }

    return html`
        <${Table.Tr}>
            <${Table.Td}>
                <${TextInput} value=${fields.name} onInput=${e => setFields({ ...fields, name: e.target.value })} disabled=${loading || !editing || !isEditable} />
            <//>
            <${Table.Td}>
                ${editing && isEditable ? html`
                    <${Select} 
                        data=${SUPPORTED_TYPES.map(t => ({ value: t, label: t }))}
                        value=${fields.type} 
                        onChange=${e => setFields({ ...fields, type: e })} 
                    />
                ` : html`
                    <${TextInput} value=${fields.type} disabled />
                `}
            <//>
            <${Table.Td}>
                <${TextInput} type="number" value=${fields.ttl} onInput=${e => setFields({ ...fields, ttl: e.target.value })} disabled=${loading || !editing || !isEditable} />
            <//>
            <${Table.Td}>
                <${TextInput} value=${fields.value} onInput=${e => setFields({ ...fields, value: e.target.value })} disabled=${loading || !editing || !isEditable} />
            <//>
            <${Table.Td}>
                <${Stack} gap="xs">
                    <${Group} gap="xs">
                        ${editing && isEditable ? html`
                            <${Button} color="green" size="xs" onClick=${handleUpdate} disabled=${loading}>${loading ? "Saving..." : "Save"}<//>
                        ` : html`
                            <${Button} size="xs" onClick=${() => isEditable && setEditing(true)} disabled=${loading || !isEditable}>Edit<//>
                        `}
                        <${Button} color="red" size="xs" onClick=${handleDelete} disabled=${loading || !isEditable}>
                            ${loading ? "Deleting..." : "Delete"}
                        <//>
                        <${Button} size="xs" variant="light" onClick=${handleCopy}>Copy nsupdate<//>
                    <//>
                    ${error && html`<${Alert} icon=${html`<${AlertCircle} size="16" />`} title="Error" color="red">${error.message}</alert>`}
                <//>
            <//>
        <//>
    `;
}

export function AddDnsRecordRow({ zone, tsigKey, onAdd }) {
    const { user } = useAuth();
    const [fields, setFields] = useState({ name: '', type: 'A', ttl: 300, value: '' });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const { client, sdk } = useClient('dyndns');

    async function handleAdd() {
        setLoading(true);
        setError(null);
        try {
            const res = await sdk.postV1DnsRecordsCreate({
                client,
                body: {
                    ...fields,
                    zone,
                    name: normalizeRecordName(fields.name, zone),
                    key_name: tsigKey.keyname,
                    key_algorithm: tsigKey.algorithm,
                    key: tsigKey.key
                }
            });
            if (!res.response.ok) throw new Error(res.response.statusText);
            setFields({ name: '', type: 'A', ttl: 300, value: '' });
            onAdd();
        } catch (e) {
            setError(e);
        } finally {
            setLoading(false);
        }
    }

    return html`
        <${Table.Tr}>
            <${Table.Td}>
                <${TextInput} placeholder="Name" value=${fields.name} onInput=${e => setFields({ ...fields, name: e.target.value })} />
            <//>
            <${Table.Td}>
                <${Select} 
                    data=${SUPPORTED_TYPES.map(t => ({ value: t, label: t }))}
                    value=${fields.type} 
                    onChange=${e => setFields({ ...fields, type: e })} 
                />
            <//>
            <${Table.Td}>
                <${TextInput} type="number" value=${fields.ttl} onInput=${e => setFields({ ...fields, ttl: e.target.value })} />
            <//>
            <${Table.Td}>
                <${TextInput} value=${fields.value} onInput=${e => setFields({ ...fields, value: e.target.value })} />
            <//>
            <${Table.Td}>
                <${Stack} gap="xs">
                    <${Button} color="blue" size="xs" onClick=${handleAdd} disabled=${loading}>${loading ? 'Adding...' : 'Add'}<//>
                    ${error && html`<${Alert} icon=${html`<${AlertCircle} size="16" />`} title="Error" color="red">${error.message}</alert>`}
                <//>
            <//>
        <//>
    `;
}

export function DnsRecordsList({ zone, tsigKey }) {
    const { user } = useAuth();
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const { client, sdk } = useClient('dyndns');

    async function fetchRecords() {
        setLoading(true);
        setError(null);
        try {
            const res = await sdk.getV1DnsRecords({
                client,
                query: { zone },
                headers: {
                    ...authHeaders(user),
                    "X-DNS-Key-Name": tsigKey.keyname,
                    "X-DNS-Key-Algorithm": tsigKey.algorithm,
                    "X-DNS-Key": tsigKey.key,
                }
            });
            if (!res.data) throw new Error('No records found');

            const strippedRecords = res.data.records.map(record => ({
                ...record,
                name: stripZone(record.name, zone)
            }));

            setRecords(strippedRecords);
        } catch (e) {
            setError(e);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { fetchRecords(); }, []);

    if (loading) return html`<${Loader} size="sm" />`;
    if (error) return html`<${Alert} icon=${html`<${AlertCircle} size="16" />`} title="Error" color="red">Error loading DNS records: ${error.message}</alert>`;

    return html`
        <${Table} striped highlightOnHover>
            <${Table.Thead}>
                <${Table.Tr}>
                    <${Table.Th}>Name<//>
                    <${Table.Th}>Type<//>
                    <${Table.Th}>TTL<//>
                    <${Table.Th}>Value<//>
                    <${Table.Th}>Actions<//>
                <//>
            <//>
            <${Table.Tbody}>
                ${records.map(record => html`<${DnsRecordRow} zone=${zone} tsigKey=${tsigKey} record=${record} onChange=${fetchRecords} />`)}
                <${AddDnsRecordRow} zone=${zone} tsigKey=${tsigKey} onAdd=${fetchRecords} />
            <//>
        <//>
    `;
}
