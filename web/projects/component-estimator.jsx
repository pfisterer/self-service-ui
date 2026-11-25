import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ActionIcon, Alert, Button, Checkbox, Group, List, Modal, NumberInput, Paper, SegmentedControl, Select, Stack, Table, Text, Textarea } from '@mantine/core';
import { AlertTriangle, Calculator, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNodesApi } from './api-nodes.jsx';
import { formatError } from '/helper/api-error.js';
import { COLOR, kindOfResource, PROJECT_KINDS, resourceLabel } from './util-project.jsx';
import { useFeature } from './use-features.js';

// The resource estimator (Schätzhelfer, os-mgt-api /v1/estimate): computes what a project would ask for from how it will be used — an LLM tool with people and times, workspaces of a kind, a composition of the flavours the person may use — and, where one budget pays, what that budget grants of it. The numbers come from the server's deterministic estimate; a description in free text (only where the server has a language model for it) only fills the form. "Übernehmen" writes the proposed amounts into the fields, which stay editable.

// The form an area starts with: a course of 20 people, two hours a week for a semester.
export const ESTIMATE_DEFAULTS = {
    llm: { tool: 'code', persons: 20, sessions_per_week: 1, hours_per_session: 2, weeks: 12, together: true },
    workspaces: { kind: 'cpu', gpu_class: '', persons: 20, sessions_per_week: 1, hours_per_session: 2, weeks: 12, together: true, storage_gb_per_person: 5 },
    cloud: { flavors: [{ flavor: '', count: 1 }], volumes: [], per_person: false, participants: 20 },
};

// estimateInput is the request body of one area: empty rows left out, numbers as numbers.
export function estimateInput(area, form, level) {
    const n = (v) => (v === '' || v === null || v === undefined ? 0 : Number(v));
    if (area === 'cloud') {
        const flavors = (form.flavors || []).filter(f => f.flavor && n(f.count) > 0).map(f => ({ flavor: f.flavor, count: n(f.count) }));
        const volumes = (form.volumes || []).filter(v => n(v.size_gb) > 0 && n(v.count) > 0).map(v => ({ size_gb: n(v.size_gb), count: n(v.count) }));
        return { level, cloud: { flavors, ...(volumes.length ? { volumes } : {}), per_person: !!form.per_person, ...(form.per_person ? { participants: n(form.participants) } : {}) } };
    }
    const schedule = { persons: n(form.persons), sessions_per_week: n(form.sessions_per_week), hours_per_session: n(form.hours_per_session), weeks: n(form.weeks), together: !!form.together };
    if (area === 'workspaces') {
        return { level, workspaces: { kind: form.kind, ...(form.gpu_class ? { gpu_class: form.gpu_class } : {}), ...schedule, storage_gb_per_person: n(form.storage_gb_per_person) } };
    }
    return { level, llm: { tool: form.tool, ...schedule } };
}

// formsFromInput takes what the language model filled back into the forms, keeping the rest.
export function formsFromInput(forms, input) {
    const out = { ...forms };
    if (input?.llm) out.llm = { ...forms.llm, ...input.llm };
    if (input?.workspaces) out.workspaces = { ...forms.workspaces, gpu_class: '', ...input.workspaces };
    if (input?.cloud) {
        out.cloud = {
            ...forms.cloud,
            flavors: input.cloud.flavors?.length ? input.cloud.flavors : forms.cloud.flavors,
            volumes: input.cloud.volumes || [],
            per_person: !!input.cloud.per_person,
            participants: input.cloud.participants || forms.cloud.participants,
        };
    }
    return out;
}

// applicable is what of a proposed limit the form can take: the resources it offers.
export function applicable(limit, offered) {
    const ids = new Set((offered || []).map(r => r.id));
    const take = {};
    const missing = [];
    for (const [id, v] of Object.entries(limit || {})) {
        if (ids.has(id)) take[id] = v;
        else missing.push(id);
    }
    return { take, missing };
}

// budgetVerdict is the one sentence about the budget: grants all at once, part waits, cannot give some, or why it could not be asked.
export function budgetVerdict(budget) {
    if (!budget) return null;
    if (budget.error) return { key: 'budgetError', tone: 'attention', vars: { error: budget.error } };
    const unplaced = Object.keys(budget.plan?.unplaced || {});
    if (!budget.fits || unplaced.length) return { key: 'budgetMissing', tone: 'negative', vars: { list: unplaced.join(', ') } };
    if (budget.auto_approved) return { key: 'budgetInstant', tone: 'positive' };
    return { key: 'budgetWaits', tone: 'attention' };
}

