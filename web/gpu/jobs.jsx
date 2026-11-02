import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useSearch } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Alert, Anchor, Badge, Button, Code, Container, Group, Paper, Select, SimpleGrid, Stack, Table, Text, Title, Tooltip } from '@mantine/core';
import { ArrowLeft, Play, Square } from 'lucide-react';
import { LoadError, Loading, useApiMutation } from '/helper/query-state.jsx';
import { useConfirm } from '/providers/confirm.jsx';
import { useLlmMe } from '/llm/use-llm-me.jsx';
import { useGpuApi } from '/gpu/api-gpu.jsx';
import { gpuKeys } from '/gpu/query-keys.js';
import { isActive, projectHasJobs } from '/gpu/jobs.js';
import { ProjectId } from '/gpu/project-id.jsx';
import { JobSettingsModal } from '/gpu/job-settings.jsx';
import { formatDateTime } from '/format-date.js';
import { formatDuration } from '/helper/duration.js';

// Batch jobs (Workspaces → Batch-Jobs): GPU jobs without a workspace. The list shows the person's own jobs, filtered by project (?project=<slug>) the person's jobs there, or all of the project for its managers and admins (the AI service decides). A job opens to its output and can be cancelled while it waits or runs; new ones are submitted at /jobs/new (job-submit.jsx).

const STATE_COLOUR = { queued: 'gray', running: 'blue', succeeded: 'teal', failed: 'red', cancelled: 'gray' };

// How often the lists and a job are asked again while something waits or runs.
const REFRESH_MS = 10 * 1000;
const LOG_REFRESH_MS = 5 * 1000;
// How much of the output the detail view shows.
const LOG_LINES = 300;

export function JobState({ job }) {
    const { t } = useTranslation();
    return (
        <Stack gap={2}>
            <Badge variant="light" color={STATE_COLOUR[job.state] ?? 'gray'} style={{ textTransform: 'none' }} w="fit-content">
                {t(`gpu.jobs.states.${job.state}`, { defaultValue: job.state })}
            </Badge>
            {job.state === 'queued' && job.position > 0 && <Text size="xs" c="dimmed">{t('gpu.jobs.position', { position: job.position })}</Text>}
            {job.evictions > 0 && <Text size="xs" c="orange">{t('gpu.jobs.evictions', { count: job.evictions })}</Text>}
        </Stack>
    );
}

// outcome is how a job ended: its exit code and the reason, where there are any.
function outcome(job, t) {
    const parts = [];
    if (job.exit_code !== undefined && job.exit_code !== null && !isActive(job) && job.state !== 'cancelled') parts.push(t('gpu.jobs.exitCode', { code: job.exit_code }));
    if (job.reason) parts.push(job.reason);
    return parts.join(' · ');
}

// runTime is how long the job ran (or runs, up to now).
function runTime(job, lang) {
    if (!job.started) return '';
    const end = job.ended ? new Date(job.ended).getTime() : Date.now();
    return formatDuration(end - new Date(job.started).getTime(), lang);
}

// notAllowedKey is the text for a project without batch jobs: its budget says no (tree_jobs), its budget could allow them (a project in the budget tree), or, outside the tree, the admins decide.
export function notAllowedKey(project, isAdmin) {
    if (project?.tree_jobs) return 'gpu.jobs.notAllowedByBudget';
    if (isAdmin) return 'gpu.jobs.notAllowedAdmin';
    return project?.tree_node ? 'gpu.jobs.notAllowed' : 'gpu.jobs.notAllowedNoBudget';
}

