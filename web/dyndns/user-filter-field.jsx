import { useState } from 'react';
import { Badge, Group, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { AtSign, User, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PrincipalTokenAutocomplete } from '/helper/principal-token-autocomplete.jsx';
import { appendToUserFilter, splitUserFilter } from '/helper/dns-validation.js';
import { tokenDisplay, useTokenLabels } from '/projects/token-labels.jsx';
import { useNodesApi } from '/projects/api-nodes.jsx';

// What an entry of a user filter is: a group (or a role in one), a person (address or user: token) or a pattern for many addresses.
export function filterEntryKind(entry) {
    const e = (entry || '').toLowerCase();
    if (e.startsWith('group:')) return 'group';
    if (e.includes('*')) return 'pattern';
    return 'user';
}

const ICON = { group: Users, user: User, pattern: AtSign };

// useDirectorySearch is the people-and-groups search the rule editors offer: the same directory search as the projects' member lists (openstack-management-api answers it from the role provider). Null when this deployment has no projects section; the field then takes typed entries only.
export function useDirectorySearch() {
    return useNodesApi()?.searchPrincipalDetails ?? null;
}

// FilterEntries shows a user filter the way people read it: one badge per entry, groups with their display name (and the token, which is what the editor takes), people by address, patterns as they are. The raw filter stays the tooltip.
export function FilterEntries({ filter }) {
    const { t } = useTranslation();
    const entries = splitUserFilter(filter);
    const labels = useTokenLabels(entries.filter(e => e.toLowerCase().startsWith('group:')));
    if (entries.length === 0) return null;
    return (
        <Group gap={4} wrap="wrap" data-testid="filter-entries">
            {entries.map(entry => {
                const kind = filterEntryKind(entry);
                const Icon = ICON[kind];
                const text = kind === 'group' ? tokenDisplay(entry, labels[entry]) : entry.replace(/^user:/i, '');
                return (
                    <Tooltip key={entry} label={entry} openDelay={400}>
                        <Badge variant="light" color={kind === 'group' ? 'blue' : 'gray'} tt="none" fw={400}
                            leftSection={<Icon size={12} aria-label={t(`dyndns.userFilter.kind.${kind}`)} />}>
                            {text}
                        </Badge>
                    </Tooltip>
                );
            })}
        </Group>
    );
}

// UserFilterField edits a user filter (rules and delegations): the comma-separated text stays editable for addresses and patterns, groups and people are added from the directory search, and the entries are shown with readable names underneath.
//
// search: (q, limit) => Promise<[{ token, label?, description? }]>, or null for no directory (typing only).
export function UserFilterField({ label, description, placeholder, value, onChange, error, search, searchKey = ['dyndns', 'principals'] }) {
    const { t } = useTranslation();
    const [pick, setPick] = useState('');
    return (
        <Stack gap={6}>
            <TextInput
                label={label}
                name="target_user_filter"
                value={value}
                onChange={(e) => onChange(e.currentTarget.value)}
                required
                placeholder={placeholder}
                description={description}
                error={error}
            />
            <FilterEntries filter={value} />
            {search && (
                <PrincipalTokenAutocomplete
                    label={t('dyndns.userFilter.pickLabel')}
                    placeholder={t('dyndns.userFilter.pickPlaceholder')}
                    search={search}
                    searchKey={searchKey}
                    value={pick}
                    onChange={setPick}
                    onSelect={(token) => onChange(appendToUserFilter(value, token))}
                />
            )}
            {!search && <Text size="xs" c="dimmed">{t('dyndns.userFilter.noDirectory')}</Text>}
        </Stack>
    );
}