function ScheduleFields({ t, value, onChange }) {
    const set = (k) => (v) => onChange({ ...value, [k]: v });
    return (
        <>
            <Group grow align="flex-start">
                <NumberInput size="xs" min={1} max={5000} label={t('projects.estimate.persons')} value={value.persons} onChange={set('persons')} />
                <NumberInput size="xs" min={0.5} max={21} step={0.5} decimalScale={1} label={t('projects.estimate.sessionsPerWeek')} value={value.sessions_per_week} onChange={set('sessions_per_week')} />
                <NumberInput size="xs" min={0.25} max={24} step={0.5} decimalScale={2} label={t('projects.estimate.hoursPerSession')} value={value.hours_per_session} onChange={set('hours_per_session')} />
                <NumberInput size="xs" min={1} max={104} label={t('projects.estimate.weeks')} value={value.weeks} onChange={set('weeks')} />
            </Group>
            <Checkbox size="xs" label={t('projects.estimate.together')} description={t('projects.estimate.togetherHint')} checked={!!value.together} onChange={(e) => set('together')(e.currentTarget.checked)} />
        </>
    );
}

function CloudFields({ t, value, onChange, flavors, flavorsAvailable }) {
    const set = (k) => (v) => onChange({ ...value, [k]: v });
    const row = (list, i, patch) => list.map((x, j) => (j === i ? { ...x, ...patch } : x));
    const flavorData = (flavors || []).map(f => ({
        value: f.name,
        label: t(f.gpus ? 'projects.estimate.flavorGpu' : 'projects.estimate.flavor', { name: f.name, vcpus: f.vcpus, ram: Math.round((f.ram_mb / 1024) * 10) / 10, gpus: f.gpus }),
    }));
    return (
        <Stack gap={6}>
            {!flavorsAvailable && <Text size="xs" c="dimmed">{t('projects.estimate.noFlavors')}</Text>}
            {(value.flavors || []).map((f, i) => (
                <Group key={i} gap="xs" align="flex-end" wrap="nowrap">
                    <Select size="xs" style={{ flex: 1 }} searchable label={i === 0 ? t('projects.estimate.flavorLabel') : undefined} data={flavorData} value={f.flavor || null}
                        onChange={(v) => set('flavors')(row(value.flavors, i, { flavor: v || '' }))} />
                    <NumberInput size="xs" w={90} min={1} max={1000} label={i === 0 ? t('projects.estimate.count') : undefined} value={f.count}
                        onChange={(v) => set('flavors')(row(value.flavors, i, { count: v }))} />
                    <ActionIcon variant="subtle" color="gray" aria-label={t('projects.estimate.remove')} onClick={() => set('flavors')(value.flavors.filter((_, j) => j !== i))}><Trash2 size="14" /></ActionIcon>
                </Group>
            ))}
            {(value.volumes || []).map((v, i) => (
                <Group key={`v${i}`} gap="xs" align="flex-end" wrap="nowrap">
                    <NumberInput size="xs" style={{ flex: 1 }} min={1} max={100000} label={i === 0 ? t('projects.estimate.volumeSize') : undefined} value={v.size_gb}
                        onChange={(x) => set('volumes')(row(value.volumes, i, { size_gb: x }))} />
                    <NumberInput size="xs" w={90} min={1} max={1000} label={i === 0 ? t('projects.estimate.count') : undefined} value={v.count}
                        onChange={(x) => set('volumes')(row(value.volumes, i, { count: x }))} />
                    <ActionIcon variant="subtle" color="gray" aria-label={t('projects.estimate.remove')} onClick={() => set('volumes')(value.volumes.filter((_, j) => j !== i))}><Trash2 size="14" /></ActionIcon>
                </Group>
            ))}
            <Group gap="xs">
                <Button size="compact-xs" variant="subtle" leftSection={<Plus size="12" />} onClick={() => set('flavors')([...(value.flavors || []), { flavor: '', count: 1 }])}>{t('projects.estimate.addFlavor')}</Button>
                <Button size="compact-xs" variant="subtle" leftSection={<Plus size="12" />} onClick={() => set('volumes')([...(value.volumes || []), { size_gb: 50, count: 1 }])}>{t('projects.estimate.addVolume')}</Button>
            </Group>
            <Group gap="xs" align="flex-end">
                <Checkbox size="xs" label={t('projects.estimate.perPerson')} checked={!!value.per_person} onChange={(e) => set('per_person')(e.currentTarget.checked)} />
                {value.per_person && <NumberInput size="xs" w={140} min={1} max={5000} label={t('projects.estimate.participants')} value={value.participants} onChange={set('participants')} />}
            </Group>
        </Stack>
    );
}

