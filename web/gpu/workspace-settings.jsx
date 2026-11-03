import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ActionIcon, Anchor, Badge, Button, Checkbox, Code, Group, Loader, Modal, MultiSelect, NumberInput, Paper, Progress, SegmentedControl, Select, SimpleGrid, Stack, Switch, Tabs, Text, TextInput } from '@mantine/core';
import { FileText, Plus, RotateCcw, X } from 'lucide-react';
import { BUILD_COLOUR, BuildLogModal } from '/gpu/build-log.jsx';
import { GitSource } from '/gpu/git-source.jsx';
import { ProjectCredentials } from '/gpu/credentials.jsx';
import { ImageFacts } from '/gpu/image-facts.jsx';
import { ProjectId } from '/gpu/project-id.jsx';
import { llmEnabled } from '/features.js';
import { useLlmMe } from '/llm/use-llm-me.jsx';
import { useGpuApi } from '/gpu/api-gpu.jsx';
import { formatDay } from '/format-date.js';
import { formatDuration } from '/helper/duration.js';
import { gpuKeys } from '/gpu/query-keys.js';
import { SPLIT_GUIDE_URL } from '/gpu/profiles.js';
import { DEFAULT_JOBS_PER_PERSON, JOB_HOUR_CHOICES, jobMaxHours } from '/gpu/jobs.js';

// How a Lab/KI project's workspaces are used — profiles, the project image, limits and shares per person, shorter windows. Everything else about the project (name, members, end, quotas) is the project's own and edited in its dialog; this is the one part only the AI service knows, so it is a tab of the project's edit dialog (modal-project-form.jsx) instead of a second list of the same projects.

const UNITS = ['vcpu_hours', 'ram_gb_hours', 'gpu_hours', 'server_hours'];
const WINDOWS = ['24h', '7d', '30d', 'total'];
const DEFAULT_LIMITS = { servers_per_person: 2, cpu_per_person: 4, ram_gb_per_person: 16, gpus_per_person: 0, jobs_per_person: 0, job_max_hours: 0 };

// classes: the GPU classes of the catalogue, to name a budget's class ("General · medium") instead of its id.
export function budgetText(t, b, classes = []) {
    const cls = classes.find(c => c.id === b.gpu_class)?.name || b.gpu_class;
    const unit = t(`gpu.projects.budget.units.${b.unit}`) + (b.unit === 'gpu_hours' && b.gpu_class ? ` (${cls})` : '');
    return t('gpu.projects.budget.line', { amount: b.amount, unit, window: t(`gpu.projects.budget.windows.${b.window}`),
        who: t(b.per_person ? 'gpu.projects.budget.perPerson' : 'gpu.projects.budget.wholeProject') });
}

// One budget with what is used of it — the person's own use for a budget per person. Orange from 80 %, red when used up: the warning before servers are ended.
function BudgetBar({ b, classes }) {
    const { t } = useTranslation();
    const ratio = b.amount > 0 ? b.used / b.amount : 0;
    const color = b.exhausted ? 'red' : ratio >= 0.8 ? 'orange' : 'teal';
    return (
        <div>
            <Group justify="space-between" gap="xs" wrap="nowrap">
                <Text size="xs">{budgetText(t, b, classes)}</Text>
                <Text size="xs" c={b.exhausted ? 'red' : 'dimmed'} style={{ whiteSpace: 'nowrap' }}>
                    {t('gpu.projects.budget.used', { used: Math.round(b.used * 10) / 10, amount: b.amount })}
                </Text>
            </Group>
            <Progress value={Math.min(100, ratio * 100)} color={color} size="sm" mt={2} />
        </div>
    );
}

