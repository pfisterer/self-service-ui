import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Select, Text, Textarea, TextInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useForm, isEmail, isNotEmpty, hasLength } from '@mantine/form';
import { useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { FormModal } from './component-form-modal.jsx';
import { TerminationDatePicker } from './component-common.jsx';
import { QuotaInputs, validateQuota } from './component-quota-inputs.jsx';
import { useApiMutation } from '/helper/query-state.jsx';
import { formatError } from '/helper/api-error.js';
import { COLOR, nodeTitle } from './util-project.jsx';

const DEFAULT_TERM_DAYS = 180;

// AdoptModal brings an imported OpenStack project under management: pick the
// responsible owner and the budget that will fund it. On the next
// synchronization run the project enters the normal approval flow.
export function AdoptModal({ opened, onClose, onDone, resources, node, myBudgets = [] }) {
    const { t } = useTranslation();
    const api = useNodesApi();

    // Best guess for the owner: the first personal account among the project's
    // current OpenStack members. Computed as the initial value rather than
    // written by an effect — the dialog is remounted per node (useNodeDialog's
    // `key`), so "initial" and "current node" are the same thing.
    const firstUser = (node?.authorized_users || []).find(u => u.token?.startsWith('user:'));

    // The default end date is relative to NOW, and "now" is the moment this
    // dialog opens — it is remounted per node, so a lazy initialiser runs
    // exactly once per opening. Reading the clock straight into initialValues
    // would be a render-phase side effect (and a module-level constant would
    // freeze at the time the page was loaded).
    const [defaultTerminationDate] = useState(() => new Date(Date.now() + DEFAULT_TERM_DAYS * 24 * 60 * 60 * 1000));

    const form = useForm({
        initialValues: {
            owner: firstUser ? firstUser.token.slice(5) : '',
            targetId: null,
            reason: node?.os_project_name ? t('projects.adopt.reasonDefault', { name: node.os_project_name }) : '',
            quota: { ...(node?.limit || {}) },
            terminationDate: defaultTerminationDate,
        },
        validate: (values) => ({
            owner: isEmail(t('projects.adopt.ownerRequired'))(values.owner.trim()),
            targetId: isNotEmpty(t('projects.adopt.budgetRequired'))(values.targetId),
            reason: hasLength({ min: 5 }, t('projects.adopt.purposeRequired'))(values.reason.trim()),
            ...Object.fromEntries(
                Object.entries(validateQuota(t, resources, values.quota)).map(([id, msg]) => [`quota.${id}`, msg])),
        }),
    });

    // Budgets the chosen owner could also request under (root-only endpoint;
    // failures are fine — the admin's own budgets remain available).
    const ownerEmail = form.values.owner.trim();
    const ownerBudgetsQuery = useQuery({
        queryKey: projectKeys.eligibleForOwner(`user:${ownerEmail}`),
        queryFn: () => api.listEligibleForOwner([`user:${ownerEmail}`]).then(page => page.items),
        enabled: !!api && opened && ownerEmail.includes('@'),
        retry: false,
    });
    const targetData = useMemo(() => {
        const ownerBudgets = ownerBudgetsQuery.data ?? [];
        const mine = (myBudgets || []).map(b => ({ value: b.id, label: b.name || b.id }));
        const mineIds = new Set(mine.map(m => m.value));
        const owners = ownerBudgets.filter(b => !mineIds.has(b.id)).map(b => ({ value: b.id, label: b.name || b.id }));
        const groups = [];
        if (mine.length) groups.push({ group: t('projects.adopt.budgetsYouManage'), items: mine });
        if (owners.length) groups.push({ group: t('projects.adopt.budgetsOwnerCanRequest'), items: owners });
        return groups;
    }, [myBudgets, ownerBudgetsQuery.data, t]);

    const adopt = useApiMutation({
        mutationFn: (values) => api.adopt(node.id, {
            new_parent_id: values.targetId,
            owner: values.owner.trim(),
            reason: values.reason,
            limit: values.quota,
            termination_date: values.terminationDate ? values.terminationDate.toISOString() : null,
            authorized_users: node.authorized_users || [],
        }),
        invalidates: [projectKeys.tree()],
        reportErrors: 'inline',
        onSuccess: (result) => { onDone?.(result); onClose(); },
        // A 409 means this dialog was acting on a node that has moved on; there
        // is nothing here to correct, so close it and let the refreshed view speak.
        onConflict: () => { onDone?.(); onClose(); },
    });

    if (!node) return null;

    return (
        <FormModal
            opened={opened}
            onClose={onClose}
            size="lg"
            title={t('projects.adopt.title', { name: nodeTitle(node) })}
            onSubmit={form.onSubmit(values => adopt.mutate(values))}
            submitting={adopt.isPending}
            submitError={adopt.error && formatError(adopt.error)}
            submitLabel={t('projects.actions.adopt')}
            submitColor={COLOR.outside}
        >
            <Alert color={COLOR.outside} variant="light" p="xs">
                {t('projects.adopt.note')}
            </Alert>

            <TextInput
                label={t('projects.adopt.owner')}
                description={t('projects.adopt.ownerHint')}
                placeholder={t('projects.adopt.ownerPlaceholder')}
                required
                {...form.getInputProps('owner')}
            />

            <Select
                label={t('projects.adopt.budget')}
                required
                searchable
                data={targetData}
                placeholder={t('projects.adopt.budgetPlaceholder')}
                {...form.getInputProps('targetId')}
            />

            <Textarea label={t('projects.adopt.purpose')} required rows={2} {...form.getInputProps('reason')} />

            <div>
                <Text fw={600} size="sm" mb="xs">{t('projects.adopt.grantedResources')}</Text>
                <QuotaInputs
                    resources={resources}
                    value={form.values.quota}
                    errors={Object.fromEntries((resources || []).map(r => [r.id, form.errors[`quota.${r.id}`]]))}
                    onChange={(id, v) => {
                        form.setFieldValue(`quota.${id}`, v);
                        form.clearFieldError(`quota.${id}`);
                    }}
                />
            </div>

            <TerminationDatePicker {...form.getInputProps('terminationDate')} />

            {(node.external_group_assignments || []).length > 0 && (
                <Alert color="gray" variant="light" p="xs">
                    {t('projects.adopt.externalGroups')}
                </Alert>
            )}
        </FormModal>
    );
}
