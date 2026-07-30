import { Checkbox, Grid, NumberInput, Stack } from '@mantine/core';
import { UNLIMITED_QUOTA } from './util-project.jsx';

// QuotaInputs is THE resource entry form, shared by every dialog that asks for
// amounts (project request, budget form, approve-with-changes, adopt).
//
// Props:
//   resources     resource definitions from /v1/config (id, name, unit, min, max, message)
//   value         quota map { [resourceId]: number }
//   onChange      (resourceId, newValue) => void
//   errors        optional map { [resourceId]: string }
//   disabled      render read-only
//   allowUnlimited budgets may set a resource to "no cap" (-1); adds a checkbox per field
export function QuotaInputs({ resources, value, onChange, errors = {}, disabled = false, allowUnlimited = false }) {
    if (!resources) return null;

    return (
        <Grid>
            {resources.map(r => {
                const current = value?.[r.id];
                const isUnlimited = current === UNLIMITED_QUOTA;
                return (
                    <Grid.Col key={r.id} span={{ base: 12, sm: 4 }}>
                        <Stack gap="4">
                            <NumberInput
                                label={r.unit ? `${r.name} (${r.unit})` : r.name}
                                min={allowUnlimited ? 0 : r.min}
                                max={r.max}
                                disabled={disabled || isUnlimited}
                                value={isUnlimited ? '' : current}
                                placeholder={isUnlimited ? 'No cap' : undefined}
                                onChange={v => onChange(r.id, v)}
                                error={errors[r.id]}
                                description={isUnlimited ? 'Children may use any amount' : r.message}
                            />
                            {allowUnlimited && (
                                <Checkbox
                                    size="xs"
                                    label="No cap"
                                    disabled={disabled}
                                    checked={isUnlimited}
                                    onChange={e => onChange(r.id, e.currentTarget.checked ? UNLIMITED_QUOTA : (r.default ?? 0))}
                                />
                            )}
                        </Stack>
                    </Grid.Col>
                );
            })}
        </Grid>
    );
}

// Returns the default quota map for a set of resource definitions.
export function defaultQuota(resources) {
    return Object.fromEntries((resources || []).map(r => [r.id, r.default ?? 0]));
}

// Validates a quota map against the resource definitions; returns an error map
// (empty when valid). Unlimited (-1) entries are always valid for budgets.
export function validateQuota(resources, quota, { allowUnlimited = false } = {}) {
    const errors = {};
    (resources || []).forEach(r => {
        const v = quota?.[r.id];
        if (allowUnlimited && v === UNLIMITED_QUOTA) return;
        if (v === null || v === undefined || v === '' || v < (allowUnlimited ? 0 : r.min) || v > r.max) {
            errors[r.id] = r.message || `Enter a value between ${r.min} and ${r.max}`;
        }
    });
    return errors;
}