// useWorkspaceSettings is the draft of a project's workspace settings for its edit dialog (modal-project-form.jsx), next to the tree's own fields: available once the AI service knows the project and the caller manages it there; changed and save() let the dialog's one Save button apply it like its other parts — at once, it needs no approval.
export function useWorkspaceSettings(nodeId, active) {
    const api = useGpuApi();
    const queryClient = useQueryClient();
    const { isAdmin } = useLlmMe();
    const projects = useQuery({
        queryKey: gpuKeys.projects(false),
        queryFn: () => api.listProjects(false),
        enabled: llmEnabled && active && !!nodeId,
        // Asked again whenever the dialog opens: a project created a moment ago is missing from a list fetched before it.
        staleTime: 0,
        // While the project image builds, its state follows.
        refetchInterval: (q) => ((q.state.data ?? []).some(p => p.image_build?.status === 'building') ? 10 * 1000 : false),
    });
    const project = (projects.data ?? []).find(p => p.tree_node === nodeId) ?? null;
    const available = !!project && (isAdmin || project.role === 'manager' || project.role === 'admin');
    const [draft, setDraft] = useState(null);
    const initial = project ? editable(project) : null;
    const current = draft ?? initial;
    return {
        available,
        project,
        value: current,
        update: (fn) => setDraft(fn(current)),
        changed: available && draft !== null && JSON.stringify(draft) !== JSON.stringify(initial),
        save: async () => {
            await api.updateProject({ ...editable(project), ...draft });
            await queryClient.invalidateQueries({ queryKey: ['gpu', 'projects'] });
        },
    };
}

// The part of a workspace project its settings change; the rest (name, members, end, quotas) belongs to the tree and is sent back as it is.
function editable(project) {
    const { role: _role, budget_status: _status, image_build: _build, release_ceiling: _ceiling, release_effective: _effective, ...rest } = project;
    return { ...rest, limits: { ...DEFAULT_LIMITS, ...(project.limits ?? {}) } };
}

// Box is one part of the tab, with its title and an optional hint below the fields.
function Box({ title, hint, children }) {
    return (
        <Paper withBorder radius="md" p="md">
            <Text size="sm" fw={700} mb="xs">{title}</Text>
            <Stack gap="xs">{children}</Stack>
            {hint && <Text size="xs" c="dimmed" mt="xs">{hint}</Text>}
        </Paper>
    );
}


// shortDigest shows the start of a digest, enough to tell versions apart.
const shortDigest = (d) => (d || '').replace(/^sha256:/, '').slice(0, 12);

