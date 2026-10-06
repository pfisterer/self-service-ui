import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Group, Loader, Paper, Select, Stack, Text, Textarea } from '@mantine/core';
import { Gift, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { FormModal } from './component-form-modal.jsx';
import { QuotaInputs } from './component-quota-inputs.jsx';
import { useApiMutation } from '/helper/query-state.jsx';
import { formatError } from '/helper/api-error.js';
import { formatDate } from '../format-date.js';
import { availabilityElsewhere, COLOR, freeAmount, getAuthUserEmail, isAvailability, nodeTitle, ownerEmail, resourceSummaryText, visibleResources } from './util-project.jsx';
import { useAuth } from '/providers/auth.jsx';

// AllocationModal grants, changes or gives back what a project draws from a
// budget above its own — the exception path: a GPU or a network for one
// student project, more cores than its own budget gives, without handing the
// same to that budget and everyone in it.
//
// Two audiences in one dialog. A manager further up gets the form for the
// budgets they may allocate from (the API says which). Everyone else who may
// open it — the owner, the project's admins — sees what the project has by
// allocation and may give it back. The managers of the budget in between see
// the same list but no button: they never held what was handed out.
export function AllocationModal({ opened, onClose, onDone, node, resources }) {
    const { t } = useTranslation();
    const api = useNodesApi();
    const { user } = useAuth();
    const me = getAuthUserEmail(user).toLowerCase();
    // The project's holders may give an allocation back; the managers of the
    // budget in between may not — they never held it.
    const holder = !!node && ((ownerEmail(node) || '').toLowerCase() === me
        || (node.admin_scope || []).includes(`user:${me}`));

    const sourcesQuery = useQuery({
        queryKey: [...projectKeys.tree(), 'allocation-sources', node?.id],
        queryFn: () => api.listAllocationSources(node.id),
        enabled: !!api && opened && !!node,
    });
    const sources = sourcesQuery.data ?? [];
    const allocations = node?.allocations || [];
    const allocationFrom = (budgetId) => allocations.find(a => a.budget_id === budgetId);

    // Preselected: a budget the project already draws from (to change it), else
    // the nearest one.
    const [pickedId, setPickedId] = useState(null);
    const sourceId = pickedId
        ?? sources.find(s => allocationFrom(s.id))?.id
        ?? sources[0]?.id
        ?? null;
    const source = sources.find(s => s.id === sourceId) || null;
    const existing = source ? allocationFrom(source.id) : null;

    // Per budget, what was typed: switching between budgets keeps both.
    const [drafts, setDrafts] = useState({});
    const [reasons, setReasons] = useState({});
    const value = drafts[sourceId] ?? { ...(existing?.limit || {}) };
    const reason = reasons[sourceId] ?? existing?.reason ?? '';

    // What may be allocated from this budget: what it holds, minus an
    // availability the project already gets elsewhere.
    const offered = source
        ? visibleResources(resources, source).filter(r =>
            !isAvailability(r) || !availabilityElsewhere(node, r.id, source.id))
        : [];
    // The room shown is what the budget has free plus what this allocation
    // already takes from it — that is how far it can be raised.
    const headroom = source
        ? Object.fromEntries(offered.filter(r => !isAvailability(r))
            .map(r => [r.id, freeAmount(source, r.id) + (existing?.limit?.[r.id] ?? 0)]))
        : null;

    const save = useApiMutation({
        mutationFn: ({ budgetId, limit, why }) => api.setAllocation(node.id, { budgetId, limit, reason: why }),
        invalidates: [projectKeys.tree()],
        reportErrors: 'inline',
        onSuccess: (result) => { onDone?.(result); onClose(); },
        onConflict: () => { onDone?.(); onClose(); },
    });

    if (!node) return null;

    const cleaned = Object.fromEntries(Object.entries(value).filter(([, v]) => (v ?? 0) > 0));
    const nothingAsked = Object.keys(cleaned).length === 0;
    const reasonMissing = !nothingAsked && reason.trim().length < 5;

    const submit = (e) => {
        e.preventDefault();
        if (!source || reasonMissing) return;
        save.mutate({ budgetId: source.id, limit: cleaned, why: reason.trim() });
    };

    return (
        <FormModal
            opened={opened}
            onClose={onClose}
            size="lg"
            title={t('projects.allocation.title', { name: nodeTitle(node) })}
            onSubmit={submit}
            submitting={save.isPending}
            submitError={save.error && formatError(save.error)}
            submitLabel={existing && nothingAsked ? t('projects.allocation.remove') : t('projects.allocation.save')}
            submitColor={existing && nothingAsked ? COLOR.negative : undefined}
            submitDisabled={!source || (!existing && nothingAsked) || reasonMissing}
        >
            <Text size="sm" c="dimmed">{t('projects.allocation.explain')}</Text>

            {/* What the project has by allocation already, with a way for its
                holders to give it back. A manager of the allocating budget
                changes or removes it in the form below instead. */}
            {allocations.length > 0 && (
                <Stack gap="xs">
                    {allocations.map(a => (
                        <Paper key={a.budget_id} withBorder p="xs" radius="sm">
                            <Group justify="space-between" wrap="nowrap" align="flex-start">
                                <div>
                                    <Text size="sm" fw={600}>{a.budget_name || a.budget_id}</Text>
                                    <Text size="xs">{resourceSummaryText(resources, a.limit)}</Text>
                                    <Text size="xs" c="dimmed">
                                        {t('projects.allocation.grantedBy', { who: a.granted_by, date: formatDate(a.granted_at) })}
                                        {a.reason ? ` — ${a.reason}` : ''}
                                    </Text>
                                </div>
                                {holder && !sources.some(s => s.id === a.budget_id) && (
                                    <Button size="compact-xs" variant="light" color={COLOR.negative} loading={save.isPending}
                                        onClick={() => save.mutate({ budgetId: a.budget_id, limit: {}, why: '' })}>
                                        {t('projects.allocation.giveBack')}
                                    </Button>
                                )}
                            </Group>
                        </Paper>
                    ))}
                </Stack>
            )}

            {sourcesQuery.isLoading && <Loader size="sm" />}

            {!sourcesQuery.isLoading && sources.length === 0 && (
                <Alert variant="light" color={COLOR.info} icon={<Info size="16" />} p="xs">
                    <Text size="xs">{t('projects.allocation.noSources')}</Text>
                </Alert>
            )}

            {source && (
                <>
                    <Select
                        label={t('projects.allocation.from')}
                        description={t('projects.allocation.fromHint')}
                        data={sources.map(s => ({ value: s.id, label: s.name || s.id }))}
                        value={sourceId}
                        allowDeselect={false}
                        leftSection={<Gift size="14" />}
                        onChange={setPickedId}
                    />
                    <QuotaInputs
                        resources={offered}
                        value={value}
                        headroom={headroom}
                        onChange={(id, v) => setDrafts(d => ({ ...d, [sourceId]: { ...value, [id]: v } }))}
                    />
                    <Textarea
                        label={t('projects.allocation.reason')}
                        description={t('projects.allocation.reasonHint')}
                        required={!nothingAsked}
                        rows={2}
                        value={reason}
                        error={reasonMissing && reason.length > 0 ? t('projects.allocation.reasonRequired') : null}
                        onChange={(e) => { const v = e.currentTarget.value; setReasons(r => ({ ...r, [sourceId]: v })); }}
                    />
                </>
            )}
        </FormModal>
    );
}
