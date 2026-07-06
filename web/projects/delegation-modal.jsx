import { useEffect, useState } from 'react';
import { Button, Checkbox, Grid, Group, Modal, NumberInput, Select, Stack, Text, TextInput } from '@mantine/core';
import { TerminationDatePicker } from './component-common.jsx';
import { TokenEditor } from './component-token-editor.jsx';
import { useProjectConfig } from './projects.jsx';
import { UNLIMITED_QUOTA } from './util-project.jsx';

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

    useEffect(() => {
        if (!opened)
            return;

        const hasEndDate = initialData?.end_date !== null && initialData?.end_date !== undefined;
        const formData = {
            name: initialData?.name || '',
            parentGroup: initialData?.parent_id || "",
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
    }, [opened, initialData, parents, projectDefinitions]);


    const validateForm = () => {
        const newErrors = {};
        if (!formData) {
            return false;
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
        return Object.keys(newErrors).length === 0;
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
        if (!validateForm())
            return;

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

                    {/* ---------------------------------------------- */}
                    {/* Delegation Name and Parent Group */}
                    {/* ---------------------------------------------- */}

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

                    {/* ---------------------------------------------- */}
                    {/* Delegation Allowance and Strategy */}
                    {/* ---------------------------------------------- */}

                    <Checkbox label="Can Delegate" checked={formData.can_delegate}
                        onChange={(e) => setFormData({ ...formData, can_delegate: e.currentTarget.checked })}
                        description="Allow this delegation to create sub-delegations and further delegate resources"
                    />

                    <Select label="Delegation Strategy" value={formData.delegation_strategy}
                        onChange={(v) => setFormData({ ...formData, delegation_strategy: v || 'pool' })}
                        data={delegationStrategies}
                    />

                    {/* ---------------------------------------------- */}
                    {/* Admin Scope */}
                    {/* ---------------------------------------------- */}

                    <TokenEditor
                        label="Admin Scope"
                        description="Groups/users who can approve and manage requests for this delegation"
                        rules={formData.admin_rules}
                        onAddRule={handleAddAdminRule}
                        onRemoveRule={handleRemoveAdminRule}
                        error={errors.adminScope}
                    />

                    {/* ---------------------------------------------- */}
                    {/* Duration */}
                    {/* ---------------------------------------------- */}

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

                    {/* ---------------------------------------------- */}
                    {/* Resource Limits */}
                    {/* ---------------------------------------------- */}

                    <div>
                        <Text fw={600} mb="xs">
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

                    </div>

                    {/* ---------------------------------------------- */}
                    {/* Save / Create */}
                    {/* ---------------------------------------------- */}

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
