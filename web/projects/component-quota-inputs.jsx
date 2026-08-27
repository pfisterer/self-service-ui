import { useMemo, useState } from 'react';
import { Checkbox, Grid, Group, NumberInput, Stack, Switch, Text, TextInput } from '@mantine/core';
import { UNLIMITED_QUOTA, groupResources, isAvailability } from './util-project.jsx';

// Above this many fields the list stops being scannable and gets a filter. The
// root of the tree sees the whole catalogue — every GPU flavour of every campus,
// every network — while a delegated budget usually sees a handful, so the search
// box appears exactly where it is needed and nowhere else.
const SEARCH_THRESHOLD = 12;

// QuotaInputs is THE resource entry form, shared by every dialog that asks for
// amounts (project request, budget form, approve-with-changes, adopt).
//
// Props:
//   resources     resource definitions from /v1/config (id, name, kind, group, unit, min, max, message)
//   value         quota map { [resourceId]: number } — availabilities are 0 or 1
//   onChange      (resourceId, newValue) => void
//   errors        optional map { [resourceId]: string }
//   disabled      render read-only
//   allowUnlimited budgets may set a QUANTITY to "no cap" (-1); adds a checkbox per field
//
// The caller decides WHICH resources to pass. Filtering to what is in scope at a
// node is visibleResources' job, not this component's — the same form is used
// where there is no node at all.
export function QuotaInputs({ resources, value, onChange, errors = {}, disabled = false, allowUnlimited = false }) {
    const [query, setQuery] = useState('');

    const matching = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return resources || [];
        // Name and id both: people look for "rtx6000" as readily as for the label
        // it is shown under.
        return (resources || []).filter(r =>
            r.name?.toLowerCase().includes(q) || r.id.toLowerCase().includes(q));
    }, [resources, query]);

    if (!resources) return null;

    const groups = groupResources(matching);
    const searchable = resources.length > SEARCH_THRESHOLD;

    return (
        <Stack gap="md">
            {searchable && (
                <TextInput
                    size="xs"
                    placeholder={`Filter ${resources.length} resources`}
                    value={query}
                    onChange={e => setQuery(e.currentTarget.value)}
                    aria-label="Filter resources"
                />
            )}

            {searchable && matching.length === 0 && (
                <Text size="xs" c="dimmed">Nothing matches “{query}”.</Text>
            )}

            {groups.map(([groupName, groupResourcesList]) => (
                <Stack key={groupName || '__ungrouped'} gap="xs">
                    {groupName && (
                        <Text size="xs" fw={600} c="dimmed" tt="uppercase">{groupName}</Text>
                    )}
                    <Grid>
                        {groupResourcesList.map(r => (
                            <Grid.Col key={r.id} span={{ base: 12, sm: isAvailability(r) ? 6 : 4 }}>
                                {isAvailability(r)
                                    ? <AvailabilityField resource={r} value={value?.[r.id]} onChange={onChange} disabled={disabled} />
                                    : <QuantityField
                                        resource={r}
                                        value={value?.[r.id]}
                                        onChange={onChange}
                                        error={errors[r.id]}
                                        disabled={disabled}
                                        allowUnlimited={allowUnlimited}
                                    />}
                            </Grid.Col>
                        ))}
                    </Grid>
                </Stack>
            ))}
        </Stack>
    );
}

// An availability is granted or it is not. A NumberInput would invite a 2, which
// the API rejects — the control has to make the invalid value unreachable rather
// than report it afterwards.
function AvailabilityField({ resource, value, onChange, disabled }) {
    return (
        <Group gap="xs" align="flex-start" wrap="nowrap">
            <Switch
                checked={value === 1}
                disabled={disabled}
                onChange={e => onChange(resource.id, e.currentTarget.checked ? 1 : 0)}
                label={resource.name}
                description={resource.message}
            />
        </Group>
    );
}

function QuantityField({ resource: r, value: current, onChange, error, disabled, allowUnlimited }) {
    const isUnlimited = current === UNLIMITED_QUOTA;
    return (
        <Stack gap="4">
            <NumberInput
                label={r.unit ? `${r.name} (${r.unit})` : r.name}
                min={allowUnlimited ? 0 : r.min}
                max={r.max}
                disabled={disabled || isUnlimited}
                value={isUnlimited ? '' : current}
                placeholder={isUnlimited ? 'No cap' : undefined}
                onChange={v => onChange(r.id, v)}
                error={error}
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
    );
}

// Returns the default quota map for a set of resource definitions.
export function defaultQuota(resources) {
    return Object.fromEntries((resources || []).map(r => [r.id, r.default ?? 0]));
}

// Validates a quota map against the resource definitions; returns an error map
// (empty when valid). Unlimited (-1) entries are always valid for budget
// QUANTITIES.
//
// Availabilities are checked against 0/1 instead of min/max: their definitions
// carry no bounds, so the generic range check would read min=0, max=0 and call
// every granted availability invalid.
export function validateQuota(resources, quota, { allowUnlimited = false } = {}) {
    const errors = {};
    (resources || []).forEach(r => {
        const v = quota?.[r.id];
        if (isAvailability(r)) {
            if (v !== 0 && v !== 1) {
                errors[r.id] = 'Must be granted or not granted';
            }
            return;
        }
        if (allowUnlimited && v === UNLIMITED_QUOTA) return;
        if (v === null || v === undefined || v === '' || v < (allowUnlimited ? 0 : r.min) || v > r.max) {
            errors[r.id] = r.message || `Enter a value between ${r.min} and ${r.max}`;
        }
    });
    return errors;
}
