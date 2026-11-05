import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useSearch } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Alert, Anchor, Badge, Button, Checkbox, Code, Collapse, Container, Group, Loader, Paper, Progress, Radio, Select, SimpleGrid, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { ChevronDown, ChevronRight, Copy, Play } from 'lucide-react';
import { LoadError, Loading } from '/helper/query-state.jsx';
import { useGpuApi } from '/gpu/api-gpu.jsx';
import { gpuKeys } from '/gpu/query-keys.js';
import { SPLIT_GUIDE_URL, profileLabel } from '/gpu/profiles.js';
import { BuildLogBody, useBuildLog } from '/gpu/build-log.jsx';
import { formatDuration } from '/helper/duration.js';
import { kernelReleaseOf, oneDot, releaseOf, releaseText } from '/gpu/release.js';
import { NoStartableProject } from '/gpu/start-empty.jsx';

// Starting a server (Workspaces → Server → Server starten): the hub has no start form of its own any more, its start page leads here. The choice is in the URL (?project=<slug>&env=<profile>&gpu_class=<class>&llm=<slug>|none), so a link to this page with a project and an environment can go out to a course; the page offers only what the person's projects allow and starts through llm-management-api, where the hub checks the start as every start. While the server starts the page waits, then opens it in this tab.

const SPLIT_PROFILE = 'cpu-gpukernel';

// NO_LLM is the choice llm_project that starts a workspace without an LLM key (the AI service's gpu.NoLLM).
export const NO_LLM = 'none';

// llmDefault is whose LLM tokens a workspace of the project uses when nothing is chosen, as the AI service answers it in the start options (llm_default: the project's setting, else its own tokens, else the person's first LLM project, else none).
export function llmDefault(project) {
    return project?.llm_default || NO_LLM;
}

// llmChoice is what the start uses: the wanted choice (from the form or the link) when it is one of the person's LLM projects or none, else the default.
export function llmChoice(wanted, project, llmProjects) {
    if (wanted === NO_LLM || llmProjects.some(p => p.slug === wanted)) return wanted;
    return llmDefault(project);
}

// startBody is the start request of the choice; the default goes as an empty llm_project, so the service applies the project's rule itself (a set LLM project the person is no member of: without LLM, with the reason in the hub's log).
export function startBody(project, profile, gpuClass, llm) {
    return { project: project.slug, profile: profile.slug, gpu_class: profile.gpu ? gpuClass?.id ?? '' : '', llm_project: llm === llmDefault(project) ? '' : llm };
}

// startLink is this page with a choice, for others to follow; with autostart the page starts it right away (or opens the one already running). llm only when it differs from the default, so a link without it follows the project's setting for everybody.
export function startLink(base, { project, env, gpuClass, llm, autostart }) {
    const q = new URLSearchParams();
    if (project) q.set('project', project);
    if (env) q.set('env', env);
    if (gpuClass) q.set('gpu_class', gpuClass);
    if (llm) q.set('llm', llm);
    if (autostart) q.set('autostart', '1');
    const url = new URL(base);
    url.search = q.toString();
    return url.toString();
}

// envsOf are the profiles a project offers, in the catalogue's order; the split profile needs an environment built on one of our bases.
export function envsOf(project, profiles) {
    if (!project) return [];
    return profiles.filter(p => project.profiles?.includes(p.slug) && (p.slug !== SPLIT_PROFILE || project.image_derived));
}

// limitsText are the release times of a profile in the project (what the hub enforces: the project's, else the profile's from before), after its description; for "CPU + GPU-Kernel" also the GPU kernels'.
function limitsText(p, project, t, lang) {
    const r = releaseOf(project, p.slug);
    if (r) {
        const kernel = p.slug === SPLIT_PROFILE ? kernelReleaseOf(project) : null;
        return ' ' + releaseText(r, t, lang) + (kernel ? ' ' + oneDot(t('gpu.release.kernel', { text: releaseText(kernel, t, lang) })) : '');
    }
    if (!p.idle_minutes || !p.max_hours) return '';
    return ' ' + oneDot(t('gpu.start.limits', { idle: formatDuration(p.idle_minutes * 60000, lang), max: formatDuration(p.max_hours * 3600000, lang) }));
}

function day(iso) {
    return iso ? new Date(iso).toLocaleDateString(undefined, { timeZone: 'UTC' }) : '';
}

