import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Group, Loader, Paper, Stack, Text } from '@mantine/core';
import { Gift, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { QuotaInputs } from './component-quota-inputs.jsx';
import { BudgetSelect } from './component-budget-select.jsx';
import { EditorHeading } from './component-token-list-editor.jsx';
import { ReasonField, reasonError } from './component-reason-field.jsx';
import { useApiMutation } from '/helper/query-state.jsx';
import { useConfirm } from '/providers/confirm.jsx';
import { formatError } from '/helper/api-error.js';
import { formatDate } from '../format-date.js';
import { useAuth } from '/providers/auth.jsx';
import { availabilityElsewhere, COLOR, freeAmount, getAuthUserEmail, isAvailability, ownerEmail, resourceSummaryText, visibleResources } from './util-project.jsx';

// Allocations are what a project draws from a budget above its own — the
// exception path: a GPU or a network for one student project, more cores than
// its own budget gives, without handing the same to that budget and everyone in
// it. They are part of the project's dialog, in its Resources tab.
//
// Two audiences. A manager further up may grant from the budgets the API names
// (allocation sources): that draft is saved with the dialog. The project's
// holders — its owner and admins — may give an allocation back, which acts at
// once after a confirmation. Managers of the budget in between see the list
// only: they never held what was handed out.

// useAllocationDraft holds what a manager is about to allocate. `manager` turns
// the sources lookup on; for anyone else the draft stays empty.
export function useAllocationDraft({ node, resources, manager, opened }) {
    const { t } = useTranslation();
    const api = useNodesApi();
    const sourcesQuery = useQuery({
        queryKey: [...projectKeys.tree(), 'allocation-sources', node?.id],
        queryFn: () => api.listAllocationSources(node.id),
        enabled: !!api && opened && !!node && manager,
    });
    const sources = sourcesQuery.data ?? [];
    const allocations = node?.allocations || [];
    const allocationFrom = (budgetId) => allocations.find(a => a.budget_id === budgetId);

    // Preselected: a budget the project already draws from, else the nearest.
    const [pickedId, setPickedId] = useState(null);
    const sourceId = pickedId ?? sources.find(s => allocationFrom(s.id))?.id ?? sources[0]?.id ?? null;
    const source = sources.find(s => s.id === sourceId) || null;
    const existing = source ? allocationFrom(source.id) : null;

    // Per budget, what was typed: switching between budgets keeps both.
    const [drafts, setDrafts] = useState({});
    const [reasons, setReasons] = useState({});
    const [checked, setChecked] = useState(false);
    const value = drafts[sourceId] ?? { ...(existing?.limit || {}) };
    const reason = reasons[sourceId] ?? existing?.reason ?? '';

    // What may be allocated from this budget: what it holds, minus an
    // availability the project already gets elsewhere. The room shown is what
    // the budget has free plus what this allocation already takes from it.
    const offered = source
        ? visibleResources(resources, source).filter(r =>
            !isAvailability(r) || !availabilityElsewhere(node, r.id, source.id))
        : [];
    const headroom = source
        ? Object.fromEntries(offered.filter(r => !isAvailability(r))
            .map(r => [r.id, freeAmount(source, r.id) + (existing?.limit?.[r.id] ?? 0)]))
        : null;

    const cleaned = Object.fromEntries(Object.entries(value).filter(([, v]) => (v ?? 0) > 0));
    const nothingAsked = Object.keys(cleaned).length === 0;
    const changed = !!source && JSON.stringify(sortKeys(cleaned)) !== JSON.stringify(sortKeys(existing?.limit || {}));
    // A reason is asked for whatever is granted; removing needs none.
    const problem = changed && !nothingAsked
        ? reasonError(reason, t('projects.allocation.reasonRequired')) : null;

    return {
        sources, loading: sourcesQuery.isLoading, manager, source, sourceId, setSourceId: setPickedId,
        offered, headroom, value, reason, existing,
        setValue: (id, v) => setDrafts(d => ({ ...d, [sourceId]: { ...value, [id]: v } })),
        setReason: (v) => setReasons(r => ({ ...r, [sourceId]: v })),
        changed,
        // Checked on submit: the error shows from then on.
        error: checked ? problem : null,
        validate: () => { setChecked(true); return !problem; },
        payload: () => ({ budgetId: source.id, limit: cleaned, reason: reason.trim() }),
    };
}

const sortKeys = (o) => Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]]));

