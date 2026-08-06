import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { generateNsUpdate, generateDig } from './dynamic-dns.jsx';
import { useZonesApi } from '/dyndns/api-zones.jsx';
import { dyndnsKeys } from '/dyndns/query-keys.js';
import { Loading, LoadError, useApiMutation } from '/helper/query-state.jsx';
import { useDynDnsConfig } from '/providers/dyndns-config.jsx';
import { useErrorModal } from '/providers/error-modal.jsx';
import { useConfirm } from '/providers/confirm.jsx';
import { Table, TextInput, Select, Group, Stack, Text, ActionIcon, Tooltip, Checkbox, Button } from '@mantine/core';
import { Copy, Check, Search, Edit, Trash2, Terminal, Plus } from 'lucide-react';
import { TabIntro } from './tab-intro.jsx';
import { formatError } from '/helper/api-error.js';
import { recordNameError, recordValueError } from '/helper/dns-validation.js';

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

// Stable identity for a record across renders and for the selection set.
// DNS has no exact duplicates (same name+type+value), so this is unique.
// '|' is safe as a separator: it occurs in neither DNS names nor A/AAAA values.
const recordKey = (r) => `${r.name}|${r.type}|${r.value}`;


export function DnsRecordRow({ zone, tsigKey, record, selected, onToggleSelect }) {
    const { config: dynDnsConfig } = useDynDnsConfig();
    const api = useZonesApi();
    const confirm = useConfirm();

    const [editing, setEditing] = useState(false);
    const [fields, setFields] = useState({ ...record });
    const [copied, setCopied] = useState(null); // which copy button briefly shows "Copied…"

    const isEditable = SUPPORTED_TYPES.includes(record.type.toUpperCase());
    const valueError = editing ? recordValueError(fields.type, fields.value) : null;
    const nameError = editing ? recordNameError(fields.name) : null;

    const saveRecord = useApiMutation({
        mutationFn: () => api.saveDnsRecord(zone, tsigKey, { ...fields, name: normalizeRecordName(fields.name, zone) }),
        invalidates: [dyndnsKeys.records(zone)],
        onSuccess: () => setEditing(false),
    });

    const deleteRecord = useApiMutation({
        mutationFn: () => api.deleteDnsRecord(zone, tsigKey, { ...fields, name: normalizeRecordName(fields.name, zone) }),
        invalidates: [dyndnsKeys.records(zone)],
    });

    const loading = saveRecord.isPending || deleteRecord.isPending;

    function handleUpdate() {
        if (valueError || nameError) return;
        saveRecord.mutate();
    }

    async function handleDelete() {
        const ok = await confirm({
            title: 'Delete DNS record?',
            confirmLabel: 'Delete record',
            message: `Delete the ${fields.type} record “${fields.name}” (${fields.value})? This takes effect immediately.`,
        });
        if (ok) deleteRecord.mutate();
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
        <Table.Tr bg={selected ? 'var(--mantine-color-blue-light)' : undefined}>
            <Table.Td>
                {/* Only editable records (A/AAAA) can be deleted, so only they get a checkbox. */}
                {isEditable && (
                    <Checkbox checked={selected} onChange={onToggleSelect} disabled={loading} aria-label={`Select ${fields.name}`} />
                )}
            </Table.Td>
            <Table.Td>
                <TextInput value={fields.name} onInput={e => setFields({ ...fields, name: e.target.value })} disabled={loading || !editing || !isEditable} error={nameError} />
            </Table.Td>
            <Table.Td>
                <TextInput value={fields.value} onInput={e => setFields({ ...fields, value: e.target.value })} disabled={loading || !editing || !isEditable} error={valueError} />
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
                {/* Icon actions with hover tooltips (slimmer than text buttons -> no wrap).
                    Non-editable records (e.g. the immutable NS record) get no actions at all. */}
                {isEditable && (
                    <Group gap={4} wrap="nowrap">
                        {editing ? (
                            <Tooltip label="Save">
                                <ActionIcon variant="light" color="green" onClick={handleUpdate} loading={loading} disabled={!!valueError || !!nameError} aria-label="Save"><Check size={16} /></ActionIcon>
                            </Tooltip>
                        ) : (
                            <Tooltip label="Edit">
                                <ActionIcon variant="light" onClick={() => setEditing(true)} disabled={loading} aria-label="Edit"><Edit size={16} /></ActionIcon>
                            </Tooltip>
                        )}
                        <Tooltip label="Delete">
                            <ActionIcon variant="light" color="red" onClick={handleDelete} disabled={loading} loading={loading && !editing} aria-label="Delete"><Trash2 size={16} /></ActionIcon>
                        </Tooltip>
                        <Tooltip label={copied === 'nsupdate' ? 'Copied!' : 'Copy nsupdate command'}>
                            <ActionIcon variant="light" onClick={handleCopy} aria-label="Copy nsupdate">{copied === 'nsupdate' ? <Check size={16} /> : <Copy size={16} />}</ActionIcon>
                        </Tooltip>
                        <Tooltip label={copied === 'dig' ? 'Copied!' : 'Copy dig command'}>
                            <ActionIcon variant="light" onClick={handleCopyDig} aria-label="Copy dig">{copied === 'dig' ? <Check size={16} /> : <Terminal size={16} />}</ActionIcon>
                        </Tooltip>
                    </Group>
                )}
            </Table.Td>
        </Table.Tr>
    );
}

