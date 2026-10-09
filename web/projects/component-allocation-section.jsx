import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Divider, Group, Paper, Stack, Text } from '@mantine/core';
import { Gift } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNodesApi } from './api-nodes.jsx';
import { projectKeys } from './query-keys.js';
import { QuotaInputs } from './component-quota-inputs.jsx';
import { BudgetSelect } from './component-budget-select.jsx';
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
// Shown only where it applies: the project has an allocation, or the viewer
// manages a budget above the project's own (the API names those as sources).
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
    // The form is closed until someone grants or changes one: open, it would
    // read as a second set of the project's own resources.
    const [open, setOpen] = useState(false);
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
    const changed = open && !!source && JSON.stringify(sortKeys(cleaned)) !== JSON.stringify(sortKeys(existing?.limit || {}));
    // A reason is asked for whatever is granted; removing needs none.
    const problem = changed && !nothingAsked
        ? reasonError(reason, t('projects.allocation.reasonRequired')) : null;

    return {
        sources, loading: sourcesQuery.isLoading, manager, source, sourceId, setSourceId: setPickedId,
        open,
        // Opens the form, on a given budget's allocation or the preselected one.
        start: (budgetId) => { if (budgetId) setPickedId(budgetId); setOpen(true); },
        // Closes it and forgets what was typed.
        discard: () => { setOpen(false); setDrafts({}); setReasons({}); setChecked(false); },
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

    // A special case, shown only where it applies: the project has an
    // allocation, or the viewer manages a budget above its own and may grant
    // one. A manager of the project's own budget alone has nothing to do here.
    const canGrant = draft.manager && draft.sources.length > 0;
    if (allocations.length === 0 && !canGrant) return null;
    const sourceOf = (a) => draft.sources.find(sr => sr.id === a.budget_id);

    return (
        <Stack gap="sm">
            {/* Apart from the project's own share above, and saying why. */}
            <Divider mt="sm" label={t('projects.allocation.sectionTitle')} labelPosition="left" />
            <Text size="xs" c="dimmed">{t('projects.allocation.explain')}</Text>

            {allocations.map(a => (
                <Group key={a.budget_id} justify="space-between" wrap="nowrap" align="flex-start">
                    <Group gap="xs" wrap="nowrap" align="flex-start" style={{ minWidth: 0 }}>
                        <Gift size="14" style={{ marginTop: 3, flexShrink: 0, color: `var(--mantine-color-${COLOR.info}-7)` }} />
                        <div style={{ minWidth: 0 }}>
                            <Text size="sm"><b>{a.budget_name || a.budget_id}</b>{' · '}{resourceSummaryText(resources, a.limit)}</Text>
                            <Text size="xs" c="dimmed">
                                {t('projects.allocation.grantedBy', { who: a.granted_by, date: formatDate(a.granted_at) })}
                                {a.reason ? ` — ${a.reason}` : ''}
                            </Text>
                        </div>
                    </Group>
                    {/* A manager of the allocating budget changes it; its holders
                        may give it back. */}
                    {sourceOf(a) ? (
                        <Button size="compact-xs" variant="subtle" disabled={draft.open}
                            onClick={() => draft.start(a.budget_id)}>
                            {t('projects.allocation.change')}
                        </Button>
                    ) : holder && (
                        <Button size="compact-xs" variant="light" color={COLOR.negative}
                            loading={giveBack.isPending && giveBack.variables === a.budget_id}
                            onClick={() => askGiveBack(a)}>
                            {t('projects.allocation.giveBack')}
                        </Button>
                    )}
                </Group>
            ))}
            {giveBack.error && <Text c="red" size="xs">{formatError(giveBack.error)}</Text>}

            {canGrant && !draft.open && (
                <Group>
                    <Button size="xs" variant="light" leftSection={<Gift size="14" />} onClick={() => draft.start()}>
                        {t('projects.allocation.add')}
                    </Button>
                </Group>
            )}

            {draft.open && draft.source && (
                <Paper withBorder radius="md" p="md" bg="var(--mantine-color-default-hover)">
                    <Stack gap="sm">
                        <Group justify="space-between" wrap="nowrap">
                            <Text size="sm" fw={600}>
                                {draft.existing
                                    ? t('projects.allocation.formTitleChange', { name: draft.source.name || draft.source.id })
                                    : t('projects.allocation.formTitleNew')}
                            </Text>
                            <Button size="compact-xs" variant="subtle" color="gray" onClick={draft.discard}>
                                {t('projects.allocation.discard')}
                            </Button>
                        </Group>
                        <BudgetSelect
                            label={t('projects.allocation.from')}
                            description={t('projects.allocation.fromHint')}
                            budgets={draft.sources}
                            value={draft.sourceId}
                            required={false}
                            leftSection={<Gift size="14" />}
                            onChange={draft.setSourceId}
                        />
                        <QuotaInputs extra resources={draft.offered} value={draft.value} headroom={draft.headroom}
                            onChange={draft.setValue} />
                        {draft.existing && Object.values(draft.value).every(v => !v) && (
                            <Text size="xs" c={COLOR.negative}>{t('projects.allocation.willRemove')}</Text>
                        )}
                        <ReasonField
                            label={t('projects.allocation.reason')}
                            description={t('projects.allocation.reasonHint')}
                            value={draft.reason}
                            error={draft.error}
                            onChange={(e) => draft.setReason(e.currentTarget.value)}
                        />
                    </Stack>
                </Paper>
            )}
        </Stack>
    );
}