// ProjectImage is the project's environment, run by every server type (docs/bauplan.md 10.12): a base of the catalogue, a Git repository built on it, or an existing image — one not built on a base runs as it is, without the GPU kernel.
function ProjectImage({ draft, set, bases }) {
    const { t } = useTranslation();
    const api = useGpuApi();
    const queryClient = useQueryClient();
    const p = draft.value;
    const saved = draft.project;
    const [source, setSource] = useState(p.image_git_url ? 'git' : p.project_image ? 'image' : 'base');
    const defaultBase = (bases.find(b => b.default) ?? bases[0])?.id ?? '';
    const [logOpen, setLogOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const build = saved?.image_git_url && saved.image_git_url === p.image_git_url ? saved.image_build : null;
    const choose = (v) => {
        setSource(v);
        draft.update(cur => ({ ...cur, image_git_url: '', image_git_ref: '', image_base: v === 'image' ? '' : cur.image_base, project_image: v === 'image' && !cur.image_git_url ? cur.project_image : '' }));
    };
    const rebuild = async () => {
        setBusy(true); setError('');
        try {
            await api.rebuildProjectImage(saved.slug);
            await queryClient.invalidateQueries({ queryKey: ['gpu', 'projects'] });
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };
    const takeUpdate = async () => {
        setBusy(true); setError('');
        try {
            await api.updateProjectImage(saved.slug);
            await queryClient.invalidateQueries({ queryKey: ['gpu', 'projects'] });
        } catch (e) {
            setError(e.message);
        } finally {
            setBusy(false);
        }
    };
    // The saved finished image, as long as the field still shows it: its digest and a newer one of its tag.
    const pinnedImage = source === 'image' && saved?.project_image && saved.project_image === p.project_image && !saved.image_git_url ? saved : null;
    // What the service found about the saved image (size, warnings, Harbor's scan), as long as the dialog still shows that image or that repository.
    const facts = pinnedImage ?? (source === 'git' && saved?.project_image && saved.image_git_url && saved.image_git_url === p.image_git_url ? saved : null);
    const showLog = () => setLogOpen(true);
    // The repository of the build is usually the course's material too: the material follows it while it is empty or was the same.
    const fromGit = ({ url, ref }) => draft.update(cur => ({
        ...cur, image_git_url: url, image_git_ref: ref,
        material_git_url: !cur.material_git_url || cur.material_git_url === cur.image_git_url ? url : cur.material_git_url,
    }));
    return (
        <Stack gap={6}>
            <Text size="sm" fw={500}>{t('gpu.projects.image.label')}</Text>
            <Text size="xs" c="dimmed">{t('gpu.projects.image.hint')}</Text>
            <SegmentedControl size="xs" value={source} onChange={choose} data={[
                { value: 'base', label: t('gpu.projects.image.sourceBase') },
                { value: 'git', label: t('gpu.projects.image.sourceGit') },
                { value: 'image', label: t('gpu.projects.image.sourceImage') },
            ]} />
            {source !== 'image' && bases.length > 0 && (
                <BaseChoice bases={bases} value={p.image_base || defaultBase} saved={saved?.image_base} onChange={v => set('image_base', v)} />
            )}
            {source === 'git' && (
                <>
                    <GitSource value={{ url: p.image_git_url, ref: p.image_git_ref }} onChange={fromGit} />
                    <Text size="xs" c="dimmed">{t('gpu.projects.image.gitHint')}</Text>
                    {build && (
                        <Group gap="xs" wrap="wrap">
                            {build.status === 'building' && <Loader size={12} />}
                            <Badge variant="light" color={BUILD_COLOUR[build.status] ?? 'gray'} style={{ textTransform: 'none' }}>
                                {t(`gpu.projects.image.status.${build.status}`, { defaultValue: build.status })}
                            </Badge>
                            <Text size="xs" c="dimmed" ff="monospace">{(build.commit || '').slice(0, 12)}{build.branch ? ` (${build.branch})` : ''}</Text>
                            <Button size="compact-xs" variant="subtle" leftSection={<FileText size={12} />} onClick={showLog}>{t('gpu.projects.image.log')}</Button>
                            <Button size="compact-xs" variant="subtle" leftSection={<RotateCcw size={12} />} loading={busy} disabled={build.status === 'building'} onClick={rebuild}>{t('gpu.projects.image.rebuild')}</Button>
                        </Group>
                    )}
                    {build?.message && <Text size="xs" c={build.status === 'failed' ? 'red' : 'dimmed'}>{build.message}</Text>}
                    {!build && p.image_git_url && <Text size="xs" c="dimmed">{t('gpu.projects.image.buildOnSave')}</Text>}
                    {error && <Text size="xs" c="red">{error}</Text>}
                </>
            )}
            {source === 'image' && (
                <TextInput label={t('gpu.projects.image.finished')} description={t('gpu.projects.image.finishedHint')} placeholder="quay.io/jupyter/datascience-notebook:2026-10-01"
                    value={p.project_image ?? ''} onChange={e => set('project_image', e.currentTarget.value.trim())} />
            )}
            {source === 'image' && saved?.project_image && saved.project_image === p.project_image && !saved.image_derived && (
                <Text size="xs" c="orange">{t('gpu.projects.image.notDerived')} <Anchor href={SPLIT_GUIDE_URL} target="_blank" rel="noopener" size="xs">{t('gpu.start.splitNeedsBaseLink')}</Anchor></Text>
            )}
            <ImageFacts project={facts} />
            {pinnedImage?.image_digest && (
                <Text size="xs" c="dimmed">{t('gpu.projects.image.pinned')} <Code>{shortDigest(pinnedImage.image_digest)}</Code></Text>
            )}
            {pinnedImage?.image_update && (
                <Group gap="xs" wrap="wrap">
                    <Text size="xs" c="orange">{t('gpu.projects.image.updateAvailable')} <Code>{shortDigest(pinnedImage.image_update)}</Code></Text>
                    <Button size="compact-xs" variant="light" leftSection={<RotateCcw size={12} />} loading={busy} onClick={takeUpdate}>{t('gpu.projects.image.update')}</Button>
                </Group>
            )}
            {source === 'image' && (
                <Checkbox size="xs" label={t('gpu.projects.image.autoUpdate')} description={t('gpu.projects.image.autoUpdateHint')}
                    checked={!!p.image_auto_update} onChange={e => set('image_auto_update', e.currentTarget.checked)} />
            )}
            {source === 'image' && error && <Text size="xs" c="red">{error}</Text>}
            <Text size="xs">
                {t('gpu.projects.image.current')}{' '}
                {saved?.project_image ? <Code>{saved.project_image}</Code> : (bases.find(b => b.id === (saved?.image_base || defaultBase))?.name ?? '—')}
            </Text>
            <BuildLogModal slug={saved?.slug} build={build} opened={logOpen} onClose={() => setLogOpen(false)} />
        </Stack>
    );
}

// BaseChoice is the version of a base the project runs. Versions that run out are offered only to the project already on one, with a notice: until when, and a button that takes the successor (saved with the dialog). Admins see per version how many projects run it and until when, to know when an old one can go.
function BaseChoice({ bases, value, saved, onChange }) {
    const { t } = useTranslation();
    const { isAdmin } = useLlmMe();
    const byId = Object.fromEntries(bases.map(b => [b.id, b]));
    const usage = (b) => {
        if (!isAdmin) return '';
        const until = b.projects > 0 ? (b.last_end ? t('gpu.projects.image.baseUntil', { date: formatDay(b.last_end) }) : t('gpu.projects.image.baseOpenEnd')) : '';
        return [t('gpu.projects.image.baseProjects', { count: b.projects ?? 0 }), until].filter(Boolean).join(', ');
    };
    const offered = bases.filter(b => b.status !== 'deprecated' || b.id === value || b.id === saved);
    const current = byId[value];
    const successor = current?.status === 'deprecated' ? byId[current.replaced_by] : null;
    return (
        <Stack gap={4}>
            <Select label={t('gpu.projects.image.base')} allowDeselect={false} value={value} onChange={onChange}
                data={offered.map(b => ({ value: b.id, label: b.status === 'deprecated' ? t('gpu.projects.image.baseDeprecatedLabel', { name: b.name }) : b.name, usage: usage(b) }))}
                renderOption={({ option }) => (
                    <Text size="sm">{option.label}{option.usage && <Text span size="xs" c="dimmed">{` (${option.usage})`}</Text>}</Text>
                )} />
            {current?.status === 'deprecated' && (
                <Group gap="xs" wrap="wrap">
                    <Text size="xs" c="orange">
                        {current.end_of_life
                            ? t('gpu.projects.image.baseRunsOutOn', { name: current.name, date: formatDay(current.end_of_life), successor: successor?.name ?? current.replaced_by })
                            : t('gpu.projects.image.baseRunsOut', { name: current.name, successor: successor?.name ?? current.replaced_by })}
                    </Text>
                    {successor && <Button size="compact-xs" variant="light" onClick={() => onChange(successor.id)}>{t('gpu.projects.image.baseSwitch', { name: successor.name })}</Button>}
                </Group>
            )}
        </Stack>
    );
}

const RELEASE_KINDS = ['cpu', 'gpu'];
const RELEASE_FIELDS = ['idle_open_minutes', 'idle_closed_minutes', 'max_hours'];
const RELEASE_LABELS = { idle_open_minutes: 'gpu.release.idleOpen', idle_closed_minutes: 'gpu.release.idleClosed', max_hours: 'gpu.release.maxHours' };

// withTime sets one release time of a kind; null or '' clears it (inherited).
function withTime(release, kind, field, value) {
    const times = { ...(release?.[kind] ?? {}) };
    if (value === null || value === '' || value === undefined) delete times[field];
    else times[field] = Number(value);
    return { ...(release ?? {}), [kind]: times };
}

// ReleaseRow is one kind's three times: number fields (empty = inherited, shown as placeholder) and, where no upper bound is allowed, a checkbox for it. ceiling: the most each time may be (max_hours 0 = no upper bound allowed); null = no limit shown. defaults: the AI service's times of the kind where nothing is set (catalogue releaseDefaults), shown as placeholder of an empty field without a value above; missing, the placeholder says only "default".
export function ReleaseRow({ kind, value, inherited, ceiling, defaults, unlimitedAllowed, onChange }) {
    const { t, i18n } = useTranslation();
    const fmt = (field, v) => (field === 'max_hours' && v === 0 ? t('gpu.release.unlimited') : String(v));
    const standard = (field) => {
        const d = defaults?.[field];
        if (d === undefined || d === null) return t('gpu.release.standard');
        return t(field === 'max_hours' ? 'gpu.release.standardHours' : 'gpu.release.standardMinutes', { value: d });
    };
    return (
        <Stack gap={4}>
            <Text size="xs" fw={600}>{t(`gpu.release.kinds.${kind}`)}</Text>
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xs">
                {RELEASE_FIELDS.map(field => {
                    const own = value?.[field];
                    const from = inherited?.[field];
                    const ceil = ceiling?.[field];
                    const unlimited = field === 'max_hours' && own === 0;
                    const limit = field === 'max_hours' ? 24 * 30 : 24 * 60;
                    return (
                        <Stack key={field} gap={2}>
                            <NumberInput size="xs" label={t(RELEASE_LABELS[field])} min={1} max={ceil > 0 ? ceil : limit} clampBehavior="strict" allowDecimal={false}
                                value={unlimited || own === undefined || own === null ? '' : own} disabled={unlimited}
                                placeholder={from !== undefined && from !== null ? t('gpu.release.fromBudget', { value: fmt(field, from) }) : standard(field)}
                                description={ceil === undefined || ceil === null ? undefined : ceil === 0 ? t('gpu.release.unlimitedAllowed') : t('gpu.release.atMost', { value: ceil.toLocaleString(i18n.language) })}
                                onChange={v => onChange(field, v)} />
                            {field === 'max_hours' && unlimitedAllowed && (
                                <Checkbox size="xs" label={t('gpu.release.unlimited')} checked={unlimited}
                                    onChange={e => onChange(field, e.currentTarget.checked ? 0 : null)} />
                            )}
                        </Stack>
                    );
                })}
            </SimpleGrid>
        </Stack>
    );
}

// ReleaseTimes is the project's release times (docs/todo.md idle_release in aiaas-deployment): the project chooses within the budget's maximums, which the budget tree sets and which show as placeholders and limits; below what the servers and GPU kernels enforce now.
function ReleaseTimes({ draft, defaults }) {
    const { t, i18n } = useTranslation();
    const p = draft.value;
    const saved = draft.project;
    const ceiling = saved?.release_ceiling ?? {};
    const effective = saved?.release_effective;
    const set = (key, kind, field, v) => draft.update(cur => ({ ...cur, [key]: withTime(cur[key], kind, field, v) }));
    const fmt = (sec) => formatDuration(sec * 1000, i18n.language);
    const line = (r) => r ? `${fmt(r.idle_open)} / ${fmt(r.idle_closed)}, ${r.max > 0 ? fmt(r.max) : t('gpu.release.unlimited')}` : '';
    return (
        <Box title={t('gpu.release.title')} hint={t('gpu.release.hint')}>
            {RELEASE_KINDS.map(kind => (
                <ReleaseRow key={kind} kind={kind} value={p.release?.[kind]} inherited={p.release_max?.[kind]} ceiling={ceiling[kind]} defaults={defaults?.[kind]}
                    unlimitedAllowed={ceiling[kind]?.max_hours === 0} onChange={(field, v) => set('release', kind, field, v)} />
            ))}
            {effective && (
                <Text size="xs" c="dimmed">
                    {t('gpu.release.effective')}: {[...Object.entries(effective.servers ?? {}).map(([slug, r]) => `${t(`gpu.release.uses.${slug}`, { defaultValue: slug })} ${line(r)}`), effective.kernel && (p.profiles ?? []).includes('cpu-gpukernel') ? `${t('gpu.release.uses.kernel')} ${line(effective.kernel)}` : null].filter(Boolean).join(' · ')}
                </Text>
            )}
        </Box>
    );
}

// WorkspaceSettingsPanel is the dialog's "Workspaces" tab: the project ID and who may change what on top, the rest in sub-tabs (environment, limits, batch jobs, release times) instead of one long page, like the budget dialog's Workspaces tab.
export function WorkspaceSettingsPanel({ draft }) {
    const { t } = useTranslation();
    const api = useGpuApi();
    // A project's managers change only its description, members, environment, material and release times (within the budget's); profiles, limits and budgets are the admins' — the server keeps them as they are for anybody else, so they are shown, not offered for editing.
    const { isAdmin } = useLlmMe();
    const locked = !isAdmin;
    const catalog = useQuery({ queryKey: gpuKeys.catalog(), queryFn: () => api.catalog(), staleTime: 10 * 60 * 1000 });
    const p = draft.value;
    if (!p) return null;
    const set = (k, v) => draft.update(cur => ({ ...cur, [k]: v }));
    const setLimit = (k, v) => draft.update(cur => ({ ...cur, limits: { ...cur.limits, [k]: Number(v) || 0 } }));

    const budgets = p.budgets ?? [];
    const firstOwn = budgets.findIndex(b => !b.tree);
    // The project's own quotas show their use under their fields already; here only the shares this part sets.
    const status = (draft.project?.budget_status ?? []).filter(b => !b.tree);
    const setBudget = (i, patch) => set('budgets', budgets.map((x, j) => (j === i ? { ...x, ...patch } : x)));
    // As the service does: a person cannot hold more GPUs than the project has (0 without a GPU class, no cap when a class has none of its own).
    const gpuCap = projectGpuCap(p);

    return (
        <Stack gap="md">
            <ProjectId slug={draft.project?.slug} />
            {locked && <Text size="xs" c="dimmed">{t('gpu.projects.adminOnlyHint')}</Text>}
            <Tabs defaultValue="environment" variant="pills" radius="md">
                <Tabs.List mb="md">
                    <Tabs.Tab value="environment">{t('gpu.projects.sub.environment')}</Tabs.Tab>
                    <Tabs.Tab value="limits">{t('gpu.projects.sub.limits')}</Tabs.Tab>
                    <Tabs.Tab value="jobs">{t('gpu.projects.sub.jobs')}</Tabs.Tab>
                    <Tabs.Tab value="release">{t('gpu.projects.sub.release')}</Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="environment">
                    <Stack gap="md">
                    <Box title={t('gpu.projects.environments')}>
                        <MultiSelect label={t('gpu.projects.profiles')} description={p.tree_profiles ? t('gpu.projects.profilesFromTree') : t('gpu.projects.profilesHint')} value={p.profiles ?? []} onChange={v => set('profiles', v)} readOnly={locked || !!p.tree_profiles}
                            data={(catalog.data?.profiles ?? []).map(x => ({ value: x.slug, label: x.name }))} />
                        <ProjectImage draft={draft} set={set} bases={catalog.data?.bases ?? []} />
                    </Box>

                    <Box title={t('gpu.projects.material.title')} hint={t('gpu.projects.material.hint')}>
                        <GitSource value={{ url: p.material_git_url, ref: p.material_git_ref }} refLabel={t('gpu.projects.material.ref')}
                            onChange={({ url, ref }) => draft.update(cur => ({ ...cur, material_git_url: url, material_git_ref: ref }))} />
                    </Box>

                    {draft.project?.slug && (
                        <Box title={t('gpu.projects.credentials.title')} hint={t('gpu.projects.credentials.hint')}>
                            <ProjectCredentials slug={draft.project.slug} />
                        </Box>
                    )}
                    </Stack>
                </Tabs.Panel>
                <Tabs.Panel value="limits">
                    <Stack gap="md">
                    <Box title={t('gpu.projects.limits')} hint={t('gpu.projects.limitsHint')}>
                        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
                            <NumberInput label={t('gpu.projects.limit.serversShort')} description={t('gpu.projects.limit.noLimit')} min={0} value={p.limits.servers_per_person} onChange={v => setLimit('servers_per_person', v)} readOnly={locked} />
                            <NumberInput label={t('gpu.projects.limit.cpuShort')} description={t('gpu.projects.limit.noLimit')} min={0} decimalScale={1} value={p.limits.cpu_per_person} onChange={v => setLimit('cpu_per_person', v)} readOnly={locked} />
                            <NumberInput label={t('gpu.projects.limit.ramShort')} description={t('gpu.projects.limit.noLimit')} min={0} value={p.limits.ram_gb_per_person} onChange={v => setLimit('ram_gb_per_person', v)} readOnly={locked} />
                            <NumberInput label={t('gpu.projects.limit.gpusShort')} min={0} max={gpuCap >= 0 ? gpuCap : undefined} clampBehavior="strict"
                                value={gpuCap === 0 ? 0 : p.limits.gpus_per_person} onChange={v => setLimit('gpus_per_person', v)} readOnly={locked}
                                disabled={gpuCap === 0} description={t(gpuCap === 0 ? 'gpu.projects.limit.noGpus' : 'gpu.projects.limit.noGpu')} />
                        </SimpleGrid>
                    </Box>
                    <Box title={t('gpu.projects.budgets')} hint={t('gpu.projects.budgetsHint')}>
                        {status.length > 0 && <Stack gap={6}>{status.map((b, i) => <BudgetBar key={i} b={b} classes={catalog.data?.gpuClasses ?? []} />)}</Stack>}
                        {/* The project's own quotas arrive here as budgets too (tree); they are edited in the quotas tab, so only the limits set here are listed — the others are kept and sent back as they are. */}
                        {/* Without their use (status) the budgets are at least named. */}
                        {locked && status.length === 0 && budgets.filter(b => !b.tree).map((b, i) => <Text key={i} size="xs">{budgetText(t, b, catalog.data?.gpuClasses ?? [])}</Text>)}
                        {!locked && budgets.map((b, i) => (b.tree ? null : (
                            <Group key={i} gap="xs" wrap="nowrap" align="flex-end">
                                <NumberInput w={110} min={0} label={i === firstOwn ? t('gpu.projects.budget.amount') : undefined} value={b.amount}
                                    onChange={v => setBudget(i, { amount: Number(v) || 0 })} />
                                <Select w={170} allowDeselect={false} label={i === firstOwn ? t('gpu.projects.budget.unit') : undefined} value={b.unit}
                                    data={UNITS.map(u => ({ value: u, label: t(`gpu.projects.budget.units.${u}`) }))} onChange={v => setBudget(i, { unit: v })} />
                                {b.unit === 'gpu_hours' && (
                                    <Select w={170} clearable label={i === firstOwn ? t('gpu.projects.budget.class') : undefined} value={b.gpu_class || null}
                                        placeholder={t('gpu.projects.budget.allClasses')} data={(catalog.data?.gpuClasses ?? []).map(c => ({ value: c.id, label: c.name }))} onChange={v => setBudget(i, { gpu_class: v || '' })} />
                                )}
                                <Select w={130} allowDeselect={false} label={i === firstOwn ? t('gpu.projects.budget.window') : undefined} value={b.window}
                                    data={WINDOWS.map(w => ({ value: w, label: t(`gpu.projects.budget.windows.${w}`) }))} onChange={v => setBudget(i, { window: v })} />
                                <Checkbox label={t('gpu.projects.budget.perPerson')} checked={!!b.per_person} mb={8}
                                    onChange={e => setBudget(i, { per_person: e.currentTarget.checked })} />
                                <ActionIcon variant="subtle" color="red" mb={4} aria-label={t('gpu.projects.remove')} onClick={() => set('budgets', budgets.filter((_, j) => j !== i))}><X size={16} /></ActionIcon>
                            </Group>
                        )))}
                        {!locked && (
                            <Button size="xs" variant="subtle" leftSection={<Plus size={14} />} w="fit-content"
                                onClick={() => set('budgets', [...budgets, { unit: 'vcpu_hours', window: '30d', amount: 40, per_person: true }])}>{t('gpu.projects.addBudget')}</Button>
                        )}
                    </Box>
                    </Stack>
                </Tabs.Panel>
                <Tabs.Panel value="jobs">
                    <BatchJobsBox p={p} setLimit={setLimit} locked={locked} classes={catalog.data?.gpuClasses ?? []} />
                </Tabs.Panel>
                <Tabs.Panel value="release">
                    <ReleaseTimes draft={draft} defaults={catalog.data?.releaseDefaults} />
                </Tabs.Panel>
            </Tabs>
        </Stack>
    );
}

// BatchJobsBox is whether the project allows batch jobs and their bounds there: a switch instead of "0 = none" (on sets DEFAULT_JOBS_PER_PERSON), how many a person may have waiting and running at once, and the longest one may run. Where the project's budgets set them (tree_jobs) they come from there and are locked, as the profiles are. Below it, in grey, what comes from the project's budget: the priority, its GPUs and its GPU hours. Without a GPU class the project cannot run jobs, so the switch stays off. Also the dialog of the jobs page (job-settings.jsx).
export function BatchJobsBox({ p, setLimit, locked: lockedByRole, classes }) {
    const { t } = useTranslation();
    const fromTree = !!p.tree_jobs;
    const locked = lockedByRole || fromTree;
    const gpuClasses = p.gpu_classes ?? [];
    const on = (p.limits.jobs_per_person ?? 0) > 0;
    const hours = jobMaxHours(p);
    const hourChoices = [...new Set([...JOB_HOUR_CHOICES, hours])].sort((a, b) => a - b).map(h => ({ value: String(h), label: t('gpu.projects.jobs.hours', { count: h }) }));
    const className = (id) => classes.find(c => c.id === id)?.name || id;
    const gpus = gpuClasses.map(c => (p.gpus_by_class?.[c] ? t('gpu.projects.jobs.gpusOfClass', { count: p.gpus_by_class[c], cls: className(c) }) : className(c))).join(', ');
    const gpuHours = (p.budgets ?? []).filter(b => b.tree && b.unit === 'gpu_hours').map(b => budgetText(t, b, classes)).join(', ');
    return (
        <Box title={t('gpu.projects.jobs.title')}>
            <Switch label={t('gpu.projects.jobs.allow')} checked={on} disabled={locked || (!on && gpuClasses.length === 0)}
                description={fromTree ? t('gpu.projects.jobs.fromTree') : gpuClasses.length === 0 ? t('gpu.projects.jobs.noGpu') : t('gpu.projects.jobs.allowHint')}
                onChange={e => setLimit('jobs_per_person', e.currentTarget.checked ? DEFAULT_JOBS_PER_PERSON : 0)} />
            {on && (
                <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="xs">
                    <NumberInput label={t('gpu.projects.jobs.perPerson')} description={t('gpu.projects.jobs.perPersonHint')} min={1} allowDecimal={false} clampBehavior="strict"
                        value={p.limits.jobs_per_person} onChange={v => setLimit('jobs_per_person', Math.max(1, Number(v) || 1))} readOnly={locked} />
                    <Select label={t('gpu.projects.jobs.maxHours')} description={t('gpu.projects.jobs.maxHoursHint')} allowDeselect={false} data={hourChoices}
                        value={String(hours)} onChange={v => setLimit('job_max_hours', v)} readOnly={locked} />
                </SimpleGrid>
            )}
            {gpuClasses.length > 0 && (
                <Stack gap={2}>
                    <Text size="xs" c="dimmed">{t(p.batch_priority === 'guaranteed' ? 'gpu.projects.jobs.guaranteed' : 'gpu.projects.jobs.preemptible')}</Text>
                    <Text size="xs" c="dimmed">{t('gpu.projects.jobs.gpus', { gpus })}</Text>
                    {gpuHours && <Text size="xs" c="dimmed">{t('gpu.projects.jobs.gpuHours', { budgets: gpuHours, hours })}</Text>}
                </Stack>
            )}
        </Box>
    );
}

// projectGpuCap mirrors ProjectGPUCap in the AI service: the sum of the project's GPUs over its classes, 0 without a class, -1 when a class has no cap.
function projectGpuCap(p) {
    const classes = p.gpu_classes ?? [];
    let total = 0;
    for (const c of classes) {
        const n = p.gpus_by_class?.[c] ?? 0;
        if (n === 0) return -1;
        total += n;
    }
    return total;
}
