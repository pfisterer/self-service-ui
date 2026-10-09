import { useState } from 'react';
import { ActionIcon, Button, Group, Paper, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { attributesError, fromAttributes, toAttributes } from './util-attributes.js';
import { attributesKey } from './util-usage.js';

// Attributes are free-form facts managers attach to a node — a cost centre, a
// project number — grouped under a name. A group is inherited whole from the
// nearest node above that sets it; the API sends what applies at a node as
// effective_attributes, each group with the node it comes from. The platform
// does not interpret them; they go into the usage export for whoever bills.

// useAttributesTab holds the tab's state for an edit dialog. The dialog checks
// it before submitting (validate) and, after its own save, sends the
// attributes only when they changed (changed returns them, or null).
export function useAttributesTab(node) {
    const { t } = useTranslation();
    const [groups, setGroups] = useState(() => fromAttributes(node?.attributes));
    const [error, setError] = useState(null);
    return {
        groups,
        error,
        onChange: (next) => { setGroups(next); setError(null); },
        validate: () => {
            const problem = attributesError(groups);
            setError(problem ? t(`projects.attributes.error.${problem.code}`, problem) : null);
            return !problem;
        },
        changed: () => {
            const next = toAttributes(groups);
            return attributesKey(next) === attributesKey(node?.attributes) ? null : next;
        },
    };
}

// hasAttributes: anything applies at the node that the viewer was sent.
export const hasAttributes = (node) => Object.keys(node?.effective_attributes || {}).length > 0;

// AttributeGroupCard is one group read-only, with where it comes from when that
// is a node above.
function AttributeGroupCard({ node, group, action }) {
    const { t } = useTranslation();
    return (
        <Paper withBorder p="xs" radius="sm" bg="var(--mantine-color-default-hover)">
            <Group justify="space-between" wrap="nowrap" mb={4}>
                <Text size="sm">
                    <b>{group.name}</b>
                    {group.from?.id !== node.id && (
                        <Text span size="xs" c="dimmed">{' · '}{t('projects.attributes.inheritedFrom', { name: group.from?.name || group.from?.id })}</Text>
                    )}
                </Text>
                {action}
            </Group>
            {Object.keys(group.values).sort().map(k => (
                <Text key={k} size="xs" pl="sm" style={{ overflowWrap: 'anywhere' }}>
                    <Text span size="xs" c="dimmed">{k}:</Text> {group.values[k]}
                </Text>
            ))}
        </Paper>
    );
}

const effectiveGroups = (node) => {
    const eff = node?.effective_attributes || {};
    return Object.keys(eff).sort().map(name => ({ name, ...eff[name] }));
};

// AttributesView shows what applies at a node, for those who may see but not
// set it — a project's owner, say.
export function AttributesView({ node }) {
    const { t } = useTranslation();
    const groups = effectiveGroups(node);
    return (
        <Stack gap="sm">
            <Text size="sm" c="dimmed">{t('projects.attributes.explainView')}</Text>
            {groups.map(g => <AttributeGroupCard key={g.name} node={node} group={g} />)}
        </Stack>
    );
}

// AttributesEditor is the "Attributes" tab of the edit dialogs: the node's OWN
// groups (`groups`, editor rows from util-attributes.js), with the inherited
// ones above them read-only, each with a button that copies it here to change
// it — a group set here replaces the inherited one whole.
export function AttributesEditor({ node, groups, onChange }) {
    const { t } = useTranslation();
    const own = new Set(groups.map(g => g.name.trim()));
    const inherited = effectiveGroups(node).filter(g => g.from?.id !== node.id && !own.has(g.name));

    const update = (gi, fn) => onChange(groups.map((g, i) => (i === gi ? fn(g) : g)));
    const setRow = (gi, ri, field, v) => update(gi, x => ({ ...x, rows: x.rows.map((y, j) => (j === ri ? { ...y, [field]: v } : y)) }));

    return (
        <Stack gap="sm">
            <Text size="sm" c="dimmed">{t('projects.attributes.explain')}</Text>

            {inherited.map(g => (
                <AttributeGroupCard key={g.name} node={node} group={g} action={
                    <Button size="compact-xs" variant="light" leftSection={<Copy size="12" />}
                        onClick={() => onChange([...groups, { name: g.name, rows: Object.keys(g.values).sort().map(k => ({ key: k, value: g.values[k] })) }])}>
                        {t('projects.attributes.override')}
                    </Button>
                } />
            ))}

            {groups.map((g, gi) => (
                <Paper key={gi} withBorder p="xs" radius="sm">
                    <Stack gap={6}>
                        <Group gap="xs" wrap="nowrap" align="flex-end">
                            <TextInput size="xs" style={{ flex: 1 }} label={t('projects.attributes.group')}
                                placeholder="billing" value={g.name}
                                onChange={e => { const v = e.currentTarget.value; update(gi, x => ({ ...x, name: v })); }} />
                            <Tooltip label={t('projects.attributes.removeGroup')}>
                                <ActionIcon variant="subtle" color="red" aria-label={t('projects.attributes.removeGroup')}
                                    onClick={() => onChange(groups.filter((_, i) => i !== gi))}>
                                    <Trash2 size="14" />
                                </ActionIcon>
                            </Tooltip>
                        </Group>
                        {g.rows.map((r, ri) => (
                            <Group key={ri} gap="xs" wrap="nowrap" pl="md">
                                <TextInput size="xs" style={{ flex: 2 }} placeholder={t('projects.attributes.key')} aria-label={t('projects.attributes.key')}
                                    value={r.key} onChange={e => setRow(gi, ri, 'key', e.currentTarget.value)} />
                                <TextInput size="xs" style={{ flex: 3 }} placeholder={t('projects.attributes.value')} aria-label={t('projects.attributes.value')}
                                    value={r.value} onChange={e => setRow(gi, ri, 'value', e.currentTarget.value)} />
                                <ActionIcon variant="subtle" color="gray" aria-label={t('projects.attributes.removeKey')}
                                    onClick={() => update(gi, x => ({ ...x, rows: x.rows.filter((_, j) => j !== ri) }))}>
                                    <Trash2 size="13" />
                                </ActionIcon>
                            </Group>
                        ))}
                        {g.rows.length === 0 && (
                            <Text size="xs" c="dimmed" pl="md">{t('projects.attributes.emptyGroup')}</Text>
                        )}
                        <Group pl="md">
                            <Button size="compact-xs" variant="subtle" leftSection={<Plus size="12" />}
                                onClick={() => update(gi, x => ({ ...x, rows: [...x.rows, { key: '', value: '' }] }))}>
                                {t('projects.attributes.addKey')}
                            </Button>
                        </Group>
                    </Stack>
                </Paper>
            ))}

            <Group>
                <Button size="xs" variant="light" leftSection={<Plus size="14" />}
                    onClick={() => onChange([...groups, { name: '', rows: [{ key: '', value: '' }] }])}>
                    {t('projects.attributes.addGroup')}
                </Button>
            </Group>
        </Stack>
    );
}
