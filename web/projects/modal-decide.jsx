import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Anchor, Checkbox, Loader, Stack, Text } from '@mantine/core';
import { Trans, useTranslation } from 'react-i18next';
import { useForm } from '@mantine/form';
import { useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { FormModal } from './component-form-modal.jsx';
import { NodeChangesDiff, NodeUsageBars, QuotaBadges } from './component-common.jsx';
import { QuotaInputs, validateQuota } from './component-quota-inputs.jsx';
import { ReasonField, reasonError } from './component-reason-field.jsx';
import { useNodeMutation } from './use-node-mutation.jsx';
import { formatError } from '/helper/api-error.js';
import { COLOR, isBudget, nodeTitle, ownerEmail } from './util-project.jsx';

// RequestedBy names who asked: the owner of a project, whoever filed a budget
// request — a budget has no owner.
export function RequestedBy({ node }) {
    const { t } = useTranslation();
    const who = ownerEmail(node) || node.created_by;
    if (!who) return null;
    return (
        <Text size="sm">
            <b>{t('projects.approve.requestedByLabel')}</b>{' '}
            <Anchor href={`mailto:${who}`} size="sm">{who}</Anchor>
        </Text>
    );
}

// DecisionModal is where a manager decides on a request or a proposed change:
// what was asked, by whom and what for, what it does to the budget — and then
// approve it (as asked or with another amount) or reject it with a reason. One
// dialog for both answers, so either is given knowing the same facts.
export function DecisionModal({ opened, onClose, onDone, resources, node }) {
    const { t } = useTranslation();
    const api = useNodesApi();
    const isChange = node?.status === 'change_pending';
    // The proposed limit for a change, the requested one for something new.
    const requested = isChange ? (node?.pending?.limit || node?.limit) : node?.limit;
    const [reasonCheck, setReasonCheck] = useState(false);

    const form = useForm({
        initialValues: { adjust: false, quota: { ...requested }, reason: '' },
        validate: (values) => (values.adjust
            ? Object.fromEntries(
                Object.entries(validateQuota(t, resources, values.quota)).map(([id, msg]) => [`quota.${id}`, msg]))
            : {}),
    });

    // The funding budget, for the impact preview; without it the preview is
    // simply left out.
    const parentQuery = useQuery({
        queryKey: projectKeys.node(node?.parent_id),
        queryFn: () => api.getNode(node.parent_id),
        enabled: !!api && !!node?.parent_id && opened,
        retry: false,
    });
    const parent = parentQuery.data;

    // What this approval adds to the budget: for a change only the increase.
    const { adjust, quota, reason } = form.values;
    const incoming = useMemo(() => {
        if (!node) return null;
        const granted = adjust ? quota : requested;
        if (!isChange) return granted;
        return Object.fromEntries((resources || []).map(r => [
            r.id, Math.max(0, (granted?.[r.id] ?? 0) - (node.limit?.[r.id] ?? 0)),
        ]));
    }, [node, isChange, adjust, quota, requested, resources]);

    const approve = useNodeMutation({
        onDone,
        onClose,
        mutationFn: (values) => {
            // A modified limit only where it differs from what was asked.
            const changed = values.adjust
                && (resources || []).some(r => (values.quota[r.id] ?? 0) !== (requested?.[r.id] ?? 0));
            return api.approve(node.id, changed ? values.quota : null);
        },
    });
    const reject = useNodeMutation({
        onDone,
        onClose,
        mutationFn: () => api.reject(node.id, reason.trim()),
    });

    if (!node) return null;

    const reasonProblem = reasonError(reason, t('projects.reject.reasonRequired'));
    const doReject = () => {
        setReasonCheck(true);
        if (!reasonProblem) reject.mutate();
    };
    const failed = approve.error || reject.error;

    return (
        <FormModal
            opened={opened}
            onClose={onClose}
            size="lg"
            title={t(isChange ? 'projects.decide.titleChange' : 'projects.decide.title', { name: nodeTitle(node) })}
            onSubmit={form.onSubmit(values => approve.mutate(values))}
            submitting={approve.isPending}
            submitDisabled={reject.isPending}
            submitError={failed && formatError(failed)}
            submitLabel={t('projects.actions.approve')}
            submitColor={COLOR.positive}
            secondary={{
                label: t('projects.actions.reject'),
                color: COLOR.negative,
                onClick: doReject,
                loading: reject.isPending,
                disabled: approve.isPending,
            }}
        >
            <Stack gap="4">
                <RequestedBy node={node} />
                {node.reason && <Text size="sm"><b>{t('projects.approve.purposeLabel')}</b> {node.reason}</Text>}
                {isBudget(node) && (
                    <Alert color={COLOR.info} variant="light" p="xs">
                        <Trans i18nKey="projects.approve.budgetNote" components={{ 1: <b /> }} />
                    </Alert>
                )}
            </Stack>

            {/* A change shows before and after; something new what it asks for. */}
            {isChange ? (
                <>
                    <NodeChangesDiff
                        resources={resources}
                        limitFrom={node.limit}
                        limitTo={node.pending?.limit}
                        dateFrom={node.termination_date}
                        dateTo={node.pending?.termination_date}
                        usersFrom={node.authorized_users}
                        usersTo={node.pending?.authorized_users}
                        label={t('projects.changes.proposed')}
                    />
                    <Text size="xs" c="dimmed">{t('projects.reject.changeNote')}</Text>
                </>
            ) : (
                <div>
                    <Text size="sm" fw={600} mb="xs">{t('projects.approve.requestedAmount')}</Text>
                    <QuotaBadges resources={resources} quota={requested} />
                </div>
            )}

            <Checkbox
                label={t('projects.approve.adjust')}
                description={t('projects.approve.adjustHint')}
                {...form.getInputProps('adjust', { type: 'checkbox' })}
            />
            {adjust && (
                <QuotaInputs
                    resources={resources}
                    value={quota}
                    errors={Object.fromEntries((resources || []).map(r => [r.id, form.errors[`quota.${r.id}`]]))}
                    onChange={(id, v) => {
                        form.setFieldValue(`quota.${id}`, v);
                        form.clearFieldError(`quota.${id}`);
                    }}
                />
            )}

            {parentQuery.isPending
                ? <Loader size="xs" />
                : parent && (
                    <div>
                        <Text size="sm" fw={600} mb="xs">
                            {t('projects.approve.impact', { name: parent.name || parent.id })}
                        </Text>
                        <NodeUsageBars resources={resources} node={parent} incomingQuota={incoming} />
                    </div>
                )}

            <ReasonField
                label={t('projects.decide.reason')}
                description={t('projects.decide.reasonHint')}
                placeholder={t('projects.reject.reasonPlaceholder')}
                value={reason}
                error={reasonCheck ? reasonProblem : null}
                onChange={(e) => form.setFieldValue('reason', e.currentTarget.value)}
            />
        </FormModal>
    );
}