const EMPTY_RECORD = { name: '', type: 'A', ttl: 300, value: '' };

export function AddDnsRecordRow({ zone, tsigKey }) {
    const api = useZonesApi();
    const [fields, setFields] = useState(EMPTY_RECORD);

    const valueError = recordValueError(fields.type, fields.value);
    const nameError = recordNameError(fields.name);

    const addRecord = useApiMutation({
        mutationFn: () => api.saveDnsRecord(zone, tsigKey, { ...fields, name: normalizeRecordName(fields.name, zone) }),
        invalidates: [dyndnsKeys.records(zone)],
        onSuccess: () => setFields(EMPTY_RECORD),
    });

    function handleAdd() {
        if (valueError || nameError) return;
        addRecord.mutate();
    }

    return (
        <Table.Tr>
            <Table.Td />
            <Table.Td>
                <TextInput placeholder="Name" value={fields.name} onInput={e => setFields({ ...fields, name: e.target.value })} error={fields.name.trim() ? nameError : null} />
            </Table.Td>
            <Table.Td>
                <TextInput value={fields.value} onInput={e => setFields({ ...fields, value: e.target.value })} error={fields.value.trim() ? valueError : null} />
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
                <Tooltip label="Add record">
                    <ActionIcon variant="filled" color="blue" onClick={handleAdd} loading={addRecord.isPending} disabled={!!valueError || !!nameError} aria-label="Add record"><Plus size={16} /></ActionIcon>
                </Tooltip>
            </Table.Td>
        </Table.Tr>
    );
}

