import { useState, useEffect } from 'preact/hooks';
import { html } from 'htm/preact';
import { useAuth, authHeaders } from '/providers/auth.js';
import { generateNsUpdate } from './dns-update-cmd.js';
import { useDynDnsClient } from '/providers/dyndns-client.js';
import { useDynDnsConfig } from '/providers/dyndns-config.js';

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
    const { client, sdk, } = useDynDnsClient();

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
        if (!confirm(`Delete DNS record ${fields.name}?`)) return;
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
        <tr>
            <td>
                <input class="input" value=${fields.name} onInput=${e => setFields({ ...fields, name: e.target.value })} disabled=${loading || !editing || !isEditable} /> 
            </td>
            <td>
                ${editing && isEditable ? html`
                <div class="select">
                    <select value=${fields.type} onChange=${e => setFields({ ...fields, type: e.target.value })} > ${SUPPORTED_TYPES.map(t => html`<option value=${t}>${t}</option>`)}
                    </select>
                </div>
                ` : html`<input class="input" value=${fields.type} disabled=${true} />
                `}
            </td>
            <td>
                <input class="input" type="number" value=${fields.ttl} onInput=${e => setFields({ ...fields, ttl: e.target.value })} disabled=${loading || !editing || !isEditable} />
            </td>
            <td>
                <input class="input" value=${fields.value} onInput=${e => setFields({ ...fields, value: e.target.value })} disabled=${loading || !editing || !isEditable} />
            </td>
            <td>
                ${editing && isEditable ? html`
                <button class="button is-success" onClick=${handleUpdate} disabled=${loading}>${loading ? "Saving..." : "Save"} </button>
                ` : html`
                <button class="button" onClick=${() => isEditable && setEditing(true)} disabled=${loading || !isEditable}> Edit </button> `}
                <button class="button is-danger ml-1" onClick=${handleDelete} disabled=${loading || !isEditable} >
                ${loading ? "Deleting..." : "Delete"}
                </button>

                <button class="button ml-1" onClick=${handleCopy}>Copy nsupdate</button>

                ${error && html`<div class="has-text-danger">${error.message}</div>`}
            </td>
            </tr>
    `;
}

export function AddDnsRecordRow({ zone, tsigKey, onAdd }) {
    const { user } = useAuth();
    const [fields, setFields] = useState({ name: '', type: 'A', ttl: 300, value: '' });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const { client, sdk } = useDynDnsClient();

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
        <tr>
            <td><input class="input" placeholder="Name" value=${fields.name} onInput=${e => setFields({ ...fields, name: e.target.value })} /></td>
            <td>
            <div class="select">
                <select value=${fields.type} onChange=${e => setFields({ ...fields, type: e.target.value })} >
                ${SUPPORTED_TYPES.map(t => html`<option value=${t}>${t}</option>`)}
                </select>
            </div>
            </td>            
            <td><input class="input" type="number" value=${fields.ttl} onInput=${e => setFields({ ...fields, ttl: e.target.value })} /></td>
            <td><input class="input" value=${fields.value} onInput=${e => setFields({ ...fields, value: e.target.value })} /></td>
            <td>
                <button class="button is-primary" onClick=${handleAdd} disabled=${loading}>${loading ? 'Adding...' : 'Add'}</button>
                ${error && html`<div class="has-text-danger">${error.message}</div>`}
            </td>
        </tr>
    `;
}


export function DnsRecordsList({ zone, tsigKey }) {
    const { user } = useAuth();
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const { client, sdk } = useDynDnsClient();

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

    if (loading) return html`<p>Loading DNS records...</p>`;
    if (error) return html`<div class="has-text-danger">Error loading DNS records: ${error.message}</div>`;

    return html`
        <table class="table is-fullwidth is-striped">
            <thead>
                <tr>
                    <th>Name</th><th>Type</th><th>TTL</th><th>Value</th><th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${records.map(record => html`<${DnsRecordRow} zone=${zone} tsigKey=${tsigKey} record=${record} onChange=${fetchRecords} />`)}
                <${AddDnsRecordRow} zone=${zone} tsigKey=${tsigKey} onAdd=${fetchRecords} />
            </tbody>
        </table>
    `;
}
