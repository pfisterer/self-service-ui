import { useMemo, useState } from 'react';
import { Anchor, Badge, Checkbox, Grid, Group, NumberInput, Paper, Stack, Switch, Text, TextInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { UNLIMITED_QUOTA, groupResources, isAvailability, resourceLabel, resourceUnit } from './util-project.jsx';
import { UsageMeter, grantUseText, syncErrorText } from './component-project-resources.jsx';

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
//   headroom      optional map { [resourceId]: number } — how much the budget the
//                 request draws from still has free; each quantity then shows what
//                 share of that the entered value takes
//
// The caller decides WHICH resources to pass. Filtering to what is in scope at a
// node is visibleResources' job, not this component's — the same form is used
// where there is no node at all.
// `extra` is for an amount on top of something else — an allocation: smaller
// fields, 0 allowed whatever the resource's minimum, no range text.
// `usage` is what an existing project uses in OpenStack, for a line under each
// field: { inUse, grantUse, total, syncErrors } — measuredUse(node), openstackSide(node).grant_use,
// what the project would hold in all (the entered values plus allocations), and what OpenStack
// refused on the last sync (openstackSide(node).sync_errors), shown in red under the field.
// providerDefaults: the values are a PROJECT's, where a rate of another provider left empty takes that provider's default (showsDefault). In a budget an empty field is no default, so budget dialogs leave this off.
export function QuotaInputs({ resources, value, onChange, errors = {}, disabled = false, allowUnlimited = false, headroom = null, extra = false, usage = null, providerDefaults = false, emptyIsZero = false }) {
    const { t } = useTranslation();
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

    const groups = groupResources(matching, p => t(`projects.resources.provider.${p}`, { defaultValue: p }));
    const searchable = resources.length > SEARCH_THRESHOLD;
    const quantity = (r, name) => (
        <QuantityField providerDefaults={providerDefaults} emptyIsZero={emptyIsZero} resource={r} name={name}
            value={value?.[r.id]} onChange={onChange} error={errors[r.id]} disabled={disabled} allowUnlimited={allowUnlimited}
            free={headroom?.[r.id]} extra={extra} used={usage?.inUse?.[r.id]} total={usage?.total?.[r.id] ?? value?.[r.id]} syncError={usage?.syncErrors?.[r.id]} />
    );

    return (
        <Stack gap="md">
            {searchable && (
                <TextInput
                    size="xs"
                    placeholder={t('projects.quotaInputs.filter')}
                    value={query}
                    onChange={e => setQuery(e.currentTarget.value)}
                    aria-label={t('projects.quotaInputs.filter')}
                />
            )}

            {searchable && matching.length === 0 && (
                <Text size="xs" c="dimmed">{t('projects.quotaInputs.noMatches', { query })}</Text>
            )}

            {allowUnlimited && <Text size="xs" c="dimmed">{t('projects.quotaInputs.noCapNote')}</Text>}

            {/* A section (Workspaces, LLM, or an OpenStack group) is a box of its own; Workspaces has CPU and GPU inside. Field names drop what the heading says already ("Workspace CPU" → "CPU"). */}
            {quotaSections(groups).map(section => (
                <Paper key={section.title || '__ungrouped'} withBorder={!!section.title} radius="md" p={section.title ? 'md' : 0}>
                    {section.title && <Text size="sm" fw={700} mb="xs">{section.title}</Text>}
                    <Stack gap="md">
                        {section.parts.map(part => {
                            const pools = gpuPools(part.resources);
                            return (
                                <div key={part.key}>
                                    {part.subtitle && <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={6}>{part.subtitle}</Text>}
                                    {pools ? (
                                        // GPU classes (pool and tier of the AI service's GPU administration), by pool: the pool as heading with its GPU types and, when there are other pools, whether it lends; one row per tier with its two amounts side by side.
                                        <Stack gap="md">
                                            {pools.map(pool => (
                                                <div key={pool.id}>
                                                    <Group gap={8} align="baseline" mb={4}>
                                                        <Text size="sm" fw={600}>{t('projects.quotaInputs.pool', { name: pool.name })}</Text>
                                                        {pool.products && <Text size="xs" c="dimmed">{pool.products}</Text>}
                                                        {pools.length > 1 && <Text size="xs" c="dimmed">· {t(pool.lends ? 'projects.quotaInputs.poolLends' : 'projects.quotaInputs.poolKeeps')}</Text>}
                                                    </Group>
                                                    <Stack gap="sm">
                                                        {pool.rows.map(row => (
                                                            <Grid key={row.id} align="flex-start">
                                                                <Grid.Col span={{ base: 12, sm: 4 }}>
                                                                    <Badge variant="light" color="gray" size="lg" tt="none" mt={extra ? 2 : 26}>{row.name}</Badge>
                                                                </Grid.Col>
                                                                <Grid.Col span={{ base: 6, sm: 4 }}>{row.gpus && quantity(row.gpus, t('projects.quotaInputs.gpusAtOnce'))}</Grid.Col>
                                                                <Grid.Col span={{ base: 6, sm: 4 }}>{row.hours && quantity(row.hours, t('projects.quotaInputs.gpuHours'))}</Grid.Col>
                                                            </Grid>
                                                        ))}
                                                    </Stack>
                                                </div>
                                            ))}
                                        </Stack>
                                    ) : (
                                        <Grid>
                                            {part.resources.map(r => (
                                                <Grid.Col key={r.id} span={{ base: 12, sm: isAvailability(r) ? 6 : 4 }}>
                                                    {isAvailability(r)
                                                        ? <AvailabilityField resource={r} label={part.short ? shortName(r.name) : undefined} value={value?.[r.id]} onChange={onChange} disabled={disabled} error={errors[r.id]} used={usage?.grantUse?.[r.id]} syncError={usage?.syncErrors?.[r.id]} />
                                                        : quantity(r, part.short ? shortName(r.name) : undefined)}
                                                </Grid.Col>
                                            ))}
                                        </Grid>
                                    )}
                                </div>
                            );
                        })}
                    </Stack>
                </Paper>
            ))}
        </Stack>
    );
}

// quotaSections arranges the display groups: the AI service's groups Workspaces and Workspaces GPU become one section Workspaces with the parts CPU and GPU, LLM a section of its own; their field names are shortened (short). Every other group is a section of one part, as before.
export function quotaSections(groups) {
    const sections = [];
    let workspaces = null;
    for (const [title, resources] of groups) {
        const raw = resources[0]?.group || '';
        if (raw === 'Workspaces' || raw === 'Workspaces GPU') {
            const gpu = raw === 'Workspaces GPU';
            if (!workspaces) {
                workspaces = { title: gpu ? title.replace(/\s*GPU$/, '') : title, parts: [] };
                sections.push(workspaces);
            }
            workspaces.parts.push({ key: raw, subtitle: gpu ? 'GPU' : 'CPU', resources, short: true });
            continue;
        }
        sections.push({ title, parts: [{ key: title || '__ungrouped', resources, short: raw === 'LLM' }] });
    }
    for (const sec of sections) {
        // CPU before GPU, whatever order the catalogue has.
        sec.parts.sort((a, b) => (a.subtitle === 'GPU') - (b.subtitle === 'GPU'));
        if (sec.parts.length === 1) sec.parts[0].subtitle = undefined;
    }
    return sections;
}

// shortName drops the prefix the section heading says already: "Workspace CPU" → "CPU", "LLM tokens per minute" → "Tokens per minute", "LLM: every model directly" → "Every model directly".
export function shortName(name) {
    const rest = (name || '').replace(/^(workspaces?|llm)\s*:?\s+/i, '');
    return rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : name;
}

const TIER_ORDER = ['small', 'medium', 'large'];

// gpuPools pairs the GPU resources of a group by class (ws-gpus-<class>, ws-gpu-hours-<class>) and arranges the classes by pool (general first), a row per tier in tier order. Pool and tier come from the resource's gpu_class; without it the name says them ("General · medium: GPU hours"). GPU types lose the vendor ("NVIDIA-L40S-12Q" → "L40S-12Q"). null when the group holds anything else.
export function gpuPools(resources) {
    const pools = new Map();
    for (const r of resources) {
        const m = /^ws-(gpus|gpu-hours)-(.+)$/.exec(r.id);
        if (!m) return null;
        const [poolName, tierName] = (r.name || m[2]).split(':')[0].split('·').map(x => x.trim());
        const c = r.gpu_class || {};
        const poolId = c.pool || poolName;
        const pool = pools.get(poolId) ?? { id: poolId, name: c.pool_name || poolName, products: (c.products || '').replace(/NVIDIA-/g, ''), lends: !!c.lends, rows: new Map() };
        const row = pool.rows.get(m[2]) ?? { id: m[2], tier: c.tier || tierName || m[2], name: c.tier_name || tierName || m[2] };
        row[m[1] === 'gpus' ? 'gpus' : 'hours'] = r;
        pool.rows.set(m[2], row);
        pools.set(poolId, pool);
    }
    if (!pools.size) return null;
    const rank = (tier) => { const i = TIER_ORDER.indexOf(tier); return i < 0 ? TIER_ORDER.length : i; };
    return [...pools.values()]
        // The pool for everybody first, then the others by name.
        .sort((a, b) => (b.id === 'general') - (a.id === 'general') || a.name.localeCompare(b.name))
        .map(p => ({ ...p, rows: [...p.rows.values()].sort((a, b) => rank(a.tier) - rank(b.tier) || a.name.localeCompare(b.name)) }));
}

// An availability is granted or it is not. A NumberInput would invite a 2, which
// the API rejects — the control has to make the invalid value unreachable rather
// than report it afterwards.
//
// It shows its error like every other field: a tab marked as faulty with no
// field saying why leaves nothing to fix.
//
// `used` is how many servers or devices use it (undefined: not measured).
// Switched off while in use, the line turns into a warning: a network cannot
// be taken away while anything is attached, and a flavour or image taken away
// leaves its servers running but unable to be rebuilt or resized.
// `syncError` is what OpenStack refused on the last sync: then the switch says what is wanted, and the red line under it that it is not in place.
function AvailabilityField({ resource, label, value, onChange, disabled, error, used, syncError }) {
    const { t } = useTranslation();
    const on = value === 1;
    const useText = grantUseText(t, resource, used);
    const losing = !on && used > 0;
    return (
        <Stack gap={2}>
            <Group gap="xs" align="flex-start" wrap="nowrap">
                <Switch
                    checked={on}
                    disabled={disabled}
                    onChange={e => onChange(resource.id, e.currentTarget.checked ? 1 : 0)}
                    label={label ?? resource.name}
                    description={resource.message}
                    error={error}
                />
            </Group>
            {useText && (
                <Text size="xs" c={losing ? 'red.8' : 'dimmed'} pl={46}>
                    {useText}
                    {losing && ` — ${t(resource?.grant_type === 'network' ? 'projects.resources.grantOffNetwork' : 'projects.resources.grantOffServers')}`}
                </Text>
            )}
            <SyncErrorLine resource={resource} error={syncError} pl={46} />
        </Stack>
    );
}

// A rate of another provider left unset takes the provider's default (the AI service's requests and tokens per minute): say which, rather than show an empty field that reads as nothing. An unset OpenStack quantity means 0, so it says nothing.
function showsDefault(r) {
    return !!r.provider && r.provider !== 'openstack' && r.kind !== 'window' && (r.default ?? 0) > 0;
}

// name replaces the resource's own (shortened under its section heading); the unit and window follow in grey.
function QuantityField({ providerDefaults, emptyIsZero, resource: r, name, value: current, onChange, error, disabled, allowUnlimited, free, extra, used, total, syncError }) {
    const { t } = useTranslation();
    const isUnlimited = current === UNLIMITED_QUOTA;
    return (
        <Stack gap="4">
            <NumberInput
                label={name ? <>{name} <Text span size="xs" c="dimmed" fw={400}>{resourceUnit(t, r)}</Text></> : resourceLabel(t, r)}
                size={extra ? 'xs' : undefined}
                min={allowUnlimited || extra ? 0 : r.min}
                max={r.max}
                disabled={disabled || isUnlimited}
                value={isUnlimited ? '' : current}
                placeholder={isUnlimited ? '∞' : (extra || emptyIsZero) ? '0' : (providerDefaults && showsDefault(r) ? t('projects.quotaInputs.defaultValue', { value: r.default }) : undefined)}
                // Emptied, a field with a default goes back to it: absent from the limit, not an empty string.
                onChange={v => onChange(r.id, v === '' && (emptyIsZero || (providerDefaults && showsDefault(r))) ? undefined : v)}
                error={error}
                description={isUnlimited || extra || name ? undefined : r.message}
            />
            <HeadroomShare free={free} value={isUnlimited ? UNLIMITED_QUOTA : current}
                onTake={disabled ? undefined : () => onChange(r.id, typeof r.max === 'number' && r.max > 0 ? Math.min(free, r.max) : free)} />
            <UsageMeter used={used} limit={typeof total === 'number' ? total : undefined} window={r.window} />
            <SyncErrorLine resource={r} error={syncError} />
            {allowUnlimited && (
                <Checkbox
                    size="xs"
                    label={t('projects.quotaInputs.noCap')}
                    disabled={disabled}
                    checked={isUnlimited}
                    onChange={e => onChange(r.id, e.currentTarget.checked ? UNLIMITED_QUOTA : (r.default ?? 0))}
                />
            )}
        </Stack>
    );
}

// One line under a quantity: how the entered value relates to what the budget
// being drawn from still has free. Silent when the caller passed no headroom
// for this resource (no budget in hand, or it is uncapped — a share of infinity
// says nothing). "No cap" wanting more than a finite free amount is the one
// combination that must speak up even at value 0.
// onTake, when set, offers to take all of it with one click — a choice, not a default: filled in from the start, the first request would claim the whole budget, and an approver would see every request at its maximum.
function HeadroomShare({ free, value, onTake }) {
    const { t } = useTranslation();
    if (free === undefined || free === null || !Number.isFinite(free)) return null;
    const v = value === UNLIMITED_QUOTA ? Infinity : (typeof value === 'number' ? value : 0);
    if (v > free) {
        return (
            <Text size="xs" c="red.8">
                {t('projects.quotaInputs.exceedsFree', { free })}
            </Text>
        );
    }
    const share = free > 0 ? Math.round((v / free) * 100) : 0;
    return (
        <Text size="xs" c="dimmed">
            {t('projects.quotaInputs.freeShare', { free, share })}
            {onTake && v < free && free > 0 && <> · <Anchor component="button" type="button" size="xs" onClick={onTake}>{t('projects.quotaInputs.takeAll')}</Anchor></>}
        </Text>
    );
}

// Returns the default quota map for a set of resource definitions.
export function defaultQuota(resources) {
    return Object.fromEntries((resources || []).map(r => [r.id, r.default ?? 0]));
}

// withUnsetAsZero fills the quantities a stored project limit does not carry with 0, what the services read for them: a resource added to the catalogue later (ws-storage-gb) is missing from every older project, and its empty field failed the range check on opening, so the project could not be saved at all (12.11.2026). Availabilities stay absent (not granted), a rate with a provider default stays empty (showsDefault).
export function withUnsetAsZero(resources, quota) {
    const out = { ...(quota || {}) };
    (resources || []).forEach(r => {
        if (isAvailability(r) || showsDefault(r)) return;
        if (out[r.id] === undefined || out[r.id] === null) out[r.id] = 0;
    });
    return out;
}

// Validates a quota map against the resource definitions; returns an error map
// (empty when valid). Unlimited (-1) entries are always valid for budget
// QUANTITIES.
//
// Availabilities are checked against 0/1 instead of min/max: their definitions
// carry no bounds, so the generic range check would read min=0, max=0 and call
// every granted availability invalid.
// Takes `t` as its first argument: a validator runs outside a component (inside
// useForm), so it cannot reach for the hook and is handed the translator like
// every other plain function here.
// emptyIsZero: a budget's limit, where a quantity it does not carry is 0 — not offered; left empty, it stays absent rather than blocking the save (a resource added to the catalogue later is missing from every older budget).
export function validateQuota(t, resources, quota, { allowUnlimited = false, providerDefaults = false, emptyIsZero = false } = {}) {
    const errors = {};
    (resources || []).forEach(r => {
        const v = quota?.[r.id];
        if (isAvailability(r)) {
            // Absent is "not granted": a stored limit only carries the
            // availabilities that were set, and one added to the catalogue
            // later is missing from every older budget. Treating that as
            // invalid blocked saving an untouched field.
            if (v !== undefined && v !== null && v !== 0 && v !== 1) {
                errors[r.id] = t('projects.quotaInputs.grantedOrNot');
            }
            return;
        }
        if (allowUnlimited && v === UNLIMITED_QUOTA) return;
        // Left empty, a rate of another provider is its default (showsDefault) — a valid answer, not a missing one.
        if ((v === null || v === undefined || v === '') && (emptyIsZero || (providerDefaults && showsDefault(r)))) return;
        if (v === null || v === undefined || v === '' || v < (allowUnlimited ? 0 : r.min) || v > r.max) {
            // The range, not the field's description: the description repeated under the field read as the error.
            errors[r.id] = t('projects.quotaInputs.range', { min: r.min, max: r.max });
        }
    });
    return errors;
}

// SyncErrorLine is what OpenStack refused for a resource on the last sync, in words; nothing while it is in place.
function SyncErrorLine({ resource, error, pl }) {
    const { t } = useTranslation();
    const text = syncErrorText(t, resource, error);
    return text ? <Text size="xs" c="red.8" pl={pl}>{text}</Text> : null;
}
