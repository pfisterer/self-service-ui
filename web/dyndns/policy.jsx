import { useState, useMemo } from 'react';
import { useLocation, useRoute } from 'wouter';
import { formatError } from '/helper/api-error.js';
import { useQuery } from '@tanstack/react-query';
import { useZonesApi } from '/dyndns/api-zones.jsx';
import { usePolicyRulesQuery } from '/dyndns/use-policy.jsx';
import { ZoneEventsAdminPanel } from '/dyndns/zone-events-admin.jsx';
import { dyndnsKeys } from '/dyndns/query-keys.js';
import { Loading, LoadError, useApiMutation } from '/helper/query-state.jsx';
import { useConfirm } from '/providers/confirm.jsx';
import { isValidDnsName, isValidZonePattern, isValidUserFilter, zoneWithinAnySuffix } from '/helper/dns-validation.js';
import { Trash2, Edit, Plus, Search, X, AlertCircle } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { Container, Title, Text, Button, Group, Stack, TextInput, Checkbox, SimpleGrid, Card, Modal, Alert, ActionIcon, Paper, Tabs, Badge, Table } from '@mantine/core';


// --- Main Component: DnsPolicy ---
export function DnsPolicy() {
    const { t } = useTranslation();
    const api = useZonesApi();
    const [editingRule, setEditingRule] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchFilter, setSearchFilter] = useState('');

    // The active tab is the URL (…/administration/<tab>), not component state: a
    // reload or a shared link must land on the same tab. Unknown or
    // admin-only values fall back to the rules tab below, once the
    // permissions are known.
    const [, params] = useRoute('/administration/:tab');
    const [, navigate] = useLocation();
    const requestedTab = params?.tab ?? 'rules';

    // The rules AND the caller's permissions come from one response, so they
    // stay one cache entry — three separate useStates used to hold them and
    // could in principle disagree. The header asks the same question to decide
    // whether to offer this page, hence the shared hook.
    const policyQuery = usePolicyRulesQuery();

    // Closing the dialog is all that is left to do here: the mutations
    // invalidate the rule list themselves.
    const handleSuccess = () => {
        setEditingRule(null);
        setIsModalOpen(false);
    }

    const rules = useMemo(() => policyQuery.data?.rules ?? [], [policyQuery.data]);
    const isEditAllowed = !!policyQuery.data?.edit_allowed;
    const isSuperAdmin = !!policyQuery.data?.is_super_admin;

    const adminTabs = ['delegations', 'orphaned', 'zone-events'];
    const activeTab = (requestedTab === 'rules' || (isSuperAdmin && adminTabs.includes(requestedTab)))
        ? requestedTab : 'rules';
    const selectTab = (tab) => navigate(tab === 'rules' ? '/administration' : `/administration/${tab}`);

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
    if (policyQuery.isError) return <LoadError query={policyQuery} title={t('dyndns.policy.loadError')} />;

    return (
        <Container fluid py="md" px="xl">
            <Stack gap="lg">
                <Title order={2}>{t('dyndns.policy.title')}</Title>

                <Tabs value={activeTab} onChange={selectTab}>
                    <Tabs.List>
                        <Tabs.Tab value="rules">{t('dyndns.policy.tabRules')}</Tabs.Tab>
                        {isSuperAdmin && <Tabs.Tab value="delegations">{t('dyndns.policy.tabDelegations')}</Tabs.Tab>}
                        {isSuperAdmin && <Tabs.Tab value="orphaned">{t('dyndns.policy.tabOrphaned')}</Tabs.Tab>}
                        {isSuperAdmin && <Tabs.Tab value="zone-events">{t('dyndns.policy.tabEvents')}</Tabs.Tab>}
                    </Tabs.List>

                    <Tabs.Panel value="rules" pt="md">
                        <Stack gap="lg">
                            {!isSuperAdmin && <DelegatedToYou />}
                            <Group justify="space-between" align="flex-start">
                                <Text size="sm" c="dimmed">
                                    {isEditAllowed
                                        ? t('dyndns.policy.introEditable')
                                        : t('dyndns.policy.introReadOnly')}
                                </Text>
                                {isEditAllowed && (
                                    <Button leftSection={<Plus size="16" />} onClick={() => { setEditingRule(null); setIsModalOpen(true); }}>
                                        {t('dyndns.policy.newRule')}
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

                    {isSuperAdmin && (
                        <Tabs.Panel value="zone-events" pt="md">
                            <ZoneEventsAdminPanel />
                        </Tabs.Panel>
                    )}
                </Tabs>

                {isModalOpen && (
                    <RuleFormModal
                        isSuperAdmin={isSuperAdmin}
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
    const { t } = useTranslation();
    return (
        <TextInput
            placeholder={t('dyndns.policy.searchPlaceholder')}
            value={searchFilter}
            onChange={(e) => onSearchChange(e.target.value)}
            leftSection={<Search size="16" />}
            rightSection={searchFilter && (
                <ActionIcon variant="subtle" onClick={() => onSearchChange('')}>
                    <X size="16" />
                </ActionIcon>
            )}
            description={t('dyndns.policy.rulesShown', { shown: filteredCount, total: totalCount })}
        />
    );
}

// --- Rule List Component ---
function RuleList({ rules, isSuperAdmin, onEdit }) {
    const { t } = useTranslation();
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
            title: t('dyndns.policy.deleteRuleTitle'),
            confirmLabel: t('dyndns.policy.deleteRuleConfirm'),
            message: (
                <Stack gap="md">
                    <Alert color="red" icon={<AlertCircle size="16" />} title={t('dyndns.policy.orphanWarningTitle')}>
                        <Trans i18nKey="dyndns.policy.orphanWarning" components={{ 1: <b />, 2: <b /> }} />
                    </Alert>
                    <Stack gap={6}>
                        <Text size="sm" c="dimmed">{t('dyndns.policy.aboutToDelete')}</Text>
                        <Text fw={600}>{rule.description || t('dyndns.policy.noDescription')}</Text>
                        <Group gap="xs" wrap="nowrap"><Text size="sm" c="dimmed" w={110}>{t('dyndns.policy.fieldZonePattern')}</Text><Text component="code" style={{ fontSize: '0.85em' }}>{rule.zone_pattern}</Text></Group>
                        <Group gap="xs" wrap="nowrap"><Text size="sm" c="dimmed" w={110}>{t('dyndns.policy.fieldAppliesTo')}</Text><Text component="code" style={{ fontSize: '0.85em' }}>{rule.target_user_filter}</Text></Group>
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
                    <Text size="lg" c="dimmed">{t('dyndns.policy.noRules')}</Text>
                    {isSuperAdmin && (<Text size="sm" c="dimmed">{t('dyndns.policy.noRulesHint')}</Text>)}
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
                        <Table.Th>{t('dyndns.policy.colZonePattern')}</Table.Th>
                        <Table.Th>{t('dyndns.policy.colZoneSoa')}</Table.Th>
                        <Table.Th>{t('dyndns.policy.colAppliesTo')}</Table.Th>
                        <Table.Th>{t('dyndns.policy.colSubdomains')}</Table.Th>
                        <Table.Th>{t('dyndns.policy.colSharing')}</Table.Th>
                        <Table.Th>{t('dyndns.policy.colDescription')}</Table.Th>
                        {isSuperAdmin && <Table.Th w={90} style={{ textAlign: 'right' }}>{t('dyndns.policy.colActions')}</Table.Th>}
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
                                    title={t('dyndns.policy.subdomainsTooltip')}>
                                    {rule.allow_subdomains ? t('dyndns.policy.yes') : t('dyndns.policy.no')}
                                </Badge>
                            </Table.Td>
                            <Table.Td>
                                <Badge size="sm" variant="light" color={rule.sharing_allowed ? 'green' : 'gray'}
                                    title={t('dyndns.policy.sharingTooltip')}>
                                    {rule.sharing_allowed ? t('dyndns.policy.yes') : t('dyndns.policy.no')}
                                </Badge>
                            </Table.Td>
                            <Table.Td><Text size="sm" c="dimmed">{rule.description}</Text></Table.Td>
                            {isSuperAdmin && (
                                <Table.Td>
                                    <Group gap="4" justify="flex-end" wrap="nowrap">
                                        <ActionIcon size="sm" variant="light" color="blue" onClick={() => onEdit(rule)} title={t('dyndns.actions.edit')}>
                                            <Edit size="16" />
                                        </ActionIcon>
                                        <ActionIcon size="sm" variant="light" color="red" onClick={() => handleDelete(rule)}
                                            loading={deleteRule.isPending && deleteRule.variables === rule.id}
                                            disabled={deleteRule.isPending} title={t('dyndns.actions.delete')}>
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
function RuleFormModal({ ruleToEdit, isSuperAdmin, onFormSuccess, onClose }) {
    const { t } = useTranslation();
    const api = useZonesApi();
    const isEditMode = ruleToEdit !== null;

    // A delegated (non-admin) editor may only place rules whose SOA lies at or
    // below one of their delegated zones — the server enforces this with a
    // bare 403, so the modal explains the boundary BEFORE submitting, against
    // the same list the "Delegated to you" panel shows. Fails open while the
    // list is loading or empty: the server stays the authority.
    const delegationsQuery = useQuery({
        queryKey: dyndnsKeys.delegations(),
        queryFn: () => api.listDelegations(),
        enabled: !!api && !isSuperAdmin,
        retry: 1,
    });
    const delegationSuffixes = useMemo(
        () => (isSuperAdmin ? [] : (delegationsQuery.data ?? []).map(d => d.zone_suffix)),
        [isSuperAdmin, delegationsQuery.data]);

    const [rule, setRule] = useState(() => ({
        zone_pattern: '',
        // With exactly one delegated zone the SOA is not a choice — pre-fill
        // it. Best effort by design: the list is normally already cached by
        // the "Delegated to you" panel next to the button that opened this
        // modal; on a cold cache there is simply no pre-fill.
        zone_soa: (!ruleToEdit && delegationSuffixes.length === 1) ? delegationSuffixes[0] : '',
        target_user_filter: '',
        allow_subdomains: false,
        sharing_allowed: false,
        description: '',
        ...(ruleToEdit || {})
    }));
    const [message, setMessage] = useState(null);

    // Derived, not stored. These were three useStates kept in sync by hand from
    // an effect AND from every change handler — two code paths writing the same
    // three flags, which is how they get to disagree.
    const zoneValid = isValidZonePattern(rule.zone_pattern);
    const zoneSoaValid = isValidDnsName(rule.zone_soa);
    const userFilterValid = isValidUserFilter(rule.target_user_filter);
    const soaInScope = delegationSuffixes.length === 0 || zoneWithinAnySuffix(rule.zone_soa, delegationSuffixes);

    const saveRule = useApiMutation({
        mutationFn: (body) => isEditMode
            ? api.updatePolicyRule(rule.id, body)
            : api.createPolicyRule(body),
        // A rule decides which zones exist for whom, so the zone list changes too.
        invalidates: [dyndnsKeys.policyRules(), dyndnsKeys.zones()],
        onSuccess: () => {
            setMessage(<Alert title={t('dyndns.messages.success')} color="green">{isEditMode ? t('dyndns.ruleForm.updated') : t('dyndns.ruleForm.created')}</Alert>);
            setTimeout(() => onFormSuccess(), 700);
        },
        // The server's message is data, not UI text — it is shown as it arrives.
        onError: (error) => setMessage(
            <Alert icon={<AlertCircle size="16" />} title={t('dyndns.messages.error')} color="red">{formatError(error)}</Alert>
        ),
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setRule(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setMessage(null);

        if (!zoneValid || !zoneSoaValid || !userFilterValid || !soaInScope) {
            setMessage(<Alert icon={<AlertCircle size="16" />} title={t('dyndns.messages.validationError')} color="red">{t('dyndns.ruleForm.invalidFields')}</Alert>);
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
        <Modal opened={true} onClose={onClose} title={isEditMode ? t('dyndns.ruleForm.editTitle') : t('dyndns.ruleForm.createTitle')} size="lg">
            <Stack gap="md">
                {message}

                <form onSubmit={handleSubmit}>
                    <Stack gap="md">
                        <TextInput
                            label={t('dyndns.ruleForm.zoneLabel')}
                            name="zone_pattern"
                            value={rule.zone_pattern}
                            onChange={handleChange}
                            required
                            placeholder={t('dyndns.ruleForm.zonePlaceholder')}
                            description={t('dyndns.ruleForm.zoneDescription')}
                            error={!zoneValid && t('dyndns.ruleForm.zoneError')}
                        />

                        <TextInput
                            label={t('dyndns.ruleForm.soaLabel')}
                            name="zone_soa"
                            value={rule.zone_soa}
                            onChange={handleChange}
                            required
                            placeholder={t('dyndns.ruleForm.soaPlaceholder')}
                            description={t('dyndns.ruleForm.soaDescription')}
                            error={(!zoneSoaValid && t('dyndns.validation.dnsName'))
                                || (!soaInScope && t('dyndns.ruleForm.soaOutOfScope', { zones: delegationSuffixes.join(', ') }))}
                        />

                        <TextInput
                            label={t('dyndns.ruleForm.userFilterLabel')}
                            name="target_user_filter"
                            value={rule.target_user_filter}
                            onChange={handleChange}
                            required
                            placeholder={t('dyndns.ruleForm.userFilterPlaceholder')}
                            description={t('dyndns.ruleForm.userFilterDescription')}
                            error={!userFilterValid && t('dyndns.validation.userFilter')}
                        />

                        <Checkbox
                            label={t('dyndns.ruleForm.allowSubdomains')}
                            description={t('dyndns.ruleForm.allowSubdomainsDescription')}
                            checked={!!rule.allow_subdomains}
                            onChange={(e) => { const v = e.currentTarget.checked; setRule(prev => ({ ...prev, allow_subdomains: v })); }}
                        />

                        <Checkbox
                            label={t('dyndns.ruleForm.allowSharing')}
                            description={t('dyndns.ruleForm.allowSharingDescription')}
                            checked={!!rule.sharing_allowed}
                            onChange={(e) => { const v = e.currentTarget.checked; setRule(prev => ({ ...prev, sharing_allowed: v })); }}
                        />

                        <TextInput
                            label={t('dyndns.ruleForm.descriptionLabel')}
                            name="description"
                            value={rule.description || ''}
                            onChange={handleChange}
                            placeholder={t('dyndns.ruleForm.descriptionPlaceholder')}
                        />

                        <Group justify="flex-end" mt="md">
                            <Button variant="default" onClick={onClose}>{t('dyndns.actions.cancel')}</Button>
                            <Button
                                type="submit"
                                loading={saveRule.isPending}
                                disabled={!zoneValid || !zoneSoaValid || !userFilterValid || !soaInScope}>
                                {isEditMode ? t('dyndns.ruleForm.save') : t('dyndns.ruleForm.create')}
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

// DelegatedToYou tells a NON-admin what was delegated to them: the server
// filters the same delegations endpoint down to the caller's entries and
// reduces them to zone suffix + description (the target filter is admin
// data). Best-effort context like the zone-events banner — while loading, on
// error, or with nothing delegated it renders nothing rather than making the
// rules tab look broken.
function DelegatedToYou() {
    const { t } = useTranslation();
    const api = useZonesApi();
    const delegationsQuery = useQuery({
        queryKey: dyndnsKeys.delegations(),
        queryFn: () => api.listDelegations(),
        enabled: !!api,
        retry: 1,
    });

    const delegations = delegationsQuery.data ?? [];
    if (delegations.length === 0) return null;

    return (
        <Paper p="md" withBorder>
            <Text fw={600} mb={4}>{t('dyndns.delegatedToYou.title')}</Text>
            <Text size="sm" c="dimmed" mb="xs">
                {t('dyndns.delegatedToYou.intro')}
            </Text>
            <Stack gap={4}>
                {delegations.map(d => (
                    <Group key={d.zone_suffix} gap="xs" wrap="nowrap">
                        <Badge variant="light" style={{ textTransform: 'none', flexShrink: 0 }}>{d.zone_suffix}</Badge>
                        {d.description && <Text size="sm" c="dimmed">{d.description}</Text>}
                    </Group>
                ))}
            </Stack>
        </Paper>
    );
}

// ============================================================
// Delegation Policies (super-admin management). Grants users the right to
// manage policy rules for a zone (and its subdomains).
// ============================================================
function DelegationManagement() {
    const { t } = useTranslation();
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
            title: t('dyndns.delegations.deleteTitle'),
            confirmLabel: t('dyndns.delegations.deleteConfirm'),
            message: t('dyndns.delegations.deleteMessage', {
                user: delegation.target_user_filter, zone: delegation.zone_suffix,
            }),
        });
        if (ok) deleteDelegation.mutate(delegation.id);
    }

    if (!api || delegationsQuery.isPending) return <Loading />;
    if (delegationsQuery.isError) return <LoadError query={delegationsQuery} title={t('dyndns.delegations.loadError')} />;

    const delegations = delegationsQuery.data ?? [];

    return (
        <Stack gap="md">
            <Group justify="space-between" align="flex-start">
                <Text size="sm" c="dimmed">{t('dyndns.delegations.intro')}</Text>
                <Button leftSection={<Plus size="16" />} onClick={() => { setEditing(null); setModalOpen(true); }}>{t('dyndns.delegations.new')}</Button>
            </Group>

            {delegations.length === 0 ? (
                <Paper p="xl" withBorder><Text ta="center" c="dimmed">{t('dyndns.delegations.empty')}</Text></Paper>
            ) : (
                <Table.ScrollContainer minWidth={600}>
                    <Table striped highlightOnHover withTableBorder stickyHeader verticalSpacing="sm" horizontalSpacing="md">
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>{t('dyndns.delegations.colUser')}</Table.Th>
                                <Table.Th>{t('dyndns.delegations.colZone')}</Table.Th>
                                <Table.Th>{t('dyndns.delegations.colDescription')}</Table.Th>
                                <Table.Th w={90} style={{ textAlign: 'right' }}>{t('dyndns.delegations.colActions')}</Table.Th>
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
                                            <ActionIcon size="sm" variant="light" color="blue" onClick={() => { setEditing(d); setModalOpen(true); }} title={t('dyndns.actions.edit')}>
                                                <Edit size="16" />
                                            </ActionIcon>
                                            <ActionIcon size="sm" variant="light" color="red" onClick={() => handleDelete(d)} title={t('dyndns.actions.delete')}>
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
    const { t } = useTranslation();
    const api = useZonesApi();
    const isEdit = delegationToEdit !== null;
    const [form, setForm] = useState({ target_user_filter: '', zone_suffix: '', description: '', ...(delegationToEdit || {}) });
    const [message, setMessage] = useState(null);

    const saveDelegation = useApiMutation({
        mutationFn: (body) => isEdit ? api.updateDelegation(form.id, body) : api.createDelegation(body),
        invalidates: [dyndnsKeys.delegations()],
        onSuccess: () => {
            setMessage(<Alert title={t('dyndns.messages.success')} color="green">{isEdit ? t('dyndns.delegationForm.updated') : t('dyndns.delegationForm.created')}</Alert>);
            setTimeout(onSuccess, 700);
        },
        // The server's message is data, not UI text — it is shown as it arrives.
        onError: (error) => setMessage(
            <Alert icon={<AlertCircle size="16" />} title={t('dyndns.messages.error')} color="red">{formatError(error)}</Alert>
        ),
    });

    const userValid = isValidUserFilter(form.target_user_filter);
    const zoneValid = isValidDnsName(form.zone_suffix);

    const handleChange = (e) => { const { name, value } = e.target; setForm(prev => ({ ...prev, [name]: value })); };

    function handleSubmit(e) {
        e.preventDefault();
        if (!userValid || !zoneValid) {
            setMessage(<Alert icon={<AlertCircle size="16" />} title={t('dyndns.messages.validationError')} color="red">{t('dyndns.delegationForm.invalidFields')}</Alert>);
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
        <Modal opened={true} onClose={onClose} title={isEdit ? t('dyndns.delegationForm.editTitle') : t('dyndns.delegationForm.createTitle')} size="lg">
            <Stack gap="md">
                {message}
                <form onSubmit={handleSubmit}>
                    <Stack gap="md">
                        <TextInput
                            label={t('dyndns.delegationForm.userFilterLabel')} name="target_user_filter" value={form.target_user_filter} onChange={handleChange} required
                            placeholder={t('dyndns.delegationForm.userFilterPlaceholder')}
                            description={t('dyndns.delegationForm.userFilterDescription')}
                            error={!userValid && form.target_user_filter && t('dyndns.validation.userFilter')}
                        />
                        <TextInput
                            label={t('dyndns.delegationForm.zoneLabel')} name="zone_suffix" value={form.zone_suffix} onChange={handleChange} required
                            placeholder={t('dyndns.delegationForm.zonePlaceholder')}
                            description={t('dyndns.delegationForm.zoneDescription')}
                            error={!zoneValid && form.zone_suffix && t('dyndns.validation.dnsName')}
                        />
                        <TextInput label={t('dyndns.delegationForm.descriptionLabel')} name="description" value={form.description || ''} onChange={handleChange} placeholder={t('dyndns.delegationForm.descriptionPlaceholder')} />
                        <Group justify="flex-end" mt="md">
                            <Button variant="default" onClick={onClose}>{t('dyndns.actions.cancel')}</Button>
                            <Button type="submit" loading={saveDelegation.isPending} disabled={!userValid || !zoneValid}>{isEdit ? t('dyndns.delegationForm.save') : t('dyndns.delegationForm.create')}</Button>
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
    const { t } = useTranslation();
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
            title: t('dyndns.orphaned.deleteTitle'),
            confirmLabel: t('dyndns.orphaned.deleteConfirm'),
            message: (
                <Text size="sm">
                    <Trans i18nKey="dyndns.orphaned.deleteMessage" values={{ zone }} components={{ 1: <b /> }} />
                </Text>
            ),
        });
        if (ok) deleteZone.mutate(zone);
    }

    if (!api || orphanedQuery.isPending) return <Loading />;
    if (orphanedQuery.isError) return <LoadError query={orphanedQuery} title={t('dyndns.orphaned.loadError')} />;

    const zones = orphanedQuery.data ?? [];

    return (
        <Stack gap="md">
            <Text size="sm" c="dimmed">{t('dyndns.orphaned.intro')}</Text>
            {zones.length === 0 ? (
                <Paper p="xl" withBorder><Text ta="center" c="dimmed">{t('dyndns.orphaned.empty')}</Text></Paper>
            ) : (
                <Stack gap="xs">
                    {zones.map(z => (
                        <Paper key={z.zone} p="sm" withBorder>
                            <Group justify="space-between" wrap="nowrap">
                                <div>
                                    <Text size="sm"><code style={{ fontSize: '0.85em' }}>{z.zone}</code></Text>
                                    <Text size="xs" c="dimmed">{t('dyndns.orphaned.owner', { user: z.user })}</Text>
                                </div>
                                <Button size="xs" color="red" variant="light" leftSection={<Trash2 size="14" />}
                                    loading={deleteZone.isPending && deleteZone.variables === z.zone}
                                    onClick={() => handleDelete(z.zone)}>{t('dyndns.actions.delete')}</Button>
                            </Group>
                        </Paper>
                    ))}
                </Stack>
            )}
        </Stack>
    );
}
