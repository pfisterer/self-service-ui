import { useEffect, useState } from 'react';
import { Badge, Button, Checkbox, Grid, Group, Modal, NumberInput, Select, Stack, Tabs, Text, TextInput } from '@mantine/core';
import { TerminationDatePicker } from './component-common.jsx';
import { TokenEditor } from './component-token-editor.jsx';
import { useProjectConfig } from './projects.jsx';
import { UNLIMITED_QUOTA } from './util-project.jsx';

const TAB_DETAILS = 'details';
const TAB_BUDGET = 'budget';
const TAB_SCOPE = 'scope';

// Tab label with an inline error indicator (matches the project request modal).
function TabLabel({ label, hasError }) {
    return (
        <Group gap="xs" wrap="nowrap">
            {label}
            {hasError && <Badge size="xs" color="red" circle>!</Badge>}
        </Group>
    );
}

// Merge resource definitions with existing limits, applying defaults as needed
function buildResourceLimits(projectDefinitions, initialData) {
    const limits = initialData?.quota?.limit || {};
    return Object.fromEntries(
        projectDefinitions.map((resource) => {
            const resourceId = resource.id;
            const existing = limits[resourceId];
            const fallback = resource.default ?? resource.min ?? 0;
            return [resourceId, existing ?? fallback];
        })
    );
}

// Derive which resources are set to unlimited from an existing limits map
function buildNoLimitState(projectDefinitions, initialData) {
    const limits = initialData?.quota?.limit || {};
    return Object.fromEntries(
        projectDefinitions.map((r) => [r.id, limits[r.id] === UNLIMITED_QUOTA])
    );
}