export function GpuStart() {
    const { t, i18n } = useTranslation();
    const api = useGpuApi();
    const params = new URLSearchParams(useSearch());
    const clipboard = useClipboard({ timeout: 1500 });
    // Asked again while an environment is being built, so the start opens up when the image is there.
    const options = useQuery({
        queryKey: gpuKeys.startOptions(),
        queryFn: () => api.startOptions(),
        refetchInterval: (q) => ((q.state.data?.projects ?? []).some(p => p.image_pending && p.image_build?.status === 'building') ? 10 * 1000 : false),
    });

    const allProjects = options.data?.projects ?? [];
    const profiles = options.data?.profiles ?? [];
    // Offered are exactly the projects a start is possible in: active ones with workspaces (what the service answers) that allow at least one environment. The others are named in the empty state, so the person learns why nothing can be started there.
    const projects = allProjects.filter(p => envsOf(p, profiles).length > 0);
    const blocked = allProjects.filter(p => envsOf(p, profiles).length === 0);
    const [projectSlug, setProjectSlug] = useState(params.get('project') || '');
    const [env, setEnv] = useState(params.get('env') || '');
    const [gpuClass, setGpuClass] = useState(params.get('gpu_class') || '');
    const [llm, setLlm] = useState(params.get('llm') || '');
    const llmProjects = options.data?.llm_projects ?? [];

    const project = projects.find(p => p.slug === projectSlug) ?? projects[0];
    const envs = envsOf(project, profiles);
    const profile = envs.find(p => p.slug === env) ?? envs[0];
    const classes = profile?.gpu ? (project?.gpu_classes ?? []) : [];
    const chosenClass = classes.find(c => c.id === gpuClass) ?? classes.find(c => c.available) ?? classes[0];
    // What the URL asked for and this person cannot start, said once above the form.
    const linkedProject = params.get('project');
    const linkedBlocked = !!linkedProject && blocked.find(p => p.slug === linkedProject);
    const unknownProject = !!linkedProject && !!options.data && !projects.some(p => p.slug === linkedProject) && !linkedBlocked;
    const unknownEnv = !unknownProject && !!params.get('env') && !!project && !envs.some(p => p.slug === params.get('env'));
    // Whose LLM tokens the workspace's key draws from (VS Code's chat, the agents, OPENAI_API_KEY).
    const chosenLlm = llmChoice(llm, project, llmProjects);
    const unknownLlm = !!params.get('llm') && !!options.data && llm === params.get('llm') && chosenLlm !== llm;

    // startedAt: a server list from before the start must not count as "no longer there".
    const [startedAt, setStartedAt] = useState(0);
    const start = useMutation({ mutationFn: (body) => api.startServer(body), onSuccess: () => setStartedAt(Date.now()) });
    const started = start.data;
    // A link with autostart starts the choice in it as soon as the page has what it needs; the servers running already are looked at first.
    const autostart = params.get('autostart') === '1';
    const [linkAutostart, setLinkAutostart] = useState(false);
    // While it starts: poll the servers, open it once it is ready.
    const servers = useQuery({ queryKey: gpuKeys.servers(), queryFn: () => api.listServers(), enabled: !!started || autostart, refetchInterval: started ? 3000 : false });
    const live = started && servers.data?.find(s => s.name === started.name);
    // The hub's event log of the start (as on the hub's own page); asked again until it ended.
    const progress = useQuery({
        queryKey: gpuKeys.progress(started?.name),
        queryFn: () => api.serverProgress(started.name),
        enabled: !!started,
        refetchInterval: (q) => (q.state.data?.ready || q.state.data?.failed ? false : 2500),
    });
    useEffect(() => {
        if (live?.ready && live.url) window.location.assign(live.url);
    }, [live?.ready, live?.url]);

    // Autostart, once: only exactly what the link names (no fallback to another project, environment or LLM choice), only once the environment is built; a workspace of that project and environment already running is opened instead of a second one.
    const autostarted = useRef(false);
    const exact = !!project && project.slug === params.get('project') && !!profile && profile.slug === params.get('env') && !unknownLlm;
    useEffect(() => {
        if (!autostart || autostarted.current || !exact || project.image_pending || !servers.data || start.isPending || started) return;
        autostarted.current = true;
        const running = servers.data.find(s => s.project === project.slug && s.profile === profile.slug && (s.ready || s.pending === 'spawn'));
        if (running?.ready && running.url) {
            window.location.assign(running.url);
        } else if (!running) {
            start.mutate(startBody(project, profile, chosenClass, chosenLlm));
        }
    }, [autostart, exact, project, profile, chosenClass, chosenLlm, servers.data, start, started]);

    if (options.isPending) return <Container size="lg" py="md"><Loading /></Container>;
    if (options.isError) return <Container size="lg" py="md"><LoadError query={options} /></Container>;

    const choice = { project: project?.slug, env: profile?.slug, gpuClass: classes.length > 1 ? chosenClass?.id : '', llm: chosenLlm !== llmDefault(project) ? chosenLlm : '', autostart: linkAutostart };
    const link = startLink(window.location.href, choice);

    if (started) {
        const p = progress.data;
        // Ended without becoming ready: the hub's reason when it has one, else the hub has nothing starting and a server list fetched after the start no longer has it.
        const failed = !!p?.failed;
        const gone = failed || (!!p && !p.starting && !p.ready && servers.dataUpdatedAt > startedAt && servers.data && !live);
        const events = p?.events ?? [];
        const last = events[events.length - 1];
        return (
            <Container size="md" py="md">
                <Paper p="lg" radius="md" withBorder>
                    <Stack gap="sm">
                        <Title order={3}>{t('gpu.start.startingTitle', { name: projects.find(x => x.slug === started.project)?.name || started.project || started.name })}</Title>
                        {gone ? (
                            <Alert color="red" variant="light" title={failed ? t('gpu.start.failedTitle') : undefined}>
                                {failed && p.message ? p.message : t('gpu.start.gone')}
                            </Alert>
                        ) : (
                            <>
                                <Group gap="sm" wrap="nowrap">
                                    <Loader size="sm" />
                                    <Text size="sm">{last?.message || (profile?.gpu ? t('gpu.start.waitingGpu') : t('gpu.start.waiting'))}</Text>
                                </Group>
                                <Progress value={last?.progress ?? 0} size="sm" animated />
                            </>
                        )}
                        <StartLog events={events} open={failed} />
                        <Anchor component={Link} href="/servers" size="sm">{t('gpu.start.toServers')}</Anchor>
                    </Stack>
                </Paper>
            </Container>
        );
    }

    return (
        <Container size="lg" py="md">
            <Paper p="lg" radius="md" withBorder>
                <Stack gap="md">
                    <div>
                        <Title order={3}>{t('gpu.start.title')}</Title>
                        {projects.length > 0 && <Text size="sm" c="dimmed" mt={4}>{t(projects.length === 1 ? 'gpu.start.introSingle' : 'gpu.start.intro')}</Text>}
                    </div>
                    {unknownProject && <Alert color="orange" variant="light">{t('gpu.start.unknownProject', { project: linkedProject })}</Alert>}
                    {linkedBlocked && projects.length > 0 && <Alert color="orange" variant="light">{t('gpu.start.blockedProject', { project: linkedBlocked.name || linkedBlocked.slug })}</Alert>}
                    {unknownEnv && <Alert color="orange" variant="light">{t('gpu.start.unknownEnv', { env: profileLabel(params.get('env'), t) })}</Alert>}
                    {unknownLlm && <Alert color="orange" variant="light">{t('gpu.start.unknownLlm', { project: params.get('llm') })}</Alert>}
                    {projects.length === 0 ? (
                        <NoStartableProject blocked={blocked} />
                    ) : (
                        <>
                            <Stack gap={6}>
                                <Title order={5}>{t('gpu.start.project')}</Title>
                                {projects.length > 1 ? (
                                    <Select allowDeselect={false} value={project.slug} onChange={setProjectSlug} maw={480}
                                        data={projects.map(p => ({ value: p.slug, label: p.name || p.slug }))} />
                                ) : (
                                    // The only project, shown like a filled-in field: nothing to choose, but it is clear which one is used.
                                    <Text size="sm">
                                        <Text span fw={600}>{project.name || project.slug}</Text>
                                        <Text span size="sm" c="dimmed">{` (${t('gpu.start.onlyProject')})`}</Text>
                                    </Text>
                                )}
                                <Text size="xs" c="dimmed">
                                    {t('gpu.start.booked')}{project.image_label ? ' ' + t('gpu.start.image', { image: project.image_label }) : ''}
                                </Text>
                                {project.storage_gb > 0
                                    ? <Text size="xs" c="dimmed">{t('gpu.start.storage', { gb: project.storage_gb })}</Text>
                                    : <Text size="xs" c="red">{t('gpu.start.noStorage')}</Text>}
                                {/* The local storage outside the home (scratch_gb, from an AI service that sends it): above it the workspace is ended. */}
                                {project.scratch_gb > 0 && (
                                    <Text size="xs" c="dimmed">{t(project.storage_gb > 0 ? 'gpu.start.scratch' : 'gpu.start.scratchNoStorage', { gb: project.scratch_gb })}</Text>
                                )}
                                {project.ends_at && (
                                    <Text size="xs" c="orange">
                                        {t('gpu.start.ends', { date: day(project.ends_at) })}
                                        {project.delete_at ? ' ' + t('gpu.start.deletes', { date: day(project.delete_at) }) : ''}
                                    </Text>
                                )}
                            </Stack>

                            <Stack gap={6}>
                                <Title order={5}>{t('gpu.start.env')}</Title>
                                {envs.length > 0 && (
                                    <Radio.Group value={profile.slug} onChange={setEnv}>
                                        <SimpleGrid cols={{ base: 1, sm: Math.min(envs.length, 3) }} spacing="sm">
                                            {envs.map(p => (
                                                <Radio.Card key={p.slug} value={p.slug} radius="md" p="md" withBorder
                                                    style={p.slug === profile.slug ? { borderColor: 'var(--mantine-primary-color-filled)' } : undefined}>
                                                    <Group gap="xs" wrap="nowrap" align="flex-start">
                                                        <Radio.Indicator />
                                                        <div>
                                                            <Group gap={6}>
                                                                <Text fw={600}>{profileLabel(p.slug, t)}</Text>
                                                                {p.gpu && <Badge size="xs" variant="light" color="grape">GPU</Badge>}
                                                            </Group>
                                                            <Text size="xs" c="dimmed" mt={4}>{t(`gpu.start.envs.${p.slug}`, { defaultValue: '' })}{limitsText(p, project, t, i18n.language)}</Text>
                                                        </div>
                                                    </Group>
                                                </Radio.Card>
                                            ))}
                                        </SimpleGrid>
                                    </Radio.Group>
                                )}
                                {classes.length > 1 && (
                                    <Select label={t('gpu.start.gpuClass')} allowDeselect={false} maw={480} value={chosenClass?.id} onChange={setGpuClass}
                                        data={classes.map(c => ({ value: c.id, label: c.available ? c.name : t('gpu.start.noGpuNow', { name: c.name }), hardware: c.hardware }))}
                                        renderOption={({ option }) => <ClassOption label={option.label} hardware={option.hardware} />}
                                        description={chosenClass?.hardware ? `(${chosenClass.hardware})` : undefined} />
                                )}
                                {classes.length === 1 && (
                                    <Text size="sm">
                                        {t('gpu.start.gpuClassOnly')} {classes[0].name}
                                        {classes[0].hardware && <Text span size="sm" c="dimmed">{` (${classes[0].hardware})`}</Text>}
                                    </Text>
                                )}
                            </Stack>

                            <LlmChoice project={project} llmProjects={llmProjects} value={chosenLlm} onChange={setLlm} />

                            {project.split_needs_base && <SplitNeedsBase />}
                            {project.image_pending && <BuildState project={project} />}
                            {start.isError && <Alert color="red" variant="light">{start.error?.message}</Alert>}
                            <Group gap="sm">
                                <Button leftSection={<Play size={16} />} disabled={!profile || project.image_pending} loading={start.isPending}
                                    onClick={() => start.mutate(startBody(project, profile, chosenClass, chosenLlm))}>
                                    {t('gpu.start.start')}
                                </Button>
                                <Button variant="subtle" leftSection={<Copy size={16} />} disabled={!profile} onClick={() => clipboard.copy(link)}>
                                    {clipboard.copied ? t('gpu.start.copied') : t('gpu.start.copyLink')}
                                </Button>
                                <Checkbox size="xs" label={t('gpu.start.autostart')} checked={linkAutostart} onChange={(e) => setLinkAutostart(e.currentTarget.checked)} disabled={!profile} />
                            </Group>
                            <Text size="xs" c="dimmed">{t(linkAutostart ? 'gpu.start.linkHintAuto' : 'gpu.start.linkHint')}</Text>
                        </>
                    )}
                </Stack>
            </Paper>
        </Container>
    );
}

