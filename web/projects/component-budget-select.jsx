import { useMemo } from 'react';
import { Badge, Group, Select, Text } from '@mantine/core';
import { Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { budgetLabel } from './component-budget-path.jsx';
import { COLOR, hasAutoApprove } from './util-project.jsx';

// BudgetSelect is the one picker for a budget — where a project or budget is
// requested, where it is moved to, which budget an allocation comes from. Every
// option is labelled with its path (budgetLabel), the list is searchable, and
// a budget that grants on the spot carries a badge.
//
// `budgets` is a flat list. With `groups` ([{ label, budgets }]) the options are
// grouped instead — managed vs. requestable when a project is placed.
export function BudgetSelect({
    label, description, placeholder, budgets = [], groups = null, value, onChange,
    error, required = true, emptyDescription, leftSection, markInstant = false,
}) {
    const { t } = useTranslation();
    const all = groups ? groups.flatMap(g => g.budgets) : budgets;
    const instantIds = useMemo(
        () => new Set(markInstant ? all.filter(hasAutoApprove).map(b => b.id) : []),
        [all, markInstant]);

    const data = useMemo(() => {
        const option = (b) => ({ value: b.id, label: budgetLabel(b) });
        if (!groups) return budgets.map(option);
        return groups.filter(g => g.budgets.length)
            .map(g => ({ group: g.label, items: g.budgets.map(option) }));
    }, [budgets, groups]);

    if (all.length === 0) {
        return (
            <Select label={label} required={required} data={[]} value={null} disabled error={error}
                description={emptyDescription ?? description} leftSection={leftSection} />
        );
    }
    return (
        <Select
            label={label}
            description={description}
            placeholder={placeholder}
            required={required}
            searchable
            allowDeselect={false}
            data={data}
            value={value}
            onChange={onChange}
            error={error}
            leftSection={leftSection}
            renderOption={({ option }) => (
                <Group gap="xs" wrap="nowrap" style={{ flex: 1 }}>
                    <Text size="sm" truncate>{option.label}</Text>
                    {instantIds.has(option.value) && (
                        <Badge size="xs" variant="light" color={COLOR.positive} leftSection={<Zap size="10" />}>
                            {t('projects.projectForm.instantBadge')}
                        </Badge>
                    )}
                </Group>
            )}
        />
    );
}
