import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useSearch } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Alert, Anchor, Button, Container, Group, NumberInput, Paper, SegmentedControl, Select, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import { ArrowLeft, Play } from 'lucide-react';
import { LoadError, Loading } from '/helper/query-state.jsx';
import { CodeBlock } from '/helper/codeblock.jsx';
import { useGpuApi } from '/gpu/api-gpu.jsx';
import { gpuKeys } from '/gpu/query-keys.js';
import { DEFAULT_JOB_MAX_HOURS, jobBody, jobCommandLine, jobErrors, jobMaxHours, jobProjects } from '/gpu/jobs.js';

// Submitting a batch job (Workspaces → Batch-Jobs → Job starten): in one of the person's projects that allow jobs (?project=<slug> preselects one), a shell command or a notebook, with a working directory and a run time up to the project's maximum. The AI service checks the job against the project (limits, budget with what running and waiting jobs reserve) and answers a refusal with a message for people, shown above the button.
export function GpuJobSubmit() {
    const { t } = useTranslation();
    const api = useGpuApi();
    const queryClient = useQueryClient();
    const [, navigate] = useLocation();
    const params = new URLSearchParams(useSearch());

    // The start options name the projects with their GPU classes; the project list says which allow jobs and for how long.
    const options = useQuery({ queryKey: gpuKeys.startOptions(), queryFn: () => api.startOptions() });
    const mine = useQuery({ queryKey: gpuKeys.projects(false), queryFn: () => api.listProjects(false) });

    const [projectSlug, setProjectSlug] = useState(params.get('project') || '');
    const [gpuClass, setGpuClass] = useState('');
    const [values, setValues] = useState({ name: '', mode: 'command', command: '', notebook: '', workingDir: '', maxHours: DEFAULT_JOB_MAX_HOURS });
    const [errors, setErrors] = useState({});
    const set = (k, v) => { setValues(cur => ({ ...cur, [k]: v })); setErrors(cur => ({ ...cur, [k]: undefined })); };

    const submit = useMutation({
        mutationFn: (body) => api.submitJob(body),
        onSuccess: async (job) => {
            await queryClient.invalidateQueries({ queryKey: gpuKeys.jobs() });
            navigate(`/jobs/${encodeURIComponent(job.id)}`);
        },
    });

    if (options.isPending || mine.isPending) return <Container size="lg" py="md"><Loading /></Container>;
    if (options.isError) return <Container size="lg" py="md"><LoadError query={options} /></Container>;
    if (mine.isError) return <Container size="lg" py="md"><LoadError query={mine} /></Container>;

    const projects = jobProjects(options.data?.projects, mine.data);
    const project = projects.find(p => p.slug === projectSlug) ?? projects[0];
    const classes = project?.gpu_classes ?? [];
    const chosenClass = classes.find(c => c.id === gpuClass) ?? classes[0];
    const maxHours = jobMaxHours(project);
    // The default of 4 h is lowered to a project's shorter maximum.
    const hours = values.maxHours === '' ? '' : Math.min(values.maxHours, maxHours);

    function onSubmit() {
        const v = { ...values, maxHours: hours };
        const errs = jobErrors(t, v, maxHours);
        setErrors(errs);
        if (Object.keys(errs).length === 0) submit.mutate(jobBody(project.slug, classes.length > 1 ? chosenClass?.id : '', v));
    }

    return (
        <Container size="lg" py="md">
            <Paper p="lg" radius="md" withBorder>
                <Stack gap="md">
                    <Anchor component={Link} href="/jobs" size="sm">
                        <Group gap={4}><ArrowLeft size={14} />{t('gpu.jobs.back')}</Group>
                    </Anchor>
                    <div>
                        <Title order={3}>{t('gpu.jobs.submit.title')}</Title>
                        <Text size="sm" c="dimmed" mt={4}>{t('gpu.jobs.submit.intro')}</Text>
                    </div>
                    {projects.length === 0 ? (
                        <Alert color="gray" variant="light">{t('gpu.jobs.noProject')}</Alert>
                    ) : (
                        <>
                            <Stack gap={6}>
                                {projects.length > 1 ? (
                                    <Select label={t('gpu.jobs.project')} allowDeselect={false} maw={480} value={project.slug} onChange={(v) => { setProjectSlug(v); setGpuClass(''); }}
                                        data={projects.map(p => ({ value: p.slug, label: p.name || p.slug }))} />
                                ) : (
                                    <Text size="sm">
                                        {t('gpu.jobs.project')}: <Text span fw={600}>{project.name || project.slug}</Text>
                                    </Text>
                                )}
                                {project.image_pending && <Text size="xs" c="orange">{t('gpu.jobs.submit.imagePending')}</Text>}
                                {classes.length > 1 && (
                                    <Select label={t('gpu.jobs.gpuClass')} allowDeselect={false} maw={480} value={chosenClass?.id} onChange={setGpuClass}
                                        data={classes.map(c => ({ value: c.id, label: c.name || c.id }))}
                                        description={chosenClass?.hardware ? `(${chosenClass.hardware})` : undefined} />
                                )}
                                {classes.length === 1 && (
                                    <Text size="sm">
                                        {t('gpu.jobs.gpuClass')}: {classes[0].name || classes[0].id}
                                        {classes[0].hardware && <Text span size="sm" c="dimmed">{` (${classes[0].hardware})`}</Text>}
                                    </Text>
                                )}
                            </Stack>

                            <TextInput label={t('gpu.jobs.submit.name')} description={t('gpu.jobs.submit.nameHint')} maw={480} value={values.name} onChange={(e) => set('name', e.currentTarget.value)} />

                            <Stack gap={6}>
                                <SegmentedControl w="fit-content" value={values.mode} onChange={(v) => set('mode', v)}
                                    data={[{ value: 'command', label: t('gpu.jobs.command') }, { value: 'notebook', label: t('gpu.jobs.notebook') }]} />
                                {values.mode === 'command' ? (
                                    <Textarea label={t('gpu.jobs.command')} description={t('gpu.jobs.submit.commandHint')} placeholder="python train.py --epochs 10" autosize minRows={2}
                                        styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
                                        value={values.command} error={errors.command} onChange={(e) => set('command', e.currentTarget.value)} />
                                ) : (
                                    <TextInput label={t('gpu.jobs.notebook')} description={t('gpu.jobs.submit.notebookHint')} placeholder="projects/kurs/training.ipynb" maw={480}
                                        value={values.notebook} error={errors.notebook} onChange={(e) => set('notebook', e.currentTarget.value)} />
                                )}
                            </Stack>

                            <TextInput label={t('gpu.jobs.submit.workingDir')} description={t('gpu.jobs.submit.workingDirHint')} placeholder="projects/kurs" maw={480}
                                value={values.workingDir} onChange={(e) => set('workingDir', e.currentTarget.value)} />

                            <NumberInput label={t('gpu.jobs.maxHours')} description={t('gpu.jobs.submit.maxHoursHint', { max: maxHours })} maw={240}
                                min={0.25} max={maxHours} step={0.5} decimalScale={2} allowNegative={false}
                                value={hours} error={errors.maxHours} onChange={(v) => set('maxHours', v === '' ? '' : Number(v))} />

                            {submit.isError && <Alert color="red" variant="light">{submit.error?.message}</Alert>}
                            <Group>
                                <Button leftSection={<Play size={16} />} loading={submit.isPending} onClick={onSubmit}>{t('gpu.jobs.submitJob')}</Button>
                            </Group>

                            {/* The same job from the command line, following the form as it is filled in. */}
                            <Paper withBorder radius="md" p="md">
                                <Text size="sm" fw={700} mb="xs">{t('gpu.jobs.submit.cliTitle')}</Text>
                                <CodeBlock language="bash" code={jobCommandLine(project.slug, classes.length > 1 ? chosenClass?.id : '', { ...values, maxHours: hours }, maxHours,
                                    t(values.mode === 'notebook' ? 'gpu.jobs.submit.cliNotebook' : 'gpu.jobs.submit.cliCommand'))} />
                                <Text size="xs" c="dimmed" mt="xs">{t('gpu.jobs.submit.cliHint')}</Text>
                            </Paper>
                        </>
                    )}
                </Stack>
            </Paper>
        </Container>
    );
}
