import { useState, useEffect } from 'react';
import { useAuth, authHeaders } from '/providers/auth.jsx';
import { generateNsUpdate, generateDig } from './dns-update-cmd.jsx';
import { useClient } from '/providers/client.jsx';
import { useDynDnsConfig } from '/providers/dyndns-config.jsx';
import { useErrorModal } from '/providers/error-modal.jsx';
import { Table, TextInput, Select, Button, Group, Alert, Loader, Stack, Text } from '@mantine/core';
import { AlertCircle, Copy, Check } from 'lucide-react';

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
const sdkError = (res) => res?.error?.detail ?? res?.error?.error ?? res?.error?.message ?? (res?.error ? String(res.error) : null);

const SUPPORTED_TYPES = ["A", "AAAA"];


export function DnsRecordRow({ zone, tsigKey, record, onChange }) {
    const { config: dynDnsConfig } = useDynDnsConfig();
    const { client, sdk, } = useClient('dyndns');
    const { showError } = useErrorModal();

    const [editing, setEditing] = useState(false);
    const [fields, setFields] = useState({ ...record });
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(null); // which copy button briefly shows "Copied…"

    const isEditable = SUPPORTED_TYPES.includes(record.type.toUpperCase());

    async function handleUpdate() {
        setLoading(true);
        const normalizedName = normalizeRecordName(fields.name, zone);
        const res = await sdk.createDnsRecord({
            client,
            body: { ...fields, name: normalizedName, zone, key_name: tsigKey.keyname, key_algorithm: tsigKey.algorithm, key: tsigKey.key }
        });
        const err = sdkError(res) ?? (!res.response.ok ? res.response.statusText : null);
        if (err) { showError(err); } else { setEditing(false); onChange(); }
        setLoading(false);
    }

    async function handleDelete() {
        setLoading(true);
        const normalizedName = normalizeRecordName(fields.name, zone);
        const res = await sdk.deleteDnsRecord({
            client,
            body: { ...fields, name: normalizedName, zone, key_name: tsigKey.keyname, key_algorithm: tsigKey.algorithm, key: tsigKey.key }
        });
        const err = sdkError(res) ?? (!res.response.ok ? res.response.statusText : null);
        if (err) { showError(err); } else { onChange(); }
        setLoading(false);
    }

    // Copy to clipboard and briefly flip the button label to "Copied…" (~1s)
    // instead of showing a blocking alert.
    async function copyToClipboard(text, which) {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(which);
            setTimeout(() => setCopied(c => (c === which ? null : c)), 1000);
        } catch { /* clipboard unavailable — no-op */ }
    }

    const handleCopy = () => copyToClipboard(generateNsUpdate(fields, zone, tsigKey, dynDnsConfig), 'nsupdate');
    const handleCopyDig = () => copyToClipboard(generateDig(fields, zone, dynDnsConfig), 'dig');

    return (
        <Table.Tr>
            <Table.Td>
                <TextInput value={fields.name} onInput={e => setFields({ ...fields, name: e.target.value })} disabled={loading || !editing || !isEditable} />
            </Table.Td>
            <Table.Td>
                {editing && isEditable ? (
                    <Select
                        data={SUPPORTED_TYPES.map(t => ({ value: t, label: t }))}
                        value={fields.type}
                        onChange={e => setFields({ ...fields, type: e })}
                    />
                ) : (
                    <TextInput value={fields.type} disabled />
                )}
            </Table.Td>
            <Table.Td>
                <TextInput type="number" value={fields.ttl} onInput={e => setFields({ ...fields, ttl: e.target.value })} disabled={loading || !editing || !isEditable} />
            </Table.Td>
            <Table.Td>
                <TextInput value={fields.value} onInput={e => setFields({ ...fields, value: e.target.value })} disabled={loading || !editing || !isEditable} />
            </Table.Td>
            <Table.Td>
                <Stack gap="xs">
                    <Group gap="xs">
                        {editing && isEditable ? (
                            <Button color="green" size="xs" onClick={handleUpdate} disabled={loading}>{loading ? "Saving..." : "Save"}</Button>
                        ) : (
                            <Button size="xs" onClick={() => isEditable && setEditing(true)} disabled={loading || !isEditable}>Edit</Button>
                        )}
                        <Button color="red" size="xs" onClick={handleDelete} disabled={loading || !isEditable}>
                            {loading ? "Deleting..." : "Delete"}
                        </Button>
                        <Button size="xs" variant="light" onClick={handleCopy}>{copied === 'nsupdate' ? 'Copied…' : 'Copy nsupdate'}</Button>
                        <Button size="xs" variant="light" onClick={handleCopyDig}>{copied === 'dig' ? 'Copied…' : 'Copy dig'}</Button>
                    </Group>
                </Stack>
            </Table.Td>
        </Table.Tr>
    );
}