// EstimateResult shows what was computed: the proposed amounts (those the form does not offer marked), the budget's verdict, the assumptions and warnings, and what the language model assumed or what of its answer was dropped.
export function EstimateResult({ t, result, budget, described, offered, onApply }) {
    const { take, missing } = applicable(result?.limit, offered);
    const byId = Object.fromEntries((offered || []).map(r => [r.id, r]));
    const verdict = budgetVerdict(budget);
    const toneColor = { positive: COLOR.positive, attention: COLOR.attention, negative: COLOR.negative };
    const entries = Object.entries(result?.limit || {});
    return (
        <Stack gap="xs" data-testid="estimate-result">
            {entries.length > 0 ? (
                <Table withRowBorders={false} verticalSpacing={2} fz="sm">
                    <Table.Tbody>
                        {entries.map(([id, v]) => (
                            <Table.Tr key={id}>
                                <Table.Td>{byId[id] ? resourceLabel(t, byId[id]) : id}</Table.Td>
                                <Table.Td ta="right">{byId[id]?.kind === 'bool' ? t('projects.estimate.granted') : Number(v).toLocaleString()}</Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            ) : <Text size="sm" c="dimmed">{t('projects.estimate.nothing')}</Text>}
            {missing.length > 0 && <Text size="xs" c="dimmed">{t('projects.estimate.notOffered', { list: missing.join(', ') })}</Text>}
            {verdict && (
                <Alert color={toneColor[verdict.tone]} variant="light" p="xs">
                    <Text size="sm">{t(`projects.estimate.${verdict.key}`, verdict.vars)}</Text>
                </Alert>
            )}
            {(result?.warnings || []).map(w => (
                <Alert key={w.code + w.text} color="yellow" variant="light" p="xs" icon={<AlertTriangle size="14" />}>
                    <Text size="xs">{w.text}</Text>
                </Alert>
            ))}
            {(described?.corrections || []).map(c => (
                <Alert key={c.code + c.text} color="yellow" variant="light" p="xs" icon={<AlertTriangle size="14" />}>
                    <Text size="xs">{c.text}</Text>
                </Alert>
            ))}
            {described?.assumptions?.length > 0 && (
                <Stack gap={2}>
                    <Text size="xs" fw={600}>{t('projects.estimate.modelAssumptions')}</Text>
                    <List size="xs" spacing={0}>{described.assumptions.map((a, i) => <List.Item key={i}>{a}</List.Item>)}</List>
                </Stack>
            )}
            {result?.assumptions?.length > 0 && (
                <Stack gap={2}>
                    <Text size="xs" fw={600}>{t('projects.estimate.assumptions', { version: result.profiles_version })}</Text>
                    <List size="xs" spacing={0}>{result.assumptions.map(a => <List.Item key={a.code}>{a.text}</List.Item>)}</List>
                </Stack>
            )}
            <Group justify="flex-end">
                <Button size="xs" disabled={Object.keys(take).length === 0} onClick={() => onApply(take)}>{t('projects.estimate.apply')}</Button>
            </Group>
        </Stack>
    );
}

// ESTIMATOR_Z lies above the request dialog (FormModal, default z-index), as the budget's dialog for a raise does.
const ESTIMATOR_Z = 300;

// EstimatorSection is the "Schätzen" button above a resources tab, shown where the feature gate estimator is open to the person (use-features.js). It opens the estimator as a dialog over the request dialog, which keeps its state underneath: "In die Felder übernehmen" closes it and fills the fields below (still editable), "Abbrechen" or Escape close it without changes. kind is the tab's area (null: every area the form offers); budgetId the one budget paying (none while the project is split over budgets); onApply gets the amounts to write into the fields; onOpenChange tells the request dialog, so that Escape closes only the estimator while it is open.
export function EstimatorSection(props) {
    return useFeature('estimator') ? <EstimatorLauncher {...props} /> : null;
}

function EstimatorLauncher({ kind, offered, budgetId, terminationDate, onApply, onOpenChange }) {
    const { t } = useTranslation();
    const api = useNodesApi();
    const [open, setOpen] = useState(false);
    const kinds = estimatorKinds(kind, offered);
    if (!api?.estimateOptions || kinds.length === 0) return null;
    const toggle = (v) => { setOpen(v); onOpenChange?.(v); };
    return (
        <Paper withBorder radius="md" p="sm">
            <Group justify="space-between" wrap="nowrap">
                <Group gap={6} wrap="nowrap">
                    <Calculator size="14" />
                    <Stack gap={0}>
                        <Text size="sm" fw={600}>{t('projects.estimate.title')}</Text>
                        <Text size="xs" c="dimmed">{t('projects.estimate.hint')}</Text>
                    </Stack>
                </Group>
                <Button size="xs" variant="light" onClick={() => toggle(true)}>{t('projects.estimate.open')}</Button>
            </Group>
            <Modal opened={open} onClose={() => toggle(false)} zIndex={ESTIMATOR_Z} size="lg" title={t('projects.estimate.title')}>
                {open && (
                    <EstimatorPanel kind={kind} offered={offered} budgetId={budgetId} terminationDate={terminationDate}
                        onApply={(take) => { onApply(take); toggle(false); }}
                        onCancel={() => toggle(false)} />
                )}
            </Modal>
        </Paper>
    );
}

// estimatorKinds are the areas the estimator offers: the tab's, or every area the form has resources of.
function estimatorKinds(kind, offered) {
    return kind ? [kind] : PROJECT_KINDS.filter(k => (offered || []).some(r => kindOfResource(r) === k));
}

function EstimatorPanel({ kind, offered, budgetId, terminationDate, onApply, onCancel }) {
    const { t, i18n } = useTranslation();
    const api = useNodesApi();
    const kinds = estimatorKinds(kind, offered);
    const open = true;
    const [area, setArea] = useState(kinds[0] ?? 'llm');
    const [forms, setForms] = useState(ESTIMATE_DEFAULTS);
    const [level, setLevel] = useState('typical');
    const [description, setDescription] = useState('');
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    const [answer, setAnswer] = useState(null);

    const options = useQuery({
        queryKey: ['estimate-options', budgetId ?? null],
        queryFn: () => api.estimateOptions({ budgetId }),
        enabled: !!api?.estimateOptions && open,
        staleTime: 5 * 60 * 1000,
    });
    if (!api?.estimateOptions || kinds.length === 0) return null;
    const opts = options.data;
    const current = kinds.includes(area) ? area : kinds[0];

    const run = async (which) => {
        setBusy(which);
        setError(null);
        try {
            if (which === 'describe') {
                const res = await api.estimateDescribe({ description, budgetId, terminationDate });
                const input = res.described?.input || {};
                setForms(f => formsFromInput(f, input));
                if (input.level) setLevel(input.level);
                const filled = kinds.find(k => input[k]);
                if (filled) setArea(filled);
                setAnswer({ result: res.result, budget: res.budget, described: res.described });
            } else {
                const res = await api.estimate({ input: estimateInput(current, forms[current], level), budgetId, terminationDate });
                setAnswer({ result: res.result, budget: res.budget });
            }
        } catch (e) {
            setError(formatError(e));
        } finally {
            setBusy(null);
        }
    };
    const setForm = (k) => (v) => { setForms(f => ({ ...f, [k]: v })); setAnswer(null); };
    const toolData = (opts?.tools || []).map(x => ({ value: x.id, label: x.name }));
    const kindData = (opts?.workspace_kinds || []).map(x => ({ value: x.id, label: t('projects.estimate.workspaceKind', { name: (i18n.resolvedLanguage === 'en' ? x.name_en : x.name_de) || x.id, vcpu: x.vcpu, ram: x.ram_gb }) }));
    const wsGpu = (opts?.workspace_kinds || []).find(x => x.id === forms.workspaces.kind)?.gpus > 0;

    return (
        <>
            {open && (
                <Stack gap="xs">
                    {options.isLoading && <Text size="xs" c="dimmed">{t('projects.estimate.loading')}</Text>}
                    {options.error && <Alert color={COLOR.negative} variant="light" p="xs"><Text size="xs">{formatError(options.error)}</Text></Alert>}
                    {opts?.describe_enabled && (
                        <Stack gap={4}>
                            <Textarea size="xs" autosize minRows={2} maxRows={6} maxLength={4000}
                                label={t('projects.estimate.describeLabel')}
                                description={t('projects.estimate.describeHint')}
                                placeholder={t('projects.estimate.describePlaceholder')}
                                value={description} onChange={(e) => setDescription(e.currentTarget.value)} />
                            <Group justify="flex-end">
                                <Button size="xs" variant="light" leftSection={<Sparkles size="12" />} loading={busy === 'describe'} disabled={!description.trim() || !!busy} onClick={() => run('describe')}>
                                    {t('projects.estimate.describe')}
                                </Button>
                            </Group>
                        </Stack>
                    )}
                    {kinds.length > 1 && (
                        <SegmentedControl size="xs" style={{ alignSelf: 'flex-start' }} value={current} onChange={(v) => { setArea(v); setAnswer(null); }}
                            data={kinds.map(k => ({ value: k, label: t(`projects.estimate.area.${k}`) }))} />
                    )}
                    {current === 'llm' && (
                        <>
                            <Select size="xs" label={t('projects.estimate.tool')} data={toolData} value={forms.llm.tool} allowDeselect={false}
                                onChange={(v) => setForm('llm')({ ...forms.llm, tool: v })} />
                            <ScheduleFields t={t} value={forms.llm} onChange={setForm('llm')} />
                        </>
                    )}
                    {current === 'workspaces' && (
                        <>
                            <Group grow align="flex-start">
                                <Select size="xs" label={t('projects.estimate.workspaceKindLabel')} data={kindData} value={forms.workspaces.kind} allowDeselect={false}
                                    onChange={(v) => setForm('workspaces')({ ...forms.workspaces, kind: v })} />
                                {wsGpu && (opts?.gpu_classes || []).length > 1 && (
                                    <Select size="xs" label={t('projects.estimate.gpuClass')} data={opts.gpu_classes} value={forms.workspaces.gpu_class || null}
                                        onChange={(v) => setForm('workspaces')({ ...forms.workspaces, gpu_class: v || '' })} />
                                )}
                                <NumberInput size="xs" min={0} max={1000} label={t('projects.estimate.storagePerPerson')} value={forms.workspaces.storage_gb_per_person}
                                    onChange={(v) => setForm('workspaces')({ ...forms.workspaces, storage_gb_per_person: v })} />
                            </Group>
                            <ScheduleFields t={t} value={forms.workspaces} onChange={setForm('workspaces')} />
                        </>
                    )}
                    {current === 'cloud' && (
                        <CloudFields t={t} value={forms.cloud} onChange={setForm('cloud')} flavors={opts?.flavors} flavorsAvailable={opts?.flavors_available !== false} />
                    )}
                    <Group justify="space-between">
                        <SegmentedControl size="xs" value={level} onChange={(v) => { setLevel(v); setAnswer(null); }}
                            data={[{ value: 'typical', label: t('projects.estimate.levelTypical') }, { value: 'high', label: t('projects.estimate.levelHigh') }]} />
                        <Button size="xs" leftSection={<Calculator size="12" />} loading={busy === 'estimate'} disabled={!!busy || !opts} onClick={() => run('estimate')}>
                            {t('projects.estimate.compute')}
                        </Button>
                    </Group>
                    {error && <Alert color={COLOR.negative} variant="light" p="xs"><Text size="xs">{error}</Text></Alert>}
                    {answer && (
                        <EstimateResult t={t} result={answer.result} budget={answer.budget} described={answer.described} offered={offered}
                            onApply={(take) => onApply(take)} />
                    )}
                    <Group justify="flex-end">
                        <Button size="xs" variant="default" onClick={onCancel}>{t('projects.actions.cancel')}</Button>
                    </Group>
                </Stack>
            )}
        </>
    );
}
