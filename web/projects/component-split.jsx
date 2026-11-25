import { useState } from 'react';
import { ActionIcon, Alert, Anchor, Badge, Box, Group, Loader, Paper, Radio, Select, Stack, Text, Tooltip } from '@mantine/core';
import { AlertTriangle, Clock, Pencil, Plus, RotateCcw, X, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { QuotaInputs } from './component-quota-inputs.jsx';
import { budgetLabel, budgetPathText } from './component-budget-path.jsx';
import { formatDate } from '../format-date.js';
import { COLOR, UNLIMITED_QUOTA, resourceSummaryText, visibleResources } from './util-project.jsx';

// The split of a new project over budgets (allocation_leaves, decided 25.11.2026, (1)): the person enters what the project needs in total, POST /v1/nodes/split proposes which budget pays what — first what each grants without a decision, the most specific budget first, then the rest as a request — and the proposal can be changed before it is sent: amounts per part, a part removed, another budget added. What no budget would even take as a request (unplaced) blocks the request. With more than one part, or a part that waits, the person chooses when the project starts (3): at once with what is granted, or once everything is decided.

// nonZero is a quota without its zeros: what a part actually asks for.
export function nonZero(quota) {
    return Object.fromEntries(Object.entries(quota || {}).filter(([, v]) => (v ?? 0) !== 0));
}

// waitingPart is what of a part waits for its budget's managers: its limit minus what the budget grants at once, per resource (an availability waits unless it is granted). Nothing waits on a budget the person manages (managed): there the allocation is created approved. null where auto_approved is unknown (a part changed by hand: its budget decides when the request arrives).
export function waitingPart(part, managed = false) {
    if (managed) return {};
    if (!part.auto_approved) return null;
    const out = {};
    for (const [id, v] of Object.entries(part.limit || {})) {
        const granted = part.auto_approved[id] ?? 0;
        if (v === UNLIMITED_QUOTA) {
            if (granted !== UNLIMITED_QUOTA) out[id] = v;
            continue;
        }
        if (v > granted) out[id] = v - granted;
    }
    return out;
}

// sumParts adds the parts' limits up: what the project would hold once every part is granted.
export function sumParts(parts) {
    const out = {};
    for (const p of parts || []) {
        for (const [id, v] of Object.entries(p.limit || {})) {
            out[id] = out[id] === UNLIMITED_QUOTA || v === UNLIMITED_QUOTA ? UNLIMITED_QUOTA : (out[id] ?? 0) + v;
        }
    }
    return out;
}

// splitOutcome is what sending the split does, for the note beside the button: 'blocked' with something unplaced or nothing to send, 'instant' when every part is granted at once, else 'approval' (something waits for a budget's managers, or a part changed by hand is decided when it arrives).
export function splitOutcome(parts, unplaced, isManaged = () => false) {
    if (Object.keys(nonZero(unplaced)).length > 0) return 'blocked';
    const real = (parts || []).filter(p => Object.keys(nonZero(p.limit)).length > 0);
    if (real.length === 0) return 'blocked';
    return real.every(p => { const w = waitingPart(p, isManaged(p.budget_id)); return w && Object.keys(w).length === 0; }) ? 'instant' : 'approval';
}

// SplitSection shows the proposed split and lets it be changed.
//   plan         the API's proposal { parts, unplaced } (null while none was asked for)
//   parts        the parts shown: the proposal, or the person's own version of it
//   edited       whether parts were changed by hand (then the proposal no longer follows the total)
//   onChange     (parts) => void, called with the whole new list on every change
//   onReset      go back to the API's proposal
//   candidates   the budgets that may be added (those the person may request from or manages)
//   asked        what the person entered in total, to say when the parts no longer add up to it
//   startWhen    'now' | 'all', onStartWhen
//   isManaged    (budgetId) => whether the person manages that budget or one above: their part there is created approved, whatever the proposal's auto_approved says
export function SplitSection({ plan, loading = false, error = null, parts, edited = false, onChange, onReset, candidates = [], resources, asked, startWhen, onStartWhen, isManaged = () => false }) {
    const { t } = useTranslation();
    const [editing, setEditing] = useState(null);
    const amount = (q) => resourceSummaryText(t, resources, q) || '—';
    const unplaced = edited ? {} : nonZero(plan?.unplaced);
    const inUse = new Set((parts || []).map(p => p.budget_id));
    const addable = candidates.filter(b => !inUse.has(b.id));
    const total = sumParts(parts);
    const differs = edited && JSON.stringify(nonZero(sortKeys(total))) !== JSON.stringify(nonZero(sortKeys(asked)));
    const waitsSomewhere = (parts || []).some(p => { const w = waitingPart(p, isManaged(p.budget_id)); return !w || Object.keys(w).length > 0; });

    const update = (i, patch) => onChange(parts.map((p, j) => (j === i ? { ...p, ...patch, auto_approved: null } : p)));
    const remove = (i) => { setEditing(null); onChange(parts.filter((_, j) => j !== i)); };
    const add = (id) => {
        const b = candidates.find(x => x.id === id);
        if (!b) return;
        onChange([...(parts || []), { budget_id: b.id, budget_name: b.name, budget_path: [...(b.parent_path || []), { id: b.id, name: b.name }], limit: {}, auto_approved: null, termination_date: null }]);
        setEditing((parts || []).length);
    };

    return (
        <Paper withBorder radius="md" p="md">
            <Stack gap="sm">
                <Group justify="space-between" align="center" gap="xs">
                    <div>
                        <Text fw={600} size="sm">{t('projects.split.title')}</Text>
                        <Text size="xs" c="dimmed">{t('projects.split.hint')}</Text>
                    </div>
                    {loading && <Loader size="xs" />}
                    {edited && (
                        <Anchor component="button" type="button" size="xs" onClick={() => { setEditing(null); onReset(); }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <RotateCcw size="12" />{t('projects.split.reset')}
                        </Anchor>
                    )}
                </Group>

                {error && <Text size="xs" c={COLOR.negative}>{error}</Text>}
                {!loading && !error && (parts || []).length === 0 && (
                    <Text size="xs" c="dimmed">{plan ? t('projects.split.none') : t('projects.split.enterFirst')}</Text>
                )}

                {(parts || []).map((p, i) => {
                    const managed = isManaged(p.budget_id);
                    const waiting = waitingPart(p, managed);
                    // On a budget the person manages, everything of the part is granted at once.
                    const granted = managed ? nonZero(p.limit) : nonZero(p.auto_approved);
                    return (
                        <Box key={p.budget_id} data-testid={`split-part-${p.budget_id}`}>
                            <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
                                <Box style={{ minWidth: 0 }}>
                                    <Tooltip label={budgetPathText(p.budget_path, p.budget_name || p.budget_id)} openDelay={300} withinPortal>
                                        <Text size="sm" fw={600}>{p.budget_name || p.budget_id}</Text>
                                    </Tooltip>
                                    {waiting === null ? (
                                        <Text size="xs">{t('projects.split.asked', { amount: amount(p.limit) })}</Text>
                                    ) : (
                                        <>
                                            {Object.keys(granted).length > 0 && (
                                                <Group gap={4} wrap="nowrap">
                                                    <Zap size="12" color={`var(--mantine-color-${COLOR.positive}-7)`} style={{ flexShrink: 0 }} />
                                                    <Text size="xs" c={`${COLOR.positive}.8`}>{t('projects.split.granted', { amount: amount(granted) })}</Text>
                                                </Group>
                                            )}
                                            {Object.keys(waiting).length > 0 && (
                                                <Group gap={4} wrap="nowrap">
                                                    <Clock size="12" color={`var(--mantine-color-${COLOR.attention}-7)`} style={{ flexShrink: 0 }} />
                                                    <Text size="xs" c={`${COLOR.attention}.8`}>{t('projects.split.waiting', { amount: amount(waiting) })}</Text>
                                                </Group>
                                            )}
                                        </>
                                    )}
                                    {p.termination_date && (
                                        <Text size="xs" c="dimmed">{t('projects.allocation.until', { date: formatDate(p.termination_date) })}</Text>
                                    )}
                                </Box>
                                <Group gap={2} wrap="nowrap" style={{ flexShrink: 0 }}>
                                    <Tooltip label={t('projects.split.changePart')} withinPortal>
                                        <ActionIcon variant="subtle" color="gray" size="sm" aria-label={t('projects.split.changePart')}
                                            onClick={() => setEditing(editing === i ? null : i)}>
                                            <Pencil size="13" />
                                        </ActionIcon>
                                    </Tooltip>
                                    <Tooltip label={t('projects.split.removePart')} withinPortal>
                                        <ActionIcon variant="subtle" color={COLOR.negative} size="sm" aria-label={t('projects.split.removePart')}
                                            onClick={() => remove(i)}>
                                            <X size="13" />
                                        </ActionIcon>
                                    </Tooltip>
                                </Group>
                            </Group>
                            {editing === i && (
                                <Box mt="xs" pl="sm" style={{ borderLeft: '2px solid var(--mantine-color-gray-3)' }}>
                                    <QuotaInputs extra providerDefaults
                                        resources={partResources(resources, candidates, p.budget_id)}
                                        value={p.limit}
                                        onChange={(id, v) => update(i, { limit: { ...p.limit, [id]: v } })} />
                                </Box>
                            )}
                        </Box>
                    );
                })}

                {addable.length > 0 && (
                    <Select
                        size="xs"
                        leftSection={<Plus size="13" />}
                        placeholder={t('projects.split.addBudget')}
                        aria-label={t('projects.split.addBudget')}
                        searchable
                        data={addable.map(b => ({ value: b.id, label: budgetLabel(b) }))}
                        value={null}
                        onChange={(id) => id && add(id)}
                    />
                )}

                {differs && (
                    <Text size="xs" c={COLOR.attention}>{t('projects.split.differs', { total: amount(nonZero(total)) })}</Text>
                )}

                {Object.keys(unplaced).length > 0 && (
                    <Alert color={COLOR.negative} variant="light" p="xs" icon={<AlertTriangle size="16" />}>
                        <Text size="xs">{t('projects.split.unplaced', { amount: amount(unplaced) })}</Text>
                    </Alert>
                )}

                {/* When the project starts: only a question where something waits or several budgets pay. */}
                {((parts || []).length > 1 || waitsSomewhere) && (parts || []).length > 0 && (
                    <Radio.Group label={t('projects.split.startWhen')} value={startWhen} onChange={onStartWhen} size="xs">
                        <Stack gap={6} mt={4}>
                            <Radio value="now" label={t('projects.split.startNow')} description={t('projects.split.startNowHint')} />
                            <Radio value="all" label={t('projects.split.startAll')} description={t('projects.split.startAllHint')} />
                        </Stack>
                    </Radio.Group>
                )}
                {(parts || []).length > 0 && (
                    <Badge variant="light" color={COLOR.identity} tt="none" style={{ alignSelf: 'flex-start' }}>
                        {t('projects.split.total', { amount: amount(nonZero(total)) })}
                    </Badge>
                )}
            </Stack>
        </Paper>
    );
}

// partResources are the resources a part may ask for: what its budget holds where the budget is in hand, else the whole catalogue passed in (the API checks it on sending).
function partResources(resources, candidates, budgetId) {
    const budget = candidates.find(b => b.id === budgetId);
    return budget ? visibleResources(resources, budget) : resources;
}

function sortKeys(o) {
    return Object.fromEntries(Object.entries(o || {}).sort(([a], [b]) => a.localeCompare(b)));
}
