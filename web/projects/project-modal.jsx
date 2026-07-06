import { useEffect, useMemo, useState } from 'react';
import { useClient } from '../providers/client.jsx';
import { Alert, Badge, Button, Grid, Group, Loader, Modal, NumberInput, Select, Stack, Table, Tabs, TagsInput, Text, Textarea } from '@mantine/core';
import { ProjectChangesDiff, TerminationDatePicker } from './component-common.jsx';
import { TokenRoleEditor } from './component-token-role-editor.jsx';
import { normalizeArrayResponse, UNLIMITED_QUOTA } from './util-project.jsx';

const TAB_DETAILS = 'details';
const TAB_RESOURCES = 'resources';
const TAB_ACCESS = 'access';

function FundFromSelect({ eligibleDelegations, requestedResources, projectConfig, value, onChange, error }) {
    const selectData = useMemo(() => {
        if (!eligibleDelegations?.length) return [];

        const autoApproved = [];
        const requiresApproval = [];
        const insufficient = [];

        for (const d of eligibleDelegations) {
            const limit = d.quota?.limit ?? {};
            const usage = d.quota?.usage_by_status ?? {};
            const usedByStatus = (status) => usage[status]?.quota ?? {};
            const approved = usedByStatus('approved');
            const changePending = usedByStatus('change_pending');

            const fits = (projectConfig || []).every(r => {
                const lim = limit[r.id];
                if (lim === UNLIMITED_QUOTA || lim === undefined) return true;
                const used = (approved[r.id] || 0) + (changePending[r.id] || 0);
                const requested = requestedResources?.[r.id] || 0;
                return requested <= lim - used;
            });

            const remaining = (projectConfig || [])
                .filter(r => (limit[r.id] ?? UNLIMITED_QUOTA) !== UNLIMITED_QUOTA)
                .map(r => {
                    const cap = limit[r.id];
                    const used = (approved[r.id] || 0) + (changePending[r.id] || 0);
                    const free = cap - used;
                    return r.unit ? `${free} ${r.unit} ${r.name}` : `${free} ${r.name}`;
                })
                .join(', ');

            const name = d.name || d.id;

            if (d.delegation_strategy === 'pool') {
                requiresApproval.push({ value: d.id, label: name });
            } else if (fits) {
                const suffix = remaining ? ` (${remaining} available)` : '';
                autoApproved.push({ value: d.id, label: `${name}${suffix}` });
            } else {
                insufficient.push({ value: d.id, label: name, disabled: true });
            }
        }

        const result = [];
        if (autoApproved.length) result.push({ group: 'Available now (auto-approved)', items: autoApproved });
        if (requiresApproval.length) result.push({ group: 'Request from pool (requires approval)', items: requiresApproval });
        if (insufficient.length) result.push({ group: 'Insufficient quota', items: insufficient });
        return result;
    }, [eligibleDelegations, requestedResources, projectConfig]);

    if (!eligibleDelegations?.length) {
        return (
            <Select
                label="Fund from"
                required
                data={[]}
                value={null}
                disabled
                description="No delegations available — contact your administrator"
                error={error}
            />
        );
    }

    return (
        <Select
            label="Fund from"
            required
            data={selectData}
            value={value}
            onChange={onChange}
            error={error}
            placeholder="Select a delegation to fund this request"
        />
    );
}

function TabLabel({ label, hasError }) {
    return (
        <Group gap="xs" wrap="nowrap">
            {label}
            {hasError && <Badge size="xs" color="red" circle>!</Badge>}
        </Group>
    );
}

