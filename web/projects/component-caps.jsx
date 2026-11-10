import { Checkbox, NumberInput, Select, SimpleGrid, Stack, Switch, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { capGroups, capHint, capName, capsSummary, capUnit, choiceLabel, formatCapValue, grantAvailable, grantStart, groupHint, groupTitle, isGrantBlock, isLooser, isSet } from './util-caps.js';

// CapsInputs edits a budget's own caps (caps in os-mgt, see util-caps.js) from the providers' catalogue, one section per group; groups: the groups to show (capGroups of the catalogue), all where left out. value: the budget's own caps by id; inherited: what the budgets above allow (inherited_caps, for a new budget what applies at the one it draws from); defaults: the provider's values where no budget sets one, by id, shown as placeholder where known; errors: by form path (caps.<id>); isRoot: nothing above, grant caps are set here; inheritsLimit: the budget passes on the grant caps above, shown, not edited. onChange(id, value) with null to clear.
export function CapsInputs({ catalog, groups, ...props }) {
    return (
        <Stack gap="lg">
            {(groups ?? capGroups(catalog)).map(g => <CapGroup key={g.group || '-'} group={g} {...props} />)}
        </Stack>
    );
}

// CapGroup is one group of caps under its heading.
export function CapGroup({ group, ...props }) {
    const { t } = useTranslation();
    const hint = groupHint(t, group.group);
    return (
        <Stack gap="sm">
            <div>
                <Text fw={600} size="sm">{groupTitle(t, group.group)}</Text>
                {hint && <Text size="xs" c="dimmed">{hint}</Text>}
            </div>
            {group.blocks.map(block => (isGrantBlock(block)
                ? <GrantBlock key={block.together || block.caps[0].id} block={block} {...props} />
                : <CapBlock key={block.together || block.caps[0].id} block={block} {...props} />))}
        </Stack>
    );
}

// CapBlock is caps that are no grant: each a field of its own, empty where the budget sets nothing (then the budgets above decide, shown as placeholder).
function CapBlock({ block, value, inherited, defaults, errors = {}, onChange, disabled = false }) {
    if (block.caps.length === 1) {
        const cap = block.caps[0];
        return <CapField cap={cap} value={value?.[cap.id]} above={inherited?.[cap.id]} standard={defaults?.[cap.id]} error={errors[`caps.${cap.id}`]} onChange={v => onChange(cap.id, v)} disabled={disabled} withHint maw={260} />;
    }
    return (
        <SimpleGrid cols={{ base: 1, sm: Math.min(3, block.caps.length) }} spacing="xs">
            {block.caps.map(cap => (
                <CapField key={cap.id} cap={cap} value={value?.[cap.id]} above={inherited?.[cap.id]} standard={defaults?.[cap.id]} error={errors[`caps.${cap.id}`]} onChange={v => onChange(cap.id, v)} disabled={disabled} withHint />
            ))}
        </SimpleGrid>
    );
}

// GrantBlock is grant caps switched on and off together ("Batch-Jobs erlauben"), with their values while on, each at most what the budget above allows. Below the root it is offered only where the budget above has them, or where the budget still has some of its own (so they can be switched off). A budget that inherits its limit passes on those above: shown, not edited.
function GrantBlock({ block, value, inherited, defaults, errors = {}, onChange, isRoot = false, inheritsLimit = false, disabled = false }) {
    const { t } = useTranslation();
    const tag = block.together || block.caps[0].id;
    const label = block.together
        ? t(`projects.caps.together.${tag}.label`, { defaultValue: t('projects.caps.allow') })
        : capName(t, block.caps[0]);
    const hint = block.together ? t(`projects.caps.together.${tag}.hint`, { defaultValue: '' }) : capHint(t, block.caps[0]);
    const above = isRoot ? {} : (inherited || {});
    const on = block.caps.some(c => isSet(value?.[c.id]));
    const available = grantAvailable(block, inherited, isRoot);
    if (inheritsLimit) {
        return (
            <Stack gap={4}>
                <Text size="sm" fw={500}>{label}</Text>
                <Text size="xs">{t('projects.caps.inheritsGrant', { value: capsSummary(t, block.caps, above) })}</Text>
            </Stack>
        );
    }
    if (!available && !on) return null;
    const blockError = block.caps.map(c => errors[`caps.${c.id}`]).find(Boolean);
    const toggle = (checked) => {
        const start = checked ? grantStart(block, isRoot ? null : inherited, defaults) : {};
        for (const cap of block.caps) onChange(cap.id, checked ? start[cap.id] : null);
    };
    return (
        <Stack gap={4}>
            <Switch label={label} description={hint || undefined} checked={on} disabled={disabled || (!on && !available)}
                onChange={e => toggle(e.currentTarget.checked)} />
            {on && (
                <SimpleGrid cols={{ base: 1, sm: Math.min(3, block.caps.length) }} spacing="xs" maw={block.caps.length > 1 ? 540 : 260}>
                    {block.caps.map(cap => (
                        <CapField key={cap.id} cap={cap} value={value?.[cap.id]} above={above[cap.id]} standard={defaults?.[cap.id]} onChange={v => onChange(cap.id, v)} disabled={disabled} withHint={block.caps.length > 1} grant />
                    ))}
                </SimpleGrid>
            )}
            {blockError && <Text size="xs" c="red">{blockError}</Text>}
            {on && !isRoot && Object.keys(above).length > 0 && <Text size="xs" c="dimmed">{t('projects.caps.aboveHint', { value: capsSummary(t, block.caps, above) })}</Text>}
            {isRoot && <Text size="xs" c="dimmed">{t('projects.caps.rootHint')}</Text>}
        </Stack>
    );
}

// CapField is one cap's field: a selection for choices (those looser than allowed above disabled), else a number within min..max and what the budgets above allow, with "no upper bound" where the cap allows it and nothing above bounds it. The placeholder says what applies while it is empty: the value above, else the provider's default.
function CapField({ cap, value, above, standard, error, onChange, disabled = false, withHint = false, grant = false, maw }) {
    const { t } = useTranslation();
    const name = capName(t, cap);
    const unit = capUnit(t, cap);
    const label = unit ? t('projects.caps.labelWithUnit', { name, unit }) : name;
    const hint = withHint ? capHint(t, cap) : '';
    const aboveBounds = isSet(above) && !(cap.unbounded && Number(above) === 0);
    const placeholder = grant ? undefined : isSet(above)
        ? t('projects.caps.fromAbove', { value: formatCapValue(t, cap, above) })
        : isSet(standard)
            ? t('projects.caps.standardValue', { value: formatCapValue(t, cap, standard) })
            : t(`projects.caps.${cap.id}.standard`, { defaultValue: t('projects.caps.standard') });
    if (cap.choices?.length) {
        return (
            <Select
                size="xs"
                maw={maw}
                label={label}
                description={hint || undefined}
                data={cap.choices.map((_, i) => ({ value: String(i), label: choiceLabel(t, cap, i), disabled: isLooser(cap, i, above) }))}
                clearable={!grant}
                allowDeselect={!grant}
                value={isSet(value) ? String(value) : null}
                disabled={disabled}
                placeholder={placeholder}
                error={error}
                onChange={v => onChange(v === null || v === '' ? null : Number(v))}
            />
        );
    }
    const unboundedAllowed = cap.unbounded && !aboveBounds;
    const unlimited = cap.unbounded && isSet(value) && Number(value) === 0;
    return (
        <Stack gap={2} maw={maw}>
            <NumberInput
                size="xs"
                label={label}
                description={hint || undefined}
                min={cap.min}
                max={aboveBounds ? Math.min(Number(above), cap.max) : cap.max}
                allowDecimal={false}
                allowNegative={false}
                value={unlimited || !isSet(value) ? '' : value}
                disabled={disabled || unlimited}
                placeholder={placeholder}
                error={error}
                onChange={v => onChange(v === '' ? null : v)}
            />
            {(unboundedAllowed || unlimited) && (
                <Checkbox
                    size="xs"
                    label={t('projects.caps.unbounded')}
                    checked={unlimited}
                    disabled={disabled}
                    onChange={e => onChange(e.currentTarget.checked ? 0 : null)}
                />
            )}
        </Stack>
    );
}