// LlmChoice is whose LLM tokens the workspace's key draws from: one of the person's projects with LLM tokens, or none (no key, no DHBW models in VS Code and the agents). Preselected is what the project's rule gives (llm_default), marked as its default and explained by where it comes from (llm_default_source). Without any LLM project there is nothing to choose, only the note that the workspace has no LLM.
export function LlmChoice({ project, llmProjects, value, onChange }) {
    const { t } = useTranslation();
    const def = llmDefault(project);
    const unavailable = !!project.llm_default_unavailable && value === def;
    if (llmProjects.length === 0) {
        return (
            <Stack gap={6}>
                <Title order={5}>{t('gpu.start.llm')}</Title>
                <Text size="xs" c="dimmed">{t(unavailable ? 'gpu.start.llmPresetUnavailable' : 'gpu.start.llmNoProjects', { project: project.default_llm_project })}</Text>
            </Stack>
        );
    }
    const name = (slug) => { const p = llmProjects.find(x => x.slug === slug); return p?.name || slug; };
    const source = value === def ? project.llm_default_source : 'chosen';
    let hint;
    if (unavailable) hint = t('gpu.start.llmPresetUnavailable', { project: project.default_llm_project });
    else if (value === NO_LLM) hint = t(source === 'preset' ? 'gpu.start.llmPresetNone' : 'gpu.start.llmNoneHint');
    else if (value === project.slug) hint = t('gpu.start.llmOwn');
    else if (source === 'preset') hint = t('gpu.start.llmPreset', { project: name(value) });
    else if (source === 'fallback') hint = t('gpu.start.llmFallback', { project: name(value) });
    else hint = t('gpu.start.llmOther', { project: name(value) });
    const mark = (v, label) => (v === def ? `${label} (${t('gpu.start.llmDefaultMark')})` : label);
    return (
        <Stack gap={6}>
            <Title order={5}>{t('gpu.start.llm')}</Title>
            <Select allowDeselect={false} value={value} onChange={onChange} maw={480} description={hint} aria-label={t('gpu.start.llm')}
                data={[...llmProjects.map(p => ({ value: p.slug, label: mark(p.slug, p.name || p.slug) })), { value: NO_LLM, label: mark(NO_LLM, t('gpu.start.llmNone')) }]} />
        </Stack>
    );
}

