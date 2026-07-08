import { useState, useEffect, useMemo } from 'react';
import { useClient } from '/providers/client.jsx';
import { useErrorModal } from '/providers/error-modal.jsx';
import { useConfirm } from '/providers/confirm.jsx';
import { Delayed } from '/helper/delayed.jsx';
import { isValidDnsName, isValidZonePattern, isValidUserFilter } from '/helper/dns-validation.js';
import { Trash2, Edit, Plus, Search, X, AlertCircle } from 'lucide-react';
import { Container, Title, Text, Button, Group, Stack, TextInput, Checkbox, SimpleGrid, Card, Modal, Alert, Loader, ActionIcon, Paper, Tabs, Badge, Table } from '@mantine/core';

const sdkError = (res) => res?.error?.detail ?? res?.error?.error ?? res?.error?.message ?? (res?.error ? String(res.error) : null);

// --- Main Component: DnsPolicy ---
export function DnsPolicy() {
    const { client, sdk } = useClient('dyndns');
    const { showError } = useErrorModal();
    const [rules, setRules] = useState([]);
    const [loadFailed, setLoadFailed] = useState(false);
    const [loading, setLoading] = useState(true);
    const [reloadTrigger, setReloadTrigger] = useState(true);
    const [editingRule, setEditingRule] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchFilter, setSearchFilter] = useState('');
    const [isEditAllowed, setIsEditAllowed] = useState(false);
    const [isSuperAdmin, setIsSuperAdmin] = useState(false);
    const [activeTab, setActiveTab] = useState('rules');

    // Fetch rules on load and when reloadTrigger changes
    useEffect(() => {
        (async () => {
            setLoading(true);
            setLoadFailed(false);
            const fullRes = await sdk.listPolicyRules({ client });
            const err = sdkError(fullRes);
            if (err) {
                showError(err);
                setLoadFailed(true);
                setLoading(false);
                return;
            }
            const res = fullRes.data;
            if (!res || !Array.isArray(res.rules)) {
                showError("Invalid response format: 'rules' array missing.");
                setLoadFailed(true);
                setLoading(false);
                return;
            }
            setRules(res.rules);
            setIsEditAllowed(!!res.edit_allowed);
            setIsSuperAdmin(!!res.is_super_admin);
            setLoading(false);
        })();
    }, [sdk, reloadTrigger]);

    // Handle successful create/edit/delete
    const handleSuccess = () => {
        setEditingRule(null);
        setIsModalOpen(false);
        setReloadTrigger(p => !p);
    }

    // Filter rules based on search term (and remember the filtered list until rules or search term changes)
    const filteredRules = useMemo(() => {
        return rules.filter(rule => {
            const searchTerm = searchFilter.toLowerCase();
            return (
                rule.zone_pattern.toLowerCase().includes(searchTerm) ||
                rule.target_user_filter.toLowerCase().includes(searchTerm) ||
                (rule.zone_soa && rule.zone_soa.toLowerCase().includes(searchTerm)) ||
                (rule.description && rule.description.toLowerCase().includes(searchTerm))
            );
        });
    }, [rules, searchFilter]);

    if (loading)
        return (<Delayed><Loader size="lg" /></Delayed>);

    if (loadFailed)
        return (<Alert icon={<AlertCircle size="16" />} title="Error" color="red">Failed to load rules. See the error dialog for details.</Alert>);

    return (
        <Container fluid py="md" px="xl">
            <Stack gap="lg">
                <Title order={2}>DNS Policy Management</Title>

                <Tabs value={activeTab} onChange={setActiveTab}>
                    <Tabs.List>
                        <Tabs.Tab value="rules">Policy Rules</Tabs.Tab>
                        {isSuperAdmin && <Tabs.Tab value="delegations">Delegations</Tabs.Tab>}
                        {isSuperAdmin && <Tabs.Tab value="orphaned">Orphaned Zones</Tabs.Tab>}
                    </Tabs.List>

                    <Tabs.Panel value="rules" pt="md">
                        <Stack gap="lg">
                            <Group justify="space-between" align="flex-start">
                                <Text size="sm" c="dimmed">
                                    {isEditAllowed
                                        ? 'Manage who may create which zones. Policy changes apply to new zones. Existing zones stay as they are, so plan any follow-up updates.'
                                        : 'Read-only view of the DNS access rules that are currently active.'}
                                </Text>
                                {isEditAllowed && (
                                    <Button leftSection={<Plus size="16" />} onClick={() => { setEditingRule(null); setIsModalOpen(true); }}>
                                        New Rule
                                    </Button>
                                )}
                            </Group>

                            <RuleFilter
                                searchFilter={searchFilter}
                                onSearchChange={setSearchFilter}
                                filteredCount={filteredRules.length}
                                totalCount={rules.length}
                            />

                            <RuleList rules={filteredRules} isSuperAdmin={isEditAllowed}
                                onEdit={(rule) => { setEditingRule(rule); setIsModalOpen(true); }}
                                onDeleteSuccess={handleSuccess}
                            />
                        </Stack>
                    </Tabs.Panel>

                    {isSuperAdmin && (
                        <Tabs.Panel value="delegations" pt="md">
                            <DelegationManagement />
                        </Tabs.Panel>
                    )}

                    {isSuperAdmin && (
                        <Tabs.Panel value="orphaned" pt="md">
                            <OrphanedZonesPanel />
                        </Tabs.Panel>
                    )}
                </Tabs>

                {isModalOpen && (
                    <RuleFormModal ruleToEdit={editingRule}
                        onFormSuccess={handleSuccess}
                        onClose={() => { setIsModalOpen(false); setEditingRule(null); }}
                    />
                )}
            </Stack>
        </Container>
    );
}