export function GpuJobs() {
    const { t, i18n } = useTranslation();
    const api = useGpuApi();
    const { me, isAdmin } = useLlmMe();
    const [settingsOpen, setSettingsOpen] = useState(false);
    const params = new URLSearchParams(useSearch());
    const [, navigate] = useLocation();
    const project = params.get('project') || '';

    // The person's projects, for the filter and to name a job's project.
    const projects = useQuery({ queryKey: gpuKeys.projects(false), queryFn: () => api.listProjects(false) });
    const jobs = useQuery({
        queryKey: gpuKeys.jobs(project),
        queryFn: () => api.listJobs(project),
        refetchInterval: (q) => ((q.state.data ?? []).some(isActive) ? REFRESH_MS : false),
    });
    const projectName = (slug) => projects.data?.find(p => p.slug === slug)?.name || slug;
    const withJobs = (projects.data ?? []).filter(projectHasJobs);
    const chosen = projects.data?.find(p => p.slug === project);
    const manages = chosen?.role === 'manager' || chosen?.role === 'admin';
    const own = (j) => !me?.email || j.person?.toLowerCase() === me.email.toLowerCase();

    return (
        <Container size="xl" py="md">
            <Paper p="lg" radius="md" withBorder>
                <Group justify="space-between" align="flex-start" wrap="wrap">
                    <div style={{ maxWidth: 720 }}>
                        <Title order={3}>{t('gpu.jobs.title')}</Title>
                        <Text size="sm" c="dimmed" mt={4}>{t('gpu.jobs.intro')}</Text>
                    </div>
                    <Button size="xs" component={Link} href={project ? `/jobs/new?project=${encodeURIComponent(project)}` : '/jobs/new'} variant="light" leftSection={<Play size={14} />}
                        disabled={projects.isSuccess && withJobs.length === 0}>
                        {t('gpu.jobs.submitJob')}
                    </Button>
                </Group>
                <Group mt="md" gap="sm" align="flex-end">
                    <Select size="xs" w={320} clearable label={t('gpu.jobs.project')} placeholder={t('gpu.jobs.allOwn')} value={project || null}
                        data={(projects.data ?? []).map(p => ({ value: p.slug, label: p.name || p.slug }))}
                        onChange={(v) => navigate(v ? `/jobs?project=${encodeURIComponent(v)}` : '/jobs', { replace: true })} />
                    {project && <Text size="xs" c="dimmed" mb={6}>{t(manages ? 'gpu.jobs.allOfProject' : 'gpu.jobs.ownInProject')}</Text>}
                    {project && <ProjectId slug={project} mb={4} />}
                </Group>
                {/* Where jobs are missing, say who switches them on: the budget when it says no (tree_jobs) or, for a project in the budget tree, may say yes; an admin right here where the budget sets nothing. */}
                {chosen && !projectHasJobs(chosen) && (
                    <Alert color="gray" variant="light" mt="md">
                        <Group justify="space-between" gap="sm">
                            <Text size="sm">{t(notAllowedKey(chosen, isAdmin))}</Text>
                            {isAdmin && !chosen.tree_jobs && <Button size="xs" variant="light" onClick={() => setSettingsOpen(true)}>{t('gpu.jobs.enable')}</Button>}
                        </Group>
                    </Alert>
                )}
                {!chosen && projects.isSuccess && withJobs.length === 0 && <Alert color="gray" variant="light" mt="md">{t(isAdmin ? 'gpu.jobs.noProjectAdmin' : 'gpu.jobs.noProject')}</Alert>}
                {isAdmin && chosen && <JobSettingsModal key={chosen.slug} project={chosen} opened={settingsOpen} onClose={() => setSettingsOpen(false)} />}
                {jobs.isPending && <Loading />}
                {jobs.isError && <LoadError query={jobs} />}
                {jobs.isSuccess && (
                    <Table.ScrollContainer minWidth={760}>
                        <Table striped highlightOnHover mt="md">
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>{t('gpu.jobs.name')}</Table.Th>
                                    <Table.Th>{t('gpu.jobs.state')}</Table.Th>
                                    <Table.Th>{t('gpu.jobs.gpuClass')}</Table.Th>
                                    <Table.Th>{t('gpu.jobs.gpuHours')}</Table.Th>
                                    <Table.Th>{t('gpu.jobs.times')}</Table.Th>
                                    <Table.Th>{t('gpu.jobs.outcome')}</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {jobs.data.length === 0 && (
                                    <Table.Tr><Table.Td colSpan={6}><Text size="sm" c="dimmed">{t('gpu.jobs.none')}</Text></Table.Td></Table.Tr>
                                )}
                                {jobs.data.map(j => (
                                    <Table.Tr key={j.id}>
                                        <Table.Td>
                                            <Anchor component={Link} href={`/jobs/${encodeURIComponent(j.id)}`} size="sm" fw={500}>{j.name || j.id}</Anchor>
                                            <Text size="xs" c="dimmed">{projectName(j.project)}</Text>
                                            {!own(j) && <Text size="xs" c="dimmed">{j.person}</Text>}
                                        </Table.Td>
                                        <Table.Td><JobState job={j} /></Table.Td>
                                        <Table.Td><Text size="sm">{j.gpu_class || '–'}</Text></Table.Td>
                                        <Table.Td><Text size="sm">{j.gpu_hours ? Math.round(j.gpu_hours * 100) / 100 : '–'}</Text></Table.Td>
                                        <Table.Td>
                                            <Tooltip withArrow label={t('gpu.jobs.submittedAt', { at: formatDateTime(j.submitted) })}>
                                                <Text size="xs">{j.started ? t('gpu.jobs.startedAt', { at: formatDateTime(j.started) }) : t('gpu.jobs.submittedAt', { at: formatDateTime(j.submitted) })}</Text>
                                            </Tooltip>
                                            {j.started && <Text size="xs" c="dimmed">{j.ended ? t('gpu.jobs.ranFor', { duration: runTime(j, i18n.language) }) : t('gpu.jobs.runningFor', { duration: runTime(j, i18n.language) })}</Text>}
                                        </Table.Td>
                                        <Table.Td><Text size="xs">{outcome(j, t) || '–'}</Text></Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                )}
            </Paper>
        </Container>
    );
}

// GpuJobDetail is one job: what it runs, its state and times, the end of its output (asked again while it runs), and cancelling while it waits or runs.
export function GpuJobDetail({ params }) {
    const { t, i18n } = useTranslation();
    const api = useGpuApi();
    const confirm = useConfirm();
    const id = params?.id;
    const job = useQuery({
        queryKey: gpuKeys.job(id),
        queryFn: () => api.getJob(id),
        enabled: !!id,
        refetchInterval: (q) => (isActive(q.state.data) ? LOG_REFRESH_MS : false),
    });
    const running = job.data?.state === 'running';
    // A waiting job has no output yet; a finished one keeps what it had, so it is asked once more after the end.
    const log = useQuery({
        queryKey: gpuKeys.jobLog(id),
        queryFn: () => api.jobLog(id, LOG_LINES),
        enabled: !!job.data && job.data.state !== 'queued',
        refetchInterval: running ? LOG_REFRESH_MS : false,
    });
    const cancel = useApiMutation({ mutationFn: () => api.cancelJob(id), invalidates: [gpuKeys.job(id), gpuKeys.jobs(), gpuKeys.jobLog(id)] });

    async function onCancel() {
        const ok = await confirm({
            title: t('gpu.jobs.cancelTitle'),
            confirmLabel: t('gpu.jobs.cancelConfirm'),
            message: t('gpu.jobs.cancelMessage', { name: job.data.name || job.data.id }),
        });
        if (ok) cancel.mutate();
    }

    if (job.isPending) return <Container size="lg" py="md"><Loading /></Container>;
    if (job.isError) return <Container size="lg" py="md"><LoadError query={job} /></Container>;
    const j = job.data;
    const fact = (label, value) => (value || value === 0) && (
        <div>
            <Text size="xs" c="dimmed">{label}</Text>
            <Text size="sm">{value}</Text>
        </div>
    );
    return (
        <Container size="lg" py="md">
            <Paper p="lg" radius="md" withBorder>
                <Stack gap="md">
                    <Anchor component={Link} href="/jobs" size="sm">
                        <Group gap={4}><ArrowLeft size={14} />{t('gpu.jobs.back')}</Group>
                    </Anchor>
                    <Group justify="space-between" align="flex-start" wrap="wrap">
                        <div>
                            <Title order={3}>{j.name || j.id}</Title>
                            <Text size="xs" c="dimmed">{j.project} · {j.person}</Text>
                        </div>
                        {isActive(j) && (
                            <Button size="xs" variant="light" color="red" leftSection={<Square size={14} />} loading={cancel.isPending} onClick={onCancel}>
                                {t('gpu.jobs.cancel')}
                            </Button>
                        )}
                    </Group>
                    <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
                        <div>
                            <Text size="xs" c="dimmed">{t('gpu.jobs.state')}</Text>
                            <JobState job={j} />
                        </div>
                        {fact(t('gpu.jobs.gpuClass'), j.gpu_class && (j.gpus > 1 ? `${j.gpus} × ${j.gpu_class}` : j.gpu_class))}
                        {fact(t('gpu.jobs.priority'), t(j.guaranteed ? 'gpu.jobs.guaranteed' : 'gpu.jobs.preemptible'))}
                        {fact(t('gpu.jobs.maxHours'), j.max_hours ? formatDuration(j.max_hours * 3600000, i18n.language) : '')}
                        {fact(t('gpu.jobs.submitted'), j.submitted && formatDateTime(j.submitted))}
                        {fact(t('gpu.jobs.started'), j.started && formatDateTime(j.started))}
                        {fact(t('gpu.jobs.ended'), j.ended && formatDateTime(j.ended))}
                        {fact(t('gpu.jobs.gpuHours'), j.gpu_hours ? Math.round(j.gpu_hours * 100) / 100 : '')}
                    </SimpleGrid>
                    {outcome(j, t) && <Alert color={j.state === 'failed' ? 'red' : 'gray'} variant="light">{outcome(j, t)}</Alert>}
                    <div>
                        <Text size="xs" c="dimmed">{t(j.notebook ? 'gpu.jobs.notebook' : 'gpu.jobs.command')}</Text>
                        <Code block>{j.notebook || j.command}</Code>
                        {j.working_dir && <Text size="xs" c="dimmed" mt={4}>{t('gpu.jobs.workingDirIs', { dir: j.working_dir })}</Text>}
                        {j.image && <Text size="xs" c="dimmed" ff="monospace">{j.image.split('/').pop()}</Text>}
                    </div>
                    <div>
                        <Text fw={600} size="sm">{t('gpu.jobs.output')}</Text>
                        <Text size="xs" c="dimmed" mb={4}>{t('gpu.jobs.outputHint', { name: j.name || j.id })}</Text>
                        {j.state === 'queued' ? (
                            <Text size="sm" c="dimmed">{t('gpu.jobs.noOutputYet')}</Text>
                        ) : log.isError ? (
                            <LoadError query={log} />
                        ) : (
                            <Code block style={{ maxHeight: 480, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{log.data?.log || t('gpu.jobs.noOutput')}</Code>
                        )}
                    </div>
                </Stack>
            </Paper>
        </Container>
    );
}