// StartLog is the hub's event log of a start, folded away until asked for; open from the start when the start failed.
export function StartLog({ events, open: openFromStart }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    // A click flips what the start chose, so a failed start's open log can be folded too.
    const shown = openFromStart ? !open : open;
    return (
        <div>
            <UnstyledButton onClick={() => setOpen(o => !o)}>
                <Group gap={4}>
                    {shown ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <Text size="sm" c="dimmed">{shown ? t('gpu.start.hideLog') : t('gpu.start.showLog')}</Text>
                </Group>
            </UnstyledButton>
            <Collapse expanded={shown}>
                {events.length === 0 ? (
                    <Text size="xs" c="dimmed" mt={6}>{t('gpu.start.noEvents')}</Text>
                ) : (
                    <Code block mt={6} style={{ maxHeight: 300, overflow: 'auto' }}>
                        {events.map(e => `${String(e.progress).padStart(3)} %  ${e.message}`).join('\n')}
                    </Code>
                )}
            </Collapse>
        </div>
    );
}

// SplitNeedsBase says that the project would offer "CPU + GPU kernel" in an environment built on one of our bases (split_needs_base), and where to read how.
export function SplitNeedsBase() {
    const { t } = useTranslation();
    return (
        <Alert color="blue" variant="light" title={t('gpu.start.splitNeedsBaseTitle')}>
            <Stack gap={6}>
                <Text size="sm">{t('gpu.start.splitNeedsBase')}</Text>
                <Anchor href={SPLIT_GUIDE_URL} target="_blank" rel="noopener" size="sm">{t('gpu.start.splitNeedsBaseLink')}</Anchor>
            </Stack>
        </Alert>
    );
}

// BuildState says why a project cannot start yet: its environment is being built from Git, or the build failed. The build's state and log are there for those who may read them (managers, admins); for the others the request is refused and only the status shows.
function BuildState({ project }) {
    const { t } = useTranslation();
    const building = project.image_build?.status !== 'failed';
    const log = useBuildLog(project.slug, building);
    return (
        <Alert color={building ? 'blue' : 'red'} variant="light" title={building ? t('gpu.start.buildingTitle') : t('gpu.start.buildFailedTitle')}>
            <Stack gap={6}>
                <Group gap="sm" wrap="nowrap" align="flex-start">
                    {building && <Loader size="xs" mt={2} />}
                    <Text size="sm">{building ? t('gpu.start.building') : t('gpu.start.buildFailed')}</Text>
                </Group>
                {log.data ? <BuildLogBody build={project.image_build} data={log.data} /> : (!building && project.image_build?.message && <Text size="sm" fw={500}>{project.image_build.message}</Text>)}
            </Stack>
        </Alert>
    );
}

// ClassOption is a GPU class in the choice: its name, and dimmed in brackets what a GPU of it is (e.g. "L4-3Q · 3 GB"), so one knows what one gets.
function ClassOption({ label, hardware }) {
    return (
        <Text size="sm">
            {label}{hardware && <Text span size="sm" c="dimmed">{` (${hardware})`}</Text>}
        </Text>
    );
}
