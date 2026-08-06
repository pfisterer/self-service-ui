import { useState, useMemo } from 'react';
import { formatError } from '/helper/api-error.js';
import { useQuery } from '@tanstack/react-query';
import { useZonesApi } from '/dyndns/api-zones.jsx';
import { dyndnsKeys } from '/dyndns/query-keys.js';
import { Loading, LoadError, useApiMutation } from '/helper/query-state.jsx';
import { useConfirm } from '/providers/confirm.jsx';
import { isValidDnsName, isValidZonePattern, isValidUserFilter } from '/helper/dns-validation.js';
import { Trash2, Edit, Plus, Search, X, AlertCircle } from 'lucide-react';
import { Container, Title, Text, Button, Group, Stack, TextInput, Checkbox, SimpleGrid, Card, Modal, Alert, ActionIcon, Paper, Tabs, Badge, Table } from '@mantine/core';


// --- Main Component: DnsPolicy ---
export function DnsPolicy() {
    const api = useZonesApi();
    const [editingRule, setEditingRule] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchFilter, setSearchFilter] = useState('');
    const [activeTab, setActiveTab] = useState('rules');

    // The rules AND the caller's permissions come from one response, so they
    // stay one cache entry — three separate useStates used to hold them and
    // could in principle disagree.
    const policyQuery = useQuery({
        queryKey: dyndnsKeys.policyRules(),
        queryFn: async () => {
            const data = await api.listPolicyRules();
            if (!data || !Array.isArray(data.rules)) {
                throw new Error("Invalid response format: 'rules' array missing.");
            }
            return data;
        },
        enabled: !!api,
    });

    // Closing the dialog is all that is left to do here: the mutations
    // invalidate the rule list themselves.
    const handleSuccess = () => {
        setEditingRule(null);
        setIsModalOpen(false);
    }

    const rules = useMemo(() => policyQuery.data?.rules ?? [], [policyQuery.data]);
    const isEditAllowed = !!policyQuery.data?.edit_allowed;
    const isSuperAdmin = !!policyQuery.data?.is_super_admin;

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

    if (!api || policyQuery.isPending) return <Loading />;
    if (policyQuery.isError) return <LoadError query={policyQuery} title="Could not load policy rules" />;

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
                    <RuleFormModal
                        // Remount per edited rule so the form resets itself,
                        // instead of an effect copying props into state.
                        key={editingRule?.id ?? 'new'}
                        ruleToEdit={editingRule}
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
function RuleList({ rules, isSuperAdmin, onEdit }) {
    const api = useZonesApi();
    const confirm = useConfirm();

    const deleteRule = useApiMutation({
        mutationFn: (id) => api.deletePolicyRule(id),
        invalidates: [dyndnsKeys.policyRules(), dyndnsKeys.zones()],
    });

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
        if (ok) deleteRule.mutate(rule.id);
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
                                            loading={deleteRule.isPending && deleteRule.variables === rule.id}
                                            disabled={deleteRule.isPending} title="Delete">
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
    const api = useZonesApi();
    const isEditMode = ruleToEdit !== null;

    const [rule, setRule] = useState({
        zone_pattern: '',
        zone_soa: '',
        target_user_filter: '',
        allow_subdomains: false,
        sharing_allowed: false,
        description: '',
        ...(ruleToEdit || {})
    });
    const [message, setMessage] = useState(null);

    // Derived, not stored. These were three useStates kept in sync by hand from
    // an effect AND from every change handler — two code paths writing the same
    // three flags, which is how they get to disagree.
    const zoneValid = isValidZonePattern(rule.zone_pattern);
    const zoneSoaValid = isValidDnsName(rule.zone_soa);
    const userFilterValid = isValidUserFilter(rule.target_user_filter);

    const saveRule = useApiMutation({
        mutationFn: (body) => isEditMode
            ? api.updatePolicyRule(rule.id, body)
            : api.createPolicyRule(body),
        // A rule decides which zones exist for whom, so the zone list changes too.
        invalidates: [dyndnsKeys.policyRules(), dyndnsKeys.zones()],
        onSuccess: () => {
            setMessage(<Alert title="Success" color="green">{isEditMode ? '✅ Rule updated!' : '✅ Rule created!'}</Alert>);
            setTimeout(() => onFormSuccess(), 700);
        },
        onError: (error) => setMessage(
            <Alert icon={<AlertCircle size="16" />} title="Error" color="red">{formatError(error)}</Alert>
        ),
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setRule(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setMessage(null);

        if (!zoneValid || !zoneSoaValid || !userFilterValid) {
            setMessage(<Alert icon={<AlertCircle size="16" />} title="Validation Error" color="red">Please ensure Zone Pattern, Zone SOA, and User Filter are all valid.</Alert>);
            return;
        }

        saveRule.mutate({
            zone_pattern: rule.zone_pattern,
            zone_soa: rule.zone_soa,
            target_user_filter: rule.target_user_filter,
            allow_subdomains: !!rule.allow_subdomains,
            sharing_allowed: !!rule.sharing_allowed,
            description: rule.description || undefined,
        });
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
                            onChange={(e) => { const v = e.currentTarget.checked; setRule(prev => ({ ...prev, allow_subdomains: v })); }}
                        />

                        <Checkbox
                            label="Allow sharing"
                            description="Owners may share a matched zone with additional users, and policy-entitled users can join it as co-owners (equal rights). Off = single-owner (the old behaviour)."
                            checked={!!rule.sharing_allowed}
                            onChange={(e) => { const v = e.currentTarget.checked; setRule(prev => ({ ...prev, sharing_allowed: v })); }}
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
                                loading={saveRule.isPending}
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
    const api = useZonesApi();
    const confirm = useConfirm();
    const [editing, setEditing] = useState(null);
    const [modalOpen, setModalOpen] = useState(false);

    const delegationsQuery = useQuery({
        queryKey: dyndnsKeys.delegations(),
        queryFn: () => api.listDelegations(),
        enabled: !!api,
    });

    const deleteDelegation = useApiMutation({
        mutationFn: (id) => api.deleteDelegation(id),
        invalidates: [dyndnsKeys.delegations()],
    });

    const onSuccess = () => { setEditing(null); setModalOpen(false); };

    async function handleDelete(delegation) {
        const ok = await confirm({
            title: 'Delete delegation?',
            confirmLabel: 'Delete delegation',
            message: `Revoke the delegated rule-management permission for “${delegation.target_user_filter}” on ${delegation.zone_suffix}? Existing zones and rules are not affected.`,
        });
        if (ok) deleteDelegation.mutate(delegation.id);
    }

    if (!api || delegationsQuery.isPending) return <Loading />;
    if (delegationsQuery.isError) return <LoadError query={delegationsQuery} title="Could not load delegations" />;

    const delegations = delegationsQuery.data ?? [];

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
    const api = useZonesApi();
    const isEdit = delegationToEdit !== null;
    const [form, setForm] = useState({ target_user_filter: '', zone_suffix: '', description: '', ...(delegationToEdit || {}) });
    const [message, setMessage] = useState(null);

    const saveDelegation = useApiMutation({
        mutationFn: (body) => isEdit ? api.updateDelegation(form.id, body) : api.createDelegation(body),
        invalidates: [dyndnsKeys.delegations()],
        onSuccess: () => {
            setMessage(<Alert title="Success" color="green">{isEdit ? '✅ Delegation updated!' : '✅ Delegation created!'}</Alert>);
            setTimeout(onSuccess, 700);
        },
        onError: (error) => setMessage(
            <Alert icon={<AlertCircle size="16" />} title="Error" color="red">{formatError(error)}</Alert>
        ),
    });

    const userValid = isValidUserFilter(form.target_user_filter);
    const zoneValid = isValidDnsName(form.zone_suffix);

    const handleChange = (e) => { const { name, value } = e.target; setForm(prev => ({ ...prev, [name]: value })); };

    function handleSubmit(e) {
        e.preventDefault();
        if (!userValid || !zoneValid) {
            setMessage(<Alert icon={<AlertCircle size="16" />} title="Validation Error" color="red">Enter a valid user filter and zone.</Alert>);
            return;
        }
        setMessage(null);
        saveDelegation.mutate({
            target_user_filter: form.target_user_filter,
            zone_suffix: form.zone_suffix,
            description: form.description || undefined,
        });
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
                            <Button type="submit" loading={saveDelegation.isPending} disabled={!userValid || !zoneValid}>{isEdit ? 'Save' : 'Create'}</Button>
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
    const api = useZonesApi();
    const confirm = useConfirm();

    const orphanedQuery = useQuery({
        queryKey: dyndnsKeys.orphanedZones(),
        queryFn: () => api.listOrphanedZones(),
        enabled: !!api,
    });

    const deleteZone = useApiMutation({
        mutationFn: (zone) => api.deleteOrphanedZone(zone),
        invalidates: [dyndnsKeys.orphanedZones(), dyndnsKeys.zones()],
    });

    async function handleDelete(zone) {
        const ok = await confirm({
            title: '⚠️ Delete orphaned zone?',
            confirmLabel: 'Delete zone',
            message: (<Text size="sm">This permanently deletes the zone <b>{zone}</b> and all of its DNS records. This cannot be undone.</Text>),
        });
        if (ok) deleteZone.mutate(zone);
    }

    if (!api || orphanedQuery.isPending) return <Loading />;
    if (orphanedQuery.isError) return <LoadError query={orphanedQuery} title="Could not load orphaned zones" />;

    const zones = orphanedQuery.data ?? [];

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
                                    loading={deleteZone.isPending && deleteZone.variables === z.zone}
                                    onClick={() => handleDelete(z.zone)}>Delete</Button>
                            </Group>
                        </Paper>
                    ))}
                </Stack>
            )}
        </Stack>
    );
}
