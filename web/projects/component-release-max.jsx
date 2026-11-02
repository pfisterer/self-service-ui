import { Checkbox, NumberInput, SimpleGrid, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { MAX_IDLE_MINUTES, MAX_MAX_HOURS, RELEASE_FIELDS, RELEASE_KINDS, unlimitedAllowed } from './util-release-max.js';

const LABELS = { idle_open_minutes: 'projects.releaseMax.idleOpen', idle_closed_minutes: 'projects.releaseMax.idleClosed', max_hours: 'projects.releaseMax.maxHours' };

// ReleaseMaxInputs edits a budget's release maximums ("Rückgabezeiten (Höchstwerte)") for CPU and GPU: an empty field sets nothing here, so the budgets above decide it, shown as placeholder; without a value above, the AI service's default applies, shown with its value where defaults (the catalogue's releaseDefaults) has it. inherited: the strictest maximums of the budgets above (inherited_release_max). onChange(kind, field, value) with null to clear.
export function ReleaseMaxInputs({ value, inherited, defaults, errors = {}, onChange, disabled = false }) {
    const { t } = useTranslation();
    return (
        <Stack gap="xs">
            <div>
                <Text fw={600} size="sm">{t('projects.releaseMax.title')}</Text>
                <Text size="xs" c="dimmed">{t('projects.releaseMax.hint')}</Text>
            </div>
            {RELEASE_KINDS.map(kind => (
                <Stack key={kind} gap={4}>
                    <Text size="xs" fw={600}>{t(`projects.releaseMax.kinds.${kind}`)}</Text>
                    <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xs">
                        {RELEASE_FIELDS.map(field => {
                            const own = value?.[kind]?.[field];
                            const above = inherited?.[kind]?.[field];
                            const hours = field === 'max_hours';
                            const unlimited = hours && own === 0;
                            const ceiling = above !== undefined && above !== null && above > 0 ? above : (hours ? MAX_MAX_HOURS : MAX_IDLE_MINUTES);
                            const standard = defaults?.[kind]?.[field];
                            const placeholder = above === undefined || above === null
                                ? (standard === undefined || standard === null ? t('projects.releaseMax.standard') : t(hours ? 'projects.releaseMax.standardHours' : 'projects.releaseMax.standardMinutes', { value: standard }))
                                : t('projects.releaseMax.fromAbove', { value: hours && above === 0 ? t('projects.releaseMax.unlimited') : above });
                            return (
                                <Stack key={field} gap={2}>
                                    <NumberInput
                                        size="xs"
                                        label={t(LABELS[field])}
                                        min={1}
                                        max={ceiling}
                                        allowDecimal={false}
                                        allowNegative={false}
                                        value={unlimited || own === undefined || own === null ? '' : own}
                                        disabled={disabled || unlimited}
                                        placeholder={placeholder}
                                        error={errors[`releaseMax.${kind}.${field}`]}
                                        onChange={v => onChange(kind, field, v === '' ? null : v)}
                                    />
                                    {hours && unlimitedAllowed(kind, inherited) && (
                                        <Checkbox
                                            size="xs"
                                            label={t('projects.releaseMax.unlimited')}
                                            checked={unlimited}
                                            disabled={disabled}
                                            onChange={e => onChange(kind, field, e.currentTarget.checked ? 0 : null)}
                                        />
                                    )}
                                </Stack>
                            );
                        })}
                    </SimpleGrid>
                </Stack>
            ))}
        </Stack>
    );
}