export function AddDnsRecordRow({ zone, tsigKey, onAdd }) {
    const { user } = useAuth();
    const [fields, setFields] = useState({ name: '', type: 'A', ttl: 300, value: '' });
    const [loading, setLoading] = useState(false);
    const { client, sdk } = useClient('dyndns');
    const { showError } = useErrorModal();

    async function handleAdd() {
        setLoading(true);
        const res = await sdk.createDnsRecord({
            client,
            body: { ...fields, zone, name: normalizeRecordName(fields.name, zone), key_name: tsigKey.keyname, key_algorithm: tsigKey.algorithm, key: tsigKey.key }
        });
        const err = sdkError(res) ?? (!res.response.ok ? res.response.statusText : null);
        if (err) { showError(err); } else { setFields({ name: '', type: 'A', ttl: 300, value: '' }); onAdd(); }
        setLoading(false);
    }

    return (
        <Table.Tr>
            <Table.Td>
                <TextInput placeholder="Name" value={fields.name} onInput={e => setFields({ ...fields, name: e.target.value })} />
            </Table.Td>
            <Table.Td>
                <Select
                    data={SUPPORTED_TYPES.map(t => ({ value: t, label: t }))}
                    value={fields.type}
                    onChange={e => setFields({ ...fields, type: e })}
                />
            </Table.Td>
            <Table.Td>
                <TextInput type="number" value={fields.ttl} onInput={e => setFields({ ...fields, ttl: e.target.value })} />
            </Table.Td>
            <Table.Td>
                <TextInput value={fields.value} onInput={e => setFields({ ...fields, value: e.target.value })} />
            </Table.Td>
            <Table.Td>
                <Stack gap="xs">
                    <Button color="blue" size="xs" onClick={handleAdd} disabled={loading}>{loading ? 'Adding...' : 'Add'}</Button>
                </Stack>
            </Table.Td>
        </Table.Tr>
    );
}

export function DnsRecordsList({ zone, tsigKey }) {
    const { user } = useAuth();
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const { client, sdk } = useClient('dyndns');
    const { showError } = useErrorModal();

    async function fetchRecords() {
        setLoading(true);
        setLoadFailed(false);
        const res = await sdk.listDnsRecords({
            client,
            query: { zone },
            headers: {
                ...authHeaders(user),
                "X-DNS-Key-Name": tsigKey.keyname,
                "X-DNS-Key-Algorithm": tsigKey.algorithm,
                "X-DNS-Key": tsigKey.key,
            }
        });
        const err = sdkError(res);
        if (err) { showError(err); setLoadFailed(true); }
        else if (!res.data) { showError('No records found'); setLoadFailed(true); }
        else { setRecords(res.data.records.map(record => ({ ...record, name: stripZone(record.name, zone) }))); }
        setLoading(false);
    }

    useEffect(() => { fetchRecords(); }, []);

    if (loading) return (<Loader size="sm" />);
    if (loadFailed) return (<Alert icon={<AlertCircle size="16" />} title="Error" color="red">Failed to load DNS records. See the error dialog for details.</Alert>);

    return (
        <Table striped highlightOnHover>
            <Table.Thead>
                <Table.Tr>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Type</Table.Th>
                    <Table.Th>TTL</Table.Th>
                    <Table.Th>Value</Table.Th>
                    <Table.Th>Actions</Table.Th>
                </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
                {records.map(record => <DnsRecordRow key={record.name} zone={zone} tsigKey={tsigKey} record={record} onChange={fetchRecords} />)}
                <AddDnsRecordRow zone={zone} tsigKey={tsigKey} onAdd={fetchRecords} />
            </Table.Tbody>
        </Table>
    );
}
