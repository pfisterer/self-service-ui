import { NumberInput, Select, SimpleGrid, Stack, Switch, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { DEFAULT_JOB_MAX_HOURS, DEFAULT_JOBS_PER_PERSON, JOB_HOUR_CHOICES, MAX_JOB_HOURS } from '/gpu/jobs.js';
import { batchJobsSummary, normalizeBatchJobs } from './util-batch-jobs.js';

// availableBatchJobs tells whether the budget dialog offers batch jobs at all: at the root, where the budget above has them, or where the budget still has some of its own (so they can be switched off). Like a resource the budget above does not have, they are not shown otherwise.
export function availableBatchJobs(value, inherited, isRoot) {
    return isRoot || normalizeBatchJobs(inherited) !== null || normalizeBatchJobs(value) !== null;
}

// BatchJobsInput switches batch jobs on for the projects below a budget ("Batch-Jobs erlauben") and sets their bounds: jobs per person and the longest run time, each at most what the budget above allows (inherited, its inherited_batch_jobs; at the root only MAX_JOB_HOURS bounds them). Off, the budget and the projects below have none. A budget that inherits its limit (inheritsLimit) passes on those above: shown, not edited. onChange(value) with null for off.
export function BatchJobsInput({ value, inherited, isRoot = false, inheritsLimit = false, error, onChange, disabled = false }) {
    const { t } = useTranslation();
    const v = normalizeBatchJobs(value);
    const above = isRoot ? null : normalizeBatchJobs(inherited);
    const header = (
        <div>
            <Text fw={600} size="sm">{t('projects.batchJobs.title')}</Text>
            <Text size="xs" c="dimmed">{t('projects.batchJobs.hint')}</Text>
        </div>
    );
    if (inheritsLimit) {
        return (
            <Stack gap={4}>
                {header}
                <Text size="xs">{t('projects.batchJobs.inherits', { value: batchJobsSummary(t, above) })}</Text>
            </Stack>
        );
    }
    const maxPerPerson = above?.jobs_per_person;
    const maxHours = above?.max_hours ?? MAX_JOB_HOURS;
    const hours = v?.max_hours ?? Math.min(DEFAULT_JOB_MAX_HOURS, maxHours);
    const hourChoices = [...new Set([...JOB_HOUR_CHOICES.filter(h => h <= maxHours), maxHours, hours])].sort((a, b) => a - b)
        .map(h => ({ value: String(h), label: t('gpu.projects.jobs.hours', { count: h }) }));
    const switchOn = (on) => onChange(on
        ? { jobs_per_person: Math.min(DEFAULT_JOBS_PER_PERSON, maxPerPerson ?? DEFAULT_JOBS_PER_PERSON), max_hours: Math.min(DEFAULT_JOB_MAX_HOURS, maxHours) }
        : null);
    return (
        <Stack gap={4}>
            {header}
            <Switch label={t('projects.batchJobs.label')} checked={v !== null} disabled={disabled || (v === null && !isRoot && above === null)}
                onChange={e => switchOn(e.currentTarget.checked)} />
            {v !== null && (
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs" maw={540}>
                    <NumberInput
                        size="xs"
                        label={t('gpu.projects.jobs.perPerson')}
                        description={t('gpu.projects.jobs.perPersonHint')}
                        min={1}
                        max={maxPerPerson}
                        allowDecimal={false}
                        allowNegative={false}
                        value={v.jobs_per_person}
                        disabled={disabled}
                        onChange={n => onChange({ ...v, jobs_per_person: Math.max(1, Number(n) || 1) })}
                    />
                    <Select
                        size="xs"
                        label={t('gpu.projects.jobs.maxHours')}
                        description={t('gpu.projects.jobs.maxHoursHint')}
                        allowDeselect={false}
                        data={hourChoices}
                        value={String(hours)}
                        disabled={disabled}
                        onChange={h => onChange({ ...v, max_hours: Number(h) })}
                    />
                </SimpleGrid>
            )}
            {error && <Text size="xs" c="red">{error}</Text>}
            {above !== null && <Text size="xs" c="dimmed">{t('projects.batchJobs.aboveHint', { value: batchJobsSummary(t, above) })}</Text>}
            {isRoot && <Text size="xs" c="dimmed">{t('projects.batchJobs.rootHint')}</Text>}
        </Stack>
    );
}