export function DelegationModal({ initialData, parents = [], opened, onClose, onSubmit }) {
    const projectConfig = useProjectConfig();
    const projectDefinitions = projectConfig?.projects || [];
    const delegationStrategies = projectConfig?.delegationStrategies || [];
    const isEdit = !!initialData;

    const [formData, setFormData] = useState(null);
    const [errors, setErrors] = useState({});
    const [noExpiration, setNoExpiration] = useState(false);
    const [noLimit, setNoLimit] = useState({});
    const [activeTab, setActiveTab] = useState(TAB_DETAILS);

    useEffect(() => {
        if (!opened)
            return;

        const hasEndDate = initialData?.end_date !== null && initialData?.end_date !== undefined;
        // Pre-select the parent when there is exactly one to choose from.
        const defaultParent = initialData?.parent_id || (parents.length === 1 ? parents[0].id : "");
        const formData = {
            name: initialData?.name || '',
            parentGroup: defaultParent,
            can_delegate: initialData?.can_delegate ?? false,
            delegation_strategy: initialData?.delegation_strategy || 'pool',
            admin_rules: Array.isArray(initialData?.admin_scope) ? initialData.admin_scope : [],
            quota: buildResourceLimits(projectDefinitions, initialData),
            end_date: hasEndDate ? new Date(initialData.end_date) : null,
        };
        setFormData(formData);
        setNoExpiration(!hasEndDate);
        setNoLimit(buildNoLimitState(projectDefinitions, initialData));
        setErrors({});
        setActiveTab(TAB_DETAILS);
    }, [opened, initialData, parents, projectDefinitions]);

    // Which error keys live on which tab — drives the per-tab error badge and the
    // jump-to-first-error-tab on submit.
    const detailsErrorKeys = ['name', 'parentGroup'];
    const budgetErrorKeys = projectDefinitions.map((r) => r.id);
    const scopeErrorKeys = ['adminScope'];

    const tabHasError = (tab) => {
        if (tab === TAB_DETAILS) return detailsErrorKeys.some((k) => errors[k]);
        if (tab === TAB_BUDGET) return budgetErrorKeys.some((k) => errors[k]);
        if (tab === TAB_SCOPE) return scopeErrorKeys.some((k) => errors[k]);
        return false;
    };

    const validateForm = () => {
        const newErrors = {};
        if (!formData) {
            return newErrors;
        }

        if (!formData.name || formData.name.trim().length < 3) {
            newErrors.name = 'Name must be at least 3 characters';
        }

        if (formData.admin_rules.length === 0) {
            newErrors.adminScope = 'At least one group must be in the admin scope';
        }

        if (!formData.parentGroup) {
            newErrors.parentGroup = 'Please select a parent group';
        }

        projectDefinitions.forEach((resource) => {
            const value = formData.quota?.[resource.id];
            if (value === UNLIMITED_QUOTA)
                return;
            const min = resource.min ?? 0;
            const max = resource.max;
            if (value === null || value === undefined || value < min) {
                newErrors[resource.id] = `Must be at least ${min}`;
                return;
            }
            if (typeof max === 'number' && value > max) {
                newErrors[resource.id] = `Must be at most ${max}`;
            }
        });

        setErrors(newErrors);
        return newErrors;
    };

    // Admin scope rule handlers
    function handleAddAdminRule(rule) {
        if (!rule) return;
        if (!formData.admin_rules.includes(rule)) {
            setFormData({ ...formData, admin_rules: [...formData.admin_rules, rule] });
        }
    }
    function handleRemoveAdminRule(token) {
        setFormData({ ...formData, admin_rules: formData.admin_rules.filter(r => r !== token) });
    }

    function handleNoLimitToggle(resourceId, checked, resource) {
        const value = checked ? UNLIMITED_QUOTA : (resource.default ?? resource.min ?? 0);
        setNoLimit({ ...noLimit, [resourceId]: checked });
        setFormData({ ...formData, quota: { ...formData.quota, [resourceId]: value } });
    }

    const handleSubmit = (e) => {
        e.preventDefault();
        const newErrors = validateForm();
        if (Object.keys(newErrors).length > 0) {
            // Surface the first tab that has an error so nothing fails silently.
            if (detailsErrorKeys.some((k) => newErrors[k])) setActiveTab(TAB_DETAILS);
            else if (scopeErrorKeys.some((k) => newErrors[k])) setActiveTab(TAB_SCOPE);
            else if (budgetErrorKeys.some((k) => newErrors[k])) setActiveTab(TAB_BUDGET);
            return;
        }

        const payload = {
            name: formData.name.trim(),
            can_delegate: formData.can_delegate,
            delegation_strategy: formData.delegation_strategy,
            admin_scope: formData.admin_rules,
            quota: {
                limit: formData.quota,
            },
            end_date: noExpiration ? null : (formData.end_date ? formData.end_date.toISOString() : null),
        };

        onSubmit(payload, formData.parentGroup);
    };

    if (!formData) return null;

    return (
        <Modal opened={opened} onClose={onClose} title={isEdit ? 'Edit Delegation' : 'Create Delegation'} size="lg">
            <form onSubmit={handleSubmit}>
                <Stack>
                    <Tabs value={activeTab} onChange={setActiveTab}>
                        <Tabs.List mb="md">
                            <Tabs.Tab value={TAB_DETAILS}>
                                <TabLabel label="Details" hasError={tabHasError(TAB_DETAILS)} />
                            </Tabs.Tab>
                            <Tabs.Tab value={TAB_BUDGET}>
                                <TabLabel label="Budget" hasError={tabHasError(TAB_BUDGET)} />
                            </Tabs.Tab>
                            <Tabs.Tab value={TAB_SCOPE}>
                                <TabLabel label="Admin Scope" hasError={tabHasError(TAB_SCOPE)} />
                            </Tabs.Tab>
                        </Tabs.List>

                        {/* ---- Details: name, source, strategy, delegation flag, expiry ---- */}
                        <Tabs.Panel value={TAB_DETAILS}>
                            <Stack>
                                <TextInput
                                    label="Delegation Name"
                                    value={formData.name}
                                    required
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    error={errors.name}
                                    placeholder="e.g., CS Research Group"
                                    description="Choose a descriptive name" />

                                <Select
                                    label="Parent Group"
                                    value={formData.parentGroup}
                                    data={parents.map(p => ({ value: p.id, label: p.name }))}
                                    required
                                    onChange={v => setFormData({ ...formData, parentGroup: v })}
                                    error={errors.parentGroup}
                                    description="The parent group that will provide the resources for this delegation"
                                    placeholder={parents.length === 0 ? 'No parent groups available' : 'Select parent group'}
                                    nothingFound="No parent groups"
                                />

                                <Select label="Delegation Strategy" value={formData.delegation_strategy}
                                    onChange={(v) => setFormData({ ...formData, delegation_strategy: v || 'pool' })}
                                    data={delegationStrategies}
                                />

                                <Checkbox label="Can Delegate" checked={formData.can_delegate}
                                    onChange={(e) => setFormData({ ...formData, can_delegate: e.currentTarget.checked })}
                                    description="Allow this delegation to create sub-delegations and further delegate resources"
                                />

                                <Stack gap="xs">
                                    <Checkbox
                                        label="Does not expire"
                                        checked={noExpiration}
                                        onChange={(e) => {
                                            const checked = e.currentTarget.checked;
                                            setNoExpiration(checked);
                                            const end_date = checked ? null : (() => { const d = new Date(); d.setMonth(d.getMonth() + 6); return d; })();
                                            setFormData({ ...formData, end_date });
                                        }}
                                    />

                                    {!noExpiration && (
                                        <TerminationDatePicker
                                            value={formData.end_date}
                                            label="End Date (Optional)"
                                            onChange={(d) => setFormData({ ...formData, end_date: d })}
                                        />
                                    )}
                                </Stack>
                            </Stack>
                        </Tabs.Panel>

                        {/* ---- Budget: per-resource limits ---- */}
                        <Tabs.Panel value={TAB_BUDGET}>
                            <Stack>
                                <Text fw={600}>
                                    {formData.delegation_strategy === 'allowance' ? 'Limits Per User' : 'Total Group Budget'}
                                </Text>

                                <Grid>
                                    {projectDefinitions.map((resource) => (
                                        <Grid.Col key={resource.id} span={{ base: 12, sm: 6 }}>
                                            <Stack gap="xs">
                                                <Checkbox
                                                    label="No limit"
                                                    checked={noLimit[resource.id] ?? false}
                                                    onChange={(e) => handleNoLimitToggle(resource.id, e.currentTarget.checked, resource)}
                                                />

                                                {!noLimit[resource.id] && (
                                                    <NumberInput
                                                        label={resource.unit ? `${resource.name} (${resource.unit})` : resource.name}
                                                        min={resource.min ?? 0}
                                                        max={typeof resource.max === 'number' ? resource.max : undefined}
                                                        value={formData.quota?.[resource.id]}
                                                        onChange={v => setFormData({ ...formData, quota: { ...formData.quota, [resource.id]: v } })}
                                                        error={errors[resource.id]}
                                                        description={resource.message || undefined}
                                                    />
                                                )}
                                            </Stack>
                                        </Grid.Col>
                                    ))}
                                </Grid>
                            </Stack>
                        </Tabs.Panel>

                        {/* ---- Admin Scope: who may approve/manage ---- */}
                        <Tabs.Panel value={TAB_SCOPE}>
                            <TokenEditor
                                label="Admin Scope"
                                description="Groups/users who can approve and manage requests for this delegation"
                                rules={formData.admin_rules}
                                onAddRule={handleAddAdminRule}
                                onRemoveRule={handleRemoveAdminRule}
                                error={errors.adminScope}
                            />
                        </Tabs.Panel>
                    </Tabs>

                    <Group justify="flex-end" mt="md">
                        <Button variant="default" type="button" onClick={onClose}>Cancel</Button>
                        <Button type="submit">
                            {isEdit ? 'Save Changes' : 'Create Group'}
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
}