export function DnsRecordsList({ zone, tsigKey }) {
    const api = useZonesApi();
    const { showError } = useErrorModal();
    const confirm = useConfirm();
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState(new Set());
    const [bulkDeleting, setBulkDeleting] = useState(false);

    const recordsQuery = useQuery({
        queryKey: dyndnsKeys.records(zone),
        queryFn: async () => {
            const records = await api.listDnsRecords(zone, tsigKey);
            // Names are shown relative to the zone everywhere in this table.
            return records.map(record => ({ ...record, name: stripZone(record.name, zone) }));
        },
        enabled: !!api,
    });

    if (!api || recordsQuery.isPending) return <Loading size="sm" />;
    if (recordsQuery.isError) return <LoadError query={recordsQuery} title="Could not load DNS records" />;

    const records = recordsQuery.data ?? [];

    const query = search.trim().toLowerCase();
    const filteredRecords = query
        ? records.filter(record =>
            [record.name, record.type, String(record.ttl), record.value]
                .some(field => (field ?? '').toLowerCase().includes(query)))
        : records;

    // Only editable records (A/AAAA) can be selected/deleted.
    const selectableRecords = filteredRecords.filter(r => SUPPORTED_TYPES.includes(r.type.toUpperCase()));
    const allSelected = selectableRecords.length > 0 && selectableRecords.every(r => selected.has(recordKey(r)));
    const someSelected = selectableRecords.some(r => selected.has(recordKey(r)));

    function toggleSelect(record) {
        const key = recordKey(record);
        setSelected(prev => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
        });
    }

    function toggleSelectAll() {
        setSelected(allSelected ? new Set() : new Set(selectableRecords.map(recordKey)));
    }

    async function handleBulkDelete() {
        const toDelete = selectableRecords.filter(r => selected.has(recordKey(r)));
        if (toDelete.length === 0) return;
        const ok = await confirm({
            title: `Delete ${toDelete.length} DNS record${toDelete.length > 1 ? 's' : ''}?`,
            confirmLabel: `Delete ${toDelete.length} record${toDelete.length > 1 ? 's' : ''}`,
            message: `Permanently delete the ${toDelete.length} selected record${toDelete.length > 1 ? 's' : ''}? This takes effect immediately.`,
        });
        if (!ok) return;
        setBulkDeleting(true);
        // Sequential on purpose: the DNS server applies these one at a time and
        // firing 50 parallel updates at it only produces SERVFAILs. The first
        // failure is reported, the rest still run — a half-finished bulk delete
        // is worse than a fully attempted one.
        let firstErr = null;
        for (const record of toDelete) {
            try {
                await api.deleteDnsRecord(zone, tsigKey, { ...record, name: normalizeRecordName(record.name, zone) });
            } catch (e) {
                firstErr ??= formatError(e);
            }
        }
        setBulkDeleting(false);
        setSelected(new Set());
        if (firstErr) showError(firstErr);
        recordsQuery.refetch();
    }

    const selectedCount = selectableRecords.filter(r => selected.has(recordKey(r))).length;

    return (
        <Stack gap="lg">
            <TabIntro title={`DNS records for ${zone}`}>
                Add a record in the bottom row, or edit and delete existing ones inline. Changes take effect
                immediately.
            </TabIntro>

            <TextInput
                placeholder="Search records by name, type, TTL, or value"
                leftSection={<Search size="16" />}
                value={search}
                onInput={e => setSearch(e.target.value)}
            />

            {/* Bulk-action bar: only shown once records are selected. */}
            {selectedCount > 0 && (
                <Group justify="space-between">
                    <Text size="sm">{selectedCount} record{selectedCount > 1 ? 's' : ''} selected</Text>
                    <Group gap="sm">
                        <Button variant="default" size="xs" onClick={() => setSelected(new Set())} disabled={bulkDeleting}>Clear</Button>
                        <Button color="red" size="xs" leftSection={<Trash2 size={16} />} onClick={handleBulkDelete} loading={bulkDeleting}>
                            Delete selected
                        </Button>
                    </Group>
                </Group>
            )}

            <Table.ScrollContainer minWidth={720}>
                <Table striped highlightOnHover withTableBorder stickyHeader verticalSpacing="sm" horizontalSpacing="md">
                    <Table.Thead>
                        {/* Name + Value sit next to each other and get the space; Type/TTL
                        are narrow and moved to the back, Actions fits its buttons. */}
                        <Table.Tr>
                            <Table.Th w={40}>
                                <Checkbox
                                    checked={allSelected}
                                    indeterminate={someSelected && !allSelected}
                                    onChange={toggleSelectAll}
                                    disabled={selectableRecords.length === 0 || bulkDeleting}
                                    aria-label="Select all records"
                                />
                            </Table.Th>
                            <Table.Th w="28%">Name</Table.Th>
                            <Table.Th w="32%">Value</Table.Th>
                            <Table.Th w={110}>Type</Table.Th>
                            <Table.Th w={90}>TTL (s)</Table.Th>
                            <Table.Th>Actions</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {filteredRecords.map(record => <DnsRecordRow key={recordKey(record)} zone={zone} tsigKey={tsigKey} record={record} selected={selected.has(recordKey(record))} onToggleSelect={() => toggleSelect(record)} />)}
                        {query && filteredRecords.length === 0 && (
                            <Table.Tr>
                                <Table.Td colSpan={6}>
                                    <Text c="dimmed" size="sm">No records match “{search.trim()}”.</Text>
                                </Table.Td>
                            </Table.Tr>
                        )}
                        <AddDnsRecordRow zone={zone} tsigKey={tsigKey} />
                    </Table.Tbody>
                </Table>
            </Table.ScrollContainer>
        </Stack>
    );
}