// --- Rule Filter Component ---
function RuleFilter({ searchFilter, onSearchChange, filteredCount, totalCount }) {
    return (
        <TextInput
            placeholder="Search by zone pattern, user filter, or description..."
            value={searchFilter}
            onChange={(e) => onSearchChange(e.target.value)}
            leftSection={<Search size="16" />}
            rightSection={searchFilter && (
                <ActionIcon variant="subtle" onClick={() => onSearchChange('')}>
                    <X size="16" />
                </ActionIcon>
            )}
            description={`Showing ${filteredCount} of ${totalCount} rules`}
        />
    );
}

// --- Rule List Component ---
function RuleList({ rules, isSuperAdmin, onEdit, onDeleteSuccess }) {
    const { client, sdk } = useClient('dyndns');
    const { showError } = useErrorModal();
    const confirm = useConfirm();
    const [deleteLoading, setDeleteLoading] = useState(null);

    const handleDelete = async (rule) => {
        // Deleting a rule orphans every zone only it covered (zone<->rule links
        // are recomputed, not stored), so confirm with an explicit impact warning.
        const ok = await confirm({
            title: '⚠️ Delete policy rule?',
            confirmLabel: 'Delete rule',
            message: (
                <Stack gap="md">
                    <Alert color="red" icon={<AlertCircle size="16" />} title="This can orphan zones">
                        Every zone that is covered <b>only</b> by this rule will become
                        orphaned. Owners keep their DNS records, but can no longer manage
                        those zones until a rule reproducing the same names and owners exists
                        again — recreating it must match <b>exactly</b> (a single typo in the
                        user filter is enough to leave the zones orphaned).
                    </Alert>
                    <Stack gap={6}>
                        <Text size="sm" c="dimmed">You are about to delete:</Text>
                        <Text fw={600}>{rule.description || '(no description)'}</Text>
                        <Group gap="xs" wrap="nowrap"><Text size="sm" c="dimmed" w={110}>Zone pattern</Text><Text component="code" style={{ fontSize: '0.85em' }}>{rule.zone_pattern}</Text></Group>
                        <Group gap="xs" wrap="nowrap"><Text size="sm" c="dimmed" w={110}>Applies to</Text><Text component="code" style={{ fontSize: '0.85em' }}>{rule.target_user_filter}</Text></Group>
                    </Stack>
                </Stack>
            ),
        });
        if (!ok) return;
        setDeleteLoading(rule.id);
        const res = await sdk.deletePolicyRule({ client, path: { id: rule.id } });
        const err = sdkError(res);
        if (err) { showError(`Error deleting rule: ${err}`); } else { onDeleteSuccess(); }
        setDeleteLoading(null);
    }

    if (rules.length === 0) {
        return (
            <Paper p="xl" withBorder>
                <Stack align="center" gap="sm">
                    <Text size="lg" c="dimmed">📭 No rules found.</Text>
                    {isSuperAdmin && (<Text size="sm" c="dimmed">Create the first rule to grant users access to DNS zones.</Text>)}
                </Stack>
            </Paper>
        );
    }

    const codeStyle = { fontSize: '0.85em', whiteSpace: 'nowrap' };
    return (
        <Table.ScrollContainer minWidth={760}>
            <Table striped highlightOnHover withTableBorder stickyHeader verticalSpacing="sm" horizontalSpacing="md">
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Zone Pattern</Table.Th>
                        <Table.Th>Zone SOA</Table.Th>
                        <Table.Th>Applies To</Table.Th>
                        <Table.Th>Subdomains</Table.Th>
                        <Table.Th>Sharing</Table.Th>
                        <Table.Th>Description</Table.Th>
                        {isSuperAdmin && <Table.Th w={90} style={{ textAlign: 'right' }}>Actions</Table.Th>}
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {rules.map(rule => (
                        <Table.Tr key={rule.id}>
                            <Table.Td><Text fw={600} component="code" style={codeStyle}>{rule.zone_pattern}</Text></Table.Td>
                            <Table.Td><code style={codeStyle}>{rule.zone_soa}</code></Table.Td>
                            <Table.Td><code style={codeStyle}>{rule.target_user_filter}</code></Table.Td>
                            <Table.Td>
                                <Badge size="sm" variant="light" color={rule.allow_subdomains ? 'green' : 'gray'}
                                    title="Whether users may create subdomains (delegated subzones) under a matched zone">
                                    {rule.allow_subdomains ? 'Yes' : 'No'}
                                </Badge>
                            </Table.Td>
                            <Table.Td>
                                <Badge size="sm" variant="light" color={rule.sharing_allowed ? 'green' : 'gray'}
                                    title="Whether a matched zone may be shared with additional owners">
                                    {rule.sharing_allowed ? 'Yes' : 'No'}
                                </Badge>
                            </Table.Td>
                            <Table.Td><Text size="sm" c="dimmed">{rule.description}</Text></Table.Td>
                            {isSuperAdmin && (
                                <Table.Td>
                                    <Group gap="4" justify="flex-end" wrap="nowrap">
                                        <ActionIcon size="sm" variant="light" color="blue" onClick={() => onEdit(rule)} title="Edit">
                                            <Edit size="16" />
                                        </ActionIcon>
                                        <ActionIcon size="sm" variant="light" color="red" onClick={() => handleDelete(rule)}
                                            loading={deleteLoading === rule.id} disabled={deleteLoading === rule.id} title="Delete">
                                            <Trash2 size="16" />
                                        </ActionIcon>
                                    </Group>
                                </Table.Td>
                            )}
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
        </Table.ScrollContainer>
    );
}

// --- Rule Form Modal ---
function RuleFormModal({ ruleToEdit, onFormSuccess, onClose }) {
    const { client, sdk } = useClient('dyndns');
    const { showError } = useErrorModal();
    const isEditMode = ruleToEdit !== null;

    const initialRuleState = {
        zone_pattern: '',
        zone_soa: '',
        target_user_filter: '',
        allow_subdomains: false,
        sharing_allowed: false,
        description: '',
        ...(ruleToEdit || {})
    };

    const [rule, setRule] = useState(initialRuleState);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);
    const [zoneValid, setZoneValid] = useState(isValidZonePattern(initialRuleState.zone_pattern));
    const [zoneSoaValid, setZoneSoaValid] = useState(isValidDnsName(initialRuleState.zone_soa));
    const [userFilterValid, setUserFilterValid] = useState(isValidUserFilter(initialRuleState.target_user_filter));

    useEffect(() => {
        if (ruleToEdit) {
            setRule(ruleToEdit);
            setMessage(null);
            setZoneValid(isValidZonePattern(ruleToEdit.zone_pattern || ''));
            setZoneSoaValid(isValidDnsName(ruleToEdit.zone_soa || ''));
            setUserFilterValid(isValidUserFilter(ruleToEdit.target_user_filter || ''));
        } else {
            setRule(initialRuleState);
            setZoneValid(isValidZonePattern(initialRuleState.zone_pattern || ''));
            setZoneSoaValid(isValidDnsName(initialRuleState.zone_soa || ''));
            setUserFilterValid(isValidUserFilter(initialRuleState.target_user_filter || ''));
        }
    }, [ruleToEdit]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setRule(prev => ({
            ...prev,
            [name]: value
        }));
        if (name === 'zone_pattern') {
            setZoneValid(isValidZonePattern(value));
        } else if (name === 'zone_soa') {
            setZoneSoaValid(isValidDnsName(value));
        } else if (name === 'target_user_filter') {
            setUserFilterValid(isValidUserFilter(value));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        if (!isValidZonePattern(rule.zone_pattern) || !isValidDnsName(rule.zone_soa) || !isValidUserFilter(rule.target_user_filter)) {
            setMessage(<Alert icon={<AlertCircle size="16" />} title="Validation Error" color="red">Please ensure Zone Pattern, Zone SOA, and User Filter are all valid.</Alert>);
            setLoading(false);
            return;
        }

        const body = {
            zone_pattern: rule.zone_pattern,
            zone_soa: rule.zone_soa,
            target_user_filter: rule.target_user_filter,
            allow_subdomains: !!rule.allow_subdomains,
            sharing_allowed: !!rule.sharing_allowed,
            description: rule.description || undefined,
        };
        const res = isEditMode
            ? await sdk.updatePolicyRule({ client, path: { id: rule.id }, body })
            : await sdk.createPolicyRule({ client, body });
        const err = sdkError(res);
        if (err) {
            showError(err);
        } else {
            setMessage(<Alert title="Success" color="green">{isEditMode ? '✅ Rule updated!' : '✅ Rule created!'}</Alert>);
            setTimeout(() => onFormSuccess(), 700);
        }
        setLoading(false);
    };

    return (
        <Modal opened={true} onClose={onClose} title={isEditMode ? '✏️ Edit Rule' : '➕ Create New Rule'} size="lg">
            <Stack gap="md">
                {message}

                <form onSubmit={handleSubmit}>
                    <Stack gap="md">
                        <TextInput
                            label="Zone (Name or Pattern)"
                            name="zone_pattern"
                            value={rule.zone_pattern}
                            onChange={handleChange}
                            required
                            placeholder="e.g. projekt1.example.com or %u.users.example.com"
                            description="%u.users.example.com = %u will be replaced with username"
                            error={!zoneValid && "Enter a valid domain. Allowed: '%u' as a full label (not the TLD). Wildcards are not permitted."}
                        />

                        <TextInput
                            label="Zone SOA"
                            name="zone_soa"
                            value={rule.zone_soa}
                            onChange={handleChange}
                            required
                            placeholder="e.g. users.example.com"
                            description="The authoritative zone for this nameserver (e.g., users.example.com)"
                            error={!zoneSoaValid && "Enter a valid DNS domain name."}
                        />

                        <TextInput
                            label="User Filter"
                            name="target_user_filter"
                            value={rule.target_user_filter}
                            onChange={handleChange}
                            required
                            placeholder="e.g. *@example.com  or  alice@example.com, bob@example.com"
                            description="Comma-separated list. *@example.com = all users at that domain; alice@example.com = one specific user. Access is granted if any entry matches."
                            error={!userFilterValid && "Enter valid emails and/or *@domain patterns, comma-separated."}
                        />

                        <Checkbox
                            label="Allow subdomains"
                            description="Owners of a matched zone may also create and manage delegated subzones under it (e.g. sub.example.com under example.com)."
                            checked={!!rule.allow_subdomains}
                            onChange={(e) => setRule(prev => ({ ...prev, allow_subdomains: e.currentTarget.checked }))}
                        />

                        <Checkbox
                            label="Allow sharing"
                            description="Owners may share a matched zone with additional users, and policy-entitled users can join it as co-owners (equal rights). Off = single-owner (the old behaviour)."
                            checked={!!rule.sharing_allowed}
                            onChange={(e) => setRule(prev => ({ ...prev, sharing_allowed: e.currentTarget.checked }))}
                        />

                        <TextInput
                            label="Description (optional)"
                            name="description"
                            value={rule.description || ''}
                            onChange={handleChange}
                            placeholder="e.g. Project zone for student group A"
                        />

                        <Group justify="flex-end" mt="md">
                            <Button variant="default" onClick={onClose}>Cancel</Button>
                            <Button
                                type="submit"
                                loading={loading}
                                disabled={!zoneValid || !zoneSoaValid || !userFilterValid}>
                                {isEditMode ? "Save Changes" : "Create Rule"}
                            </Button>
                        </Group>
                    </Stack>
                </form>
            </Stack>
        </Modal>
    );
}

// Validation helpers (isValidDnsName / isValidZonePattern / isValidUserFilter)
// live in /helper/dns-validation.js, shared with the subzone modal.

// ============================================================
// Delegation Policies (super-admin only). Grants users the right to manage
// policy rules for a zone (and its subdomains). Uses the raw client because
// the generated SDK does not (yet) include the /policies/delegations endpoints.
// ============================================================
function DelegationManagement() {
    const { client } = useClient('dyndns');
    const { showError } = useErrorModal();
    const confirm = useConfirm();
    const [delegations, setDelegations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [reload, setReload] = useState(true);
    const [editing, setEditing] = useState(null);
    const [modalOpen, setModalOpen] = useState(false);

    useEffect(() => {
        (async () => {
            setLoading(true);
            const res = await client.get({ url: '/v1/policies/delegations' });
            const err = sdkError(res);
            if (err) { showError(err); } else { setDelegations(res.data?.delegations || []); }
            setLoading(false);
        })();
    }, [client, reload]);

    const onSuccess = () => { setEditing(null); setModalOpen(false); setReload(p => !p); };

    async function handleDelete(delegation) {
        const ok = await confirm({
            title: 'Delete delegation?',
            confirmLabel: 'Delete delegation',
            message: `Revoke the delegated rule-management permission for “${delegation.target_user_filter}” on ${delegation.zone_suffix}? Existing zones and rules are not affected.`,
        });
        if (!ok) return;
        const res = await client.delete({ url: '/v1/policies/delegations/{id}', path: { id: delegation.id } });
        const err = sdkError(res) ?? (res.response && res.response.status >= 400 ? res.response.statusText : null);
        if (err) { showError(err); } else { setReload(p => !p); }
    }

    if (loading) return (<Delayed><Loader size="lg" /></Delayed>);

    return (
        <Stack gap="md">
            <Group justify="space-between" align="flex-start">
                <Text size="sm" c="dimmed">
                    Grant specific users the right to manage policy rules for a zone (and its subdomains).
                    Delegated users can then create, edit and delete rules whose SOA is within that zone.
                </Text>
                <Button leftSection={<Plus size="16" />} onClick={() => { setEditing(null); setModalOpen(true); }}>New Delegation</Button>
            </Group>

            {delegations.length === 0 ? (
                <Paper p="xl" withBorder><Text ta="center" c="dimmed">No delegations yet.</Text></Paper>
            ) : (
                <Table.ScrollContainer minWidth={600}>
                    <Table striped highlightOnHover withTableBorder stickyHeader verticalSpacing="sm" horizontalSpacing="md">
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>User</Table.Th>
                                <Table.Th>Zone (+ subdomains)</Table.Th>
                                <Table.Th>Description</Table.Th>
                                <Table.Th w={90} style={{ textAlign: 'right' }}>Actions</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {delegations.map(d => (
                                <Table.Tr key={d.id}>
                                    <Table.Td><code style={{ fontSize: '0.85em', whiteSpace: 'nowrap' }}>{d.target_user_filter}</code></Table.Td>
                                    <Table.Td><code style={{ fontSize: '0.85em', whiteSpace: 'nowrap' }}>{d.zone_suffix}</code></Table.Td>
                                    <Table.Td><Text size="sm" c="dimmed">{d.description}</Text></Table.Td>
                                    <Table.Td>
                                        <Group gap="4" justify="flex-end" wrap="nowrap">
                                            <ActionIcon size="sm" variant="light" color="blue" onClick={() => { setEditing(d); setModalOpen(true); }} title="Edit">
                                                <Edit size="16" />
                                            </ActionIcon>
                                            <ActionIcon size="sm" variant="light" color="red" onClick={() => handleDelete(d)} title="Delete">
                                                <Trash2 size="16" />
                                            </ActionIcon>
                                        </Group>
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Table.ScrollContainer>
            )}

            {modalOpen && (
                <DelegationFormModal delegationToEdit={editing} onSuccess={onSuccess} onClose={() => { setModalOpen(false); setEditing(null); }} />
            )}
        </Stack>
    );
}

function DelegationFormModal({ delegationToEdit, onSuccess, onClose }) {
    const { client } = useClient('dyndns');
    const { showError } = useErrorModal();
    const isEdit = delegationToEdit !== null;
    const [form, setForm] = useState({ target_user_filter: '', zone_suffix: '', description: '', ...(delegationToEdit || {}) });
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);

    const userValid = isValidUserFilter(form.target_user_filter);
    const zoneValid = isValidDnsName(form.zone_suffix);

    const handleChange = (e) => { const { name, value } = e.target; setForm(prev => ({ ...prev, [name]: value })); };

    async function handleSubmit(e) {
        e.preventDefault();
        if (!userValid || !zoneValid) {
            setMessage(<Alert icon={<AlertCircle size="16" />} title="Validation Error" color="red">Enter a valid user filter and zone.</Alert>);
            return;
        }
        setLoading(true);
        setMessage(null);
        const body = { target_user_filter: form.target_user_filter, zone_suffix: form.zone_suffix, description: form.description || undefined };
        const res = isEdit
            ? await client.put({ url: '/v1/policies/delegations/{id}', path: { id: form.id }, body })
            : await client.post({ url: '/v1/policies/delegations', body });
        const err = sdkError(res) ?? (res.response && res.response.status >= 400 ? res.response.statusText : null);
        if (err) { showError(err); setLoading(false); }
        else { setMessage(<Alert title="Success" color="green">{isEdit ? '✅ Delegation updated!' : '✅ Delegation created!'}</Alert>); setTimeout(onSuccess, 700); }
    }

    return (
        <Modal opened={true} onClose={onClose} title={isEdit ? '✏️ Edit Delegation' : '➕ New Delegation'} size="lg">
            <Stack gap="md">
                {message}
                <form onSubmit={handleSubmit}>
                    <Stack gap="md">
                        <TextInput
                            label="User Filter" name="target_user_filter" value={form.target_user_filter} onChange={handleChange} required
                            placeholder="e.g. max@uni-mannheim.de, petra@uni-mannheim.de  or  *@uni-mannheim.de"
                            description="Who may manage policy rules for the zone below. Comma-separated list of emails and/or *@domain patterns."
                            error={!userValid && form.target_user_filter && "Enter valid emails and/or *@domain patterns, comma-separated."}
                        />
                        <TextInput
                            label="Zone" name="zone_suffix" value={form.zone_suffix} onChange={handleChange} required
                            placeholder="e.g. uni-mannheim.de"
                            description="Delegated users may manage rules for this zone and its subdomains"
                            error={!zoneValid && form.zone_suffix && "Enter a valid DNS domain name."}
                        />
                        <TextInput label="Description (optional)" name="description" value={form.description || ''} onChange={handleChange} placeholder="e.g. Uni-Mannheim DNS admins" />
                        <Group justify="flex-end" mt="md">
                            <Button variant="default" onClick={onClose}>Cancel</Button>
                            <Button type="submit" loading={loading} disabled={!userValid || !zoneValid}>{isEdit ? 'Save' : 'Create'}</Button>
                        </Group>
                    </Stack>
                </form>
            </Stack>
        </Modal>
    );
}

// ============================================================
// Orphaned Zones (super-admin only). Zones that still exist but are no longer
// covered by any policy for their owner (policy deleted/changed). Uses the raw
// client (endpoints not in the generated SDK).
// ============================================================
function OrphanedZonesPanel() {
    const { client } = useClient('dyndns');
    const { showError } = useErrorModal();
    const confirm = useConfirm();
    const [zones, setZones] = useState([]);
    const [loading, setLoading] = useState(true);
    const [reload, setReload] = useState(true);
    const [deleting, setDeleting] = useState(null);

    useEffect(() => {
        (async () => {
            setLoading(true);
            const res = await client.get({ url: '/v1/policies/orphaned-zones' });
            const err = sdkError(res);
            if (err) { showError(err); } else { setZones(res.data?.zones || []); }
            setLoading(false);
        })();
    }, [client, reload]);

    async function handleDelete(zone) {
        const ok = await confirm({
            title: '⚠️ Delete orphaned zone?',
            confirmLabel: 'Delete zone',
            message: (<Text size="sm">This permanently deletes the zone <b>{zone}</b> and all of its DNS records. This cannot be undone.</Text>),
        });
        if (!ok) return;
        setDeleting(zone);
        const res = await client.delete({ url: '/v1/policies/orphaned-zones/{zone}', path: { zone } });
        const err = sdkError(res) ?? (res.response && res.response.status >= 400 ? res.response.statusText : null);
        if (err) { showError(err); } else { setReload(p => !p); }
        setDeleting(null);
    }

    if (loading) return (<Delayed><Loader size="lg" /></Delayed>);

    return (
        <Stack gap="md">
            <Text size="sm" c="dimmed">
                Zones that still exist but are no longer covered by any policy for their owner (e.g. the policy was
                deleted or changed). Review and delete the ones that are no longer needed.
            </Text>
            {zones.length === 0 ? (
                <Paper p="xl" withBorder><Text ta="center" c="dimmed">No orphaned zones. 🎉</Text></Paper>
            ) : (
                <Stack gap="xs">
                    {zones.map(z => (
                        <Paper key={z.zone} p="sm" withBorder>
                            <Group justify="space-between" wrap="nowrap">
                                <div>
                                    <Text size="sm"><code style={{ fontSize: '0.85em' }}>{z.zone}</code></Text>
                                    <Text size="xs" c="dimmed">owner: {z.user}</Text>
                                </div>
                                <Button size="xs" color="red" variant="light" leftSection={<Trash2 size="14" />}
                                    loading={deleting === z.zone} onClick={() => handleDelete(z.zone)}>Delete</Button>
                            </Group>
                        </Paper>
                    ))}
                </Stack>
            )}
        </Stack>
    );
}
