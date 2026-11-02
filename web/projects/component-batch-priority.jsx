import { Select, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { BATCH_GUARANTEED, BATCH_PREEMPTIBLE } from './util-batch-priority.js';

// BatchPriorityInput edits how the batch jobs of a budget's projects run ("Batch-Jobs"): empty sets nothing here, so the budgets above decide it, shown as placeholder; without a value above, jobs are preemptible. inherited: the strictest value of the budgets above (inherited_batch_priority); under "preemptible" the budget cannot choose "guaranteed". onChange(value) with null to clear.
export function BatchPriorityInput({ value, inherited, error, onChange, disabled = false }) {
    const { t } = useTranslation();
    const above = inherited ?? null;
    return (
        <Stack gap={4}>
            <div>
                <Text fw={600} size="sm">{t('projects.batchPriority.title')}</Text>
                <Text size="xs" c="dimmed">{t('projects.batchPriority.hint')}</Text>
            </div>
            <Select
                size="xs"
                maw={260}
                label={t('projects.batchPriority.label')}
                data={[
                    { value: BATCH_PREEMPTIBLE, label: t('projects.batchPriority.preemptible') },
                    { value: BATCH_GUARANTEED, label: t('projects.batchPriority.guaranteed'), disabled: above === BATCH_PREEMPTIBLE },
                ]}
                clearable
                allowDeselect
                value={value ?? null}
                disabled={disabled}
                placeholder={above === null ? t('projects.batchPriority.standard') : t('projects.batchPriority.fromAbove', { value: t(`projects.batchPriority.${above}`) })}
                error={error}
                onChange={v => onChange(v || null)}
            />
        </Stack>
    );
}