export function RequestModal({ config, eligibleDelegations = [], opened, onClose, onSubmit, initialData, readOnly = false, promoteProject = null }) {
    const { client, sdk } = useClient('projects');
    const isPromote = !!promoteProject;
    const isEdit = !!initialData && !readOnly && !isPromote;
    const [activeTab, setActiveTab] = useState(TAB_DETAILS);
    const [formData, setFormData] = useState({
        quota: {},
        reason: initialData?.reason || '',
        termination_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        authorized_users: initialData?.authorized_users || [],
        funding_delegation_id: eligibleDelegations[0]?.id ?? null,
    });
    const [errors, setErrors] = useState({});
    const [tokenSearchResults, setTokenSearchResults] = useState([]);
    const [isSearchingTokens, setIsSearchingTokens] = useState(false);

    // Promote-mode state
    const [ownerTokens, setOwnerTokens] = useState([]);
    const [promoDelegations, setPromoDelegations] = useState([]);
    const [loadingDelegations, setLoadingDelegations] = useState(false);

    useEffect(() => {
        if (!config) return;
        const defaults = isPromote && promoteProject?.quota
            ? { ...promoteProject.quota }
            : initialData
                ? { ...initialData.pending?.quota || initialData.quota }
                : Object.fromEntries(config.projects.map(r => [r.id, r.default]));

        const terminationDate = initialData?.pending?.termination_date || initialData?.termination_date
            ? new Date(initialData.pending?.termination_date || initialData.termination_date)
            : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

        const authorizedUsers = initialData?.pending?.authorized_users || initialData?.authorized_users || [];

        setFormData(current => ({
            ...current,
            quota: defaults,
            termination_date: terminationDate,
            authorized_users: authorizedUsers,
        }));
    }, [config, initialData, promoteProject?.id]);

    // Reset to first tab when modal opens; pre-fill promote fields
    useEffect(() => {
        if (!opened) return;
        setActiveTab(TAB_DETAILS);
        if (isPromote) {
            setOwnerTokens(promoteProject?.requester_tokens ?? []);
            setPromoDelegations([]);
            setFormData(f => ({ ...f, funding_delegation_id: null }));
            setErrors({});
        }
    }, [opened]);

    // Fetch eligible delegations when owner tokens change (promote mode only)
    useEffect(() => {
        if (!isPromote || !client || !sdk) return;
        if (!ownerTokens.length) {
            setPromoDelegations([]);
            setFormData(f => ({ ...f, funding_delegation_id: null }));
            return;
        }
        let cancelled = false;
        setLoadingDelegations(true);
        sdk.listDelegationsEligibleForOwner({ client, query: { owner_token: ownerTokens } })
            .then(res => {
                if (cancelled) return;
                const list = normalizeArrayResponse(res);
                setPromoDelegations(list);
                setFormData(f => ({ ...f, funding_delegation_id: list[0]?.id ?? null }));
            })
            .catch(() => { if (!cancelled) setPromoDelegations([]); })
            .finally(() => { if (!cancelled) setLoadingDelegations(false); });
        return () => { cancelled = true; };
    }, [ownerTokens.join('\x00'), client, sdk]);

    const detailsErrorKeys = ['reason', 'funding_delegation_id', 'termination_date', 'ownerTokens'];
    const resourceErrorKeys = config?.projects?.map(r => r.id) ?? [];

    const tabHasError = (tab) => {
        if (tab === TAB_DETAILS) return detailsErrorKeys.some(k => errors[k]);
        if (tab === TAB_RESOURCES) return resourceErrorKeys.some(k => errors[k]);
        return false;
    };

    const validateForm = () => {
        const newErrors = {};
        if (isPromote && !ownerTokens.length) {
            newErrors.ownerTokens = 'At least one owner token is required';
        }
        if (!formData.reason || formData.reason.trim().length < 5) {
            newErrors.reason = 'Please provide a reason (at least 5 characters)';
        }
        if (!isEdit && !formData.funding_delegation_id) {
            newErrors.funding_delegation_id = 'Please select a funding delegation';
        }
        if (!formData.termination_date) {
            newErrors.termination_date = 'Please set a termination date';
        } else if (formData.termination_date <= new Date()) {
            newErrors.termination_date = 'Termination date must be in the future';
        }
        config.projects.forEach(r => {
            const val = formData.quota[r.id];
            if (val === null || val === undefined || val < r.min || val > r.max) {
                newErrors[r.id] = r.message;
            }
        });
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSearchTokens = async (query) => {
        if (!query || query.length === 0) {
            setTokenSearchResults([]);
            return;
        }
        setIsSearchingTokens(true);
        try {
            const res = await sdk.searchGroups({
                client,
                query: { q: query, limit: 50 },
            });
            const filtered = (res?.data?.tokens || []).filter(token =>
                typeof token === 'string' &&
                token.toLowerCase().includes(query.toLowerCase()) &&
                !formData.authorized_users.some(au => au.token === token)
            );
            setTokenSearchResults(filtered);
        } finally {
            setIsSearchingTokens(false);
        }
    };

    const handleAddToken = (token, openstackRole = 'member') => {
        if (!formData.authorized_users.some(au => au.token === token)) {
            setFormData({
                ...formData,
                authorized_users: [...formData.authorized_users, { token, openstack_role: openstackRole }],
            });
        }
        setTokenSearchResults([]);
    };

    const handleRemoveToken = (token) => {
        setFormData({
            ...formData,
            authorized_users: formData.authorized_users.filter(au => au.token !== token),
        });
    };

    const handleOpenstackRoleChange = (token, newRole) => {
        setFormData({
            ...formData,
            authorized_users: formData.authorized_users.map(au =>
                au.token === token ? { ...au, openstack_role: newRole || 'member' } : au
            ),
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!validateForm()) return;
        const termDate = formData.termination_date instanceof Date
            ? formData.termination_date
            : new Date(formData.termination_date);
        if (isPromote) {
            onSubmit({
                owner_tokens: ownerTokens,
                funding_delegation_id: formData.funding_delegation_id,
                reason: formData.reason,
                quota: formData.quota,
                termination_date: termDate.toISOString(),
                authorized_users: formData.authorized_users,
            });
        } else {
            onSubmit({
                ...formData,
                authorized_users: formData.authorized_users,
                termination_date: termDate.toISOString(),
            });
        }
    };

    const handleResourceChange = (id, value) => {
        setFormData({ ...formData, quota: { ...formData.quota, [id]: value } });
        if (errors[id]) setErrors({ ...errors, [id]: null });
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={isPromote ? 'Promote OpenStack Project' : readOnly ? 'Request Details' : isEdit ? 'Request Project Change' : 'New Project Request'}
            size="lg"
        >
            <form onSubmit={handleSubmit}>
                <Stack>
                    <Tabs value={activeTab} onChange={setActiveTab}>
                        <Tabs.List mb="md">
                            <Tabs.Tab value={TAB_DETAILS}>
                                <TabLabel label="Details" hasError={tabHasError(TAB_DETAILS)} />
                            </Tabs.Tab>
                            <Tabs.Tab value={TAB_RESOURCES}>
                                <TabLabel label="Resources" hasError={tabHasError(TAB_RESOURCES)} />
                            </Tabs.Tab>
                            <Tabs.Tab value={TAB_ACCESS}>
                                <TabLabel label="Authorize Users/Groups" hasError={tabHasError(TAB_ACCESS)} />
                            </Tabs.Tab>
                        </Tabs.List>

                        <Tabs.Panel value={TAB_DETAILS}>
                            <Stack>
                                {isPromote && (
                                    <>
                                        <Text size="xs" c="dimmed">
                                            OS Project ID: {promoteProject?.os_project_id || '—'}
                                        </Text>
                                        <TagsInput
                                            label="Owner tokens"
                                            description="Type a token (user:email or group:name) and press Enter to add."
                                            placeholder="user:someone@example.com"
                                            value={ownerTokens}
                                            onChange={setOwnerTokens}
                                            error={errors.ownerTokens}
                                            required
                                        />
                                        {loadingDelegations
                                            ? <Loader size="xs" />
                                            : (
                                                <Select
                                                    label="Funding delegation"
                                                    description="Delegations the owner is eligible to request from."
                                                    placeholder={ownerTokens.length
                                                        ? (promoDelegations.length ? 'Select delegation…' : 'No eligible delegations found')
                                                        : 'Enter owner tokens first'}
                                                    data={promoDelegations.map(d => ({ value: d.id, label: d.name || d.id }))}
                                                    value={formData.funding_delegation_id}
                                                    onChange={(v) => {
                                                        setFormData({ ...formData, funding_delegation_id: v });
                                                        if (errors.funding_delegation_id) setErrors({ ...errors, funding_delegation_id: null });
                                                    }}
                                                    error={errors.funding_delegation_id}
                                                    disabled={!promoDelegations.length}
                                                    required
                                                />
                                            )
                                        }
                                    </>
                                )}

                                <Textarea
                                    label={isPromote ? 'Reason' : 'Description'}
                                    required={!readOnly}
                                    disabled={readOnly}
                                    value={formData.reason}
                                    onChange={e => {
                                        setFormData({ ...formData, reason: e.target.value });
                                        if (errors.reason) setErrors({ ...errors, reason: null });
                                    }}
                                    error={errors.reason}
                                    placeholder={isPromote ? 'Describe the purpose of this project…' : 'e.g., Faculty research sandbox'}
                                    description={isPromote ? 'Why is this project being adopted into the managed lifecycle?' : 'Short title shown on the request card (at least 5 characters)'}
                                    rows={isPromote ? 3 : 2}
                                />

                                {!isPromote && !isEdit && !readOnly && (
                                    <FundFromSelect
                                        eligibleDelegations={eligibleDelegations}
                                        requestedResources={formData.quota}
                                        projectConfig={config.projects}
                                        value={formData.funding_delegation_id}
                                        onChange={(v) => {
                                            setFormData({ ...formData, funding_delegation_id: v });
                                            if (errors.funding_delegation_id) setErrors({ ...errors, funding_delegation_id: null });
                                        }}
                                        error={errors.funding_delegation_id}
                                    />
                                )}

                                <TerminationDatePicker
                                    value={formData.termination_date}
                                    error={errors.termination_date}
                                    readOnly={readOnly}
                                    onChange={(d) => {
                                        setFormData({ ...formData, termination_date: d });
                                        if (errors.termination_date) setErrors({ ...errors, termination_date: null });
                                    }}
                                />
                            </Stack>
                        </Tabs.Panel>

                        <Tabs.Panel value={TAB_RESOURCES}>
                            <Grid>
                                {config.projects.map(r => (
                                    <Grid.Col key={r.id} span={{ base: 12, sm: 4 }}>
                                        <NumberInput
                                            label={r.name}
                                            min={r.min}
                                            max={r.max}
                                            disabled={readOnly}
                                            value={formData.quota[r.id]}
                                            onChange={v => handleResourceChange(r.id, v)}
                                            error={errors[r.id]}
                                            description={r.message}
                                        />
                                    </Grid.Col>
                                ))}
                            </Grid>
                        </Tabs.Panel>

                        <Tabs.Panel value={TAB_ACCESS}>
                            <Stack gap="md">
                                <TokenRoleEditor
                                    label=""
                                    authorizedUsers={formData.authorized_users}
                                    onAddToken={handleAddToken}
                                    onRemoveToken={handleRemoveToken}
                                    onOpenstackRoleChange={handleOpenstackRoleChange}
                                    searchResults={tokenSearchResults}
                                    isSearching={isSearchingTokens}
                                    onSearch={handleSearchTokens}
                                    roles={config?.openstackRoles || []}
                                    defaultOpenstackRole="member"
                                    emptyMessage="No users authorized yet. Add at least one entry with an OpenStack role."
                                    readOnly={readOnly}
                                />
                                {isPromote && (promoteProject?.external_group_assignments?.length > 0) && (
                                    <Stack gap="xs">
                                        <Alert color="gray" variant="light" p="xs">
                                            The following OpenStack groups are assigned to this project but are not part of the delegation system.
                                            They will be preserved automatically and cannot be managed here.
                                        </Alert>
                                        <Table fz="xs" withRowBorders={false}>
                                            <Table.Thead>
                                                <Table.Tr>
                                                    <Table.Th>Group</Table.Th>
                                                    <Table.Th>Role</Table.Th>
                                                </Table.Tr>
                                            </Table.Thead>
                                            <Table.Tbody>
                                                {promoteProject.external_group_assignments.map(eg => (
                                                    <Table.Tr key={eg.group_id}>
                                                        <Table.Td>
                                                            <Text size="xs" c="dimmed">
                                                                {eg.group_name || eg.group_id}
                                                                {eg.group_name && eg.group_name !== eg.group_id && (
                                                                    <Text span size="xs" c="dimmed" ml="xs">({eg.group_id})</Text>
                                                                )}
                                                            </Text>
                                                        </Table.Td>
                                                        <Table.Td>
                                                            <Badge size="xs" variant="light" color="gray">{eg.role}</Badge>
                                                        </Table.Td>
                                                    </Table.Tr>
                                                ))}
                                            </Table.Tbody>
                                        </Table>
                                    </Stack>
                                )}
                            </Stack>
                        </Tabs.Panel>
                    </Tabs>

                    {isEdit && initialData.quota && (
                        <ProjectChangesDiff
                            config={config}
                            quotaFrom={initialData.quota}
                            quotaTo={formData.quota}
                            dateFrom={initialData.termination_date}
                            dateTo={formData.termination_date}
                            usersFrom={initialData.authorized_users}
                            usersTo={formData.authorized_users}
                            label="Proposed Changes"
                        />
                    )}

                    <Group justify="flex-end" mt="md">
                        {readOnly
                            ? <Button variant="default" type="button" onClick={onClose}>Close</Button>
                            : (
                                <>
                                    <Button variant="default" type="button" onClick={onClose}>Cancel</Button>
                                    <Button type="submit" color={isPromote ? 'violet' : undefined}>
                                        {isPromote ? 'Promote' : isEdit ? 'Request Change' : 'Submit Request'}
                                    </Button>
                                </>
                            )
                        }
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
}