// AllocationSection shows the project's allocations and, for a manager with
// sources, the form for one. Nothing at all where there is nothing to show.
export function AllocationSection({ node, resources, draft }) {
    const { t } = useTranslation();
    const api = useNodesApi();
    const confirm = useConfirm();
    const { user } = useAuth();
    const me = getAuthUserEmail(user).toLowerCase();
    const holder = (ownerEmail(node) || '').toLowerCase() === me || (node.admin_scope || []).includes(`user:${me}`);
    // Given back while the dialog is open: the dialog's node is not refreshed.
    const [returned, setReturned] = useState([]);
    const allocations = (node.allocations || []).filter(a => !returned.includes(a.budget_id));

    const giveBack = useApiMutation({
        mutationFn: (budgetId) => api.setAllocation(node.id, { budgetId, limit: {}, reason: '' }),
        invalidates: [projectKeys.tree()],
        reportErrors: 'inline',
        onSuccess: (_, budgetId) => setReturned(r => [...r, budgetId]),
    });
    const askGiveBack = async (a) => {
        const ok = await confirm({
            title: t('projects.allocation.giveBackTitle', { name: a.budget_name || a.budget_id }),
            message: t('projects.allocation.giveBackText', { summary: resourceSummaryText(resources, a.limit) }),
            severity: 'warning',
            confirmLabel: t('projects.allocation.giveBack'),
        });
        if (ok) giveBack.mutate(a.budget_id);
    };

    if (allocations.length === 0 && !draft.manager) return null;

    return (
        <Paper withBorder radius="md" p="md">
            <Stack gap="sm">
                <EditorHeading label={t('projects.allocation.sectionTitle')} description={t('projects.allocation.explain')} />

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
                            {/* A manager changes or removes it in the form below. */}
                            {holder && !draft.sources.some(s => s.id === a.budget_id) && (
                                <Button size="compact-xs" variant="light" color={COLOR.negative}
                                    loading={giveBack.isPending && giveBack.variables === a.budget_id}
                                    onClick={() => askGiveBack(a)}>
                                    {t('projects.allocation.giveBack')}
                                </Button>
                            )}
                        </Group>
                    </Paper>
                ))}
                {giveBack.error && <Text c="red" size="xs">{formatError(giveBack.error)}</Text>}

                {draft.manager && draft.loading && <Loader size="sm" />}
                {draft.manager && !draft.loading && draft.sources.length === 0 && (
                    <Alert variant="light" color={COLOR.info} icon={<Info size="16" />} p="xs">
                        <Text size="xs">{t('projects.allocation.noSources')}</Text>
                    </Alert>
                )}
                {draft.source && (
                    <>
                        <BudgetSelect
                            label={t('projects.allocation.from')}
                            description={t('projects.allocation.fromHint')}
                            budgets={draft.sources}
                            value={draft.sourceId}
                            required={false}
                            leftSection={<Gift size="14" />}
                            onChange={draft.setSourceId}
                        />
                        <QuotaInputs resources={draft.offered} value={draft.value} headroom={draft.headroom}
                            onChange={draft.setValue} />
                        <ReasonField
                            label={t('projects.allocation.reason')}
                            description={t('projects.allocation.reasonHint')}
                            value={draft.reason}
                            error={draft.error}
                            onChange={(e) => draft.setReason(e.currentTarget.value)}
                        />
                    </>
                )}
            </Stack>
        </Paper>
    );
}
