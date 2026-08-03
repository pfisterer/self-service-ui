import { useState, useEffect } from 'react';
import { Autocomplete, Loader, Text } from '@mantine/core';
import { useClient } from '../providers/client.jsx';

/**
 * GroupTokenAutocomplete
 *
 * The server searches groups by token AND by label (display name), so the
 * dropdown must show whatever the server returned. Mantine filters `data`
 * client-side by default, which would drop every label-only match (the option
 * text is the token, and the token does not contain the typed label) — hence
 * the identity `filter`. The option's label stays the bare token so selecting
 * one inserts the token, with the group label rendered underneath.
 *
 * Props:
 *   value: string
 *   onChange: (value: string) => void
 *   onSelect?: (value: string) => void
 *   placeholder?: string
 *   disabled?: boolean
 *   limit?: number
 */
export function GroupTokenAutocomplete({ value, onChange, onSelect, placeholder = 'e.g. group:cs-students', limit = 10 }) {
    const { sdk, client } = useClient('projects');
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState(value || '');

    useEffect(() => {
        if (!search) {
            setGroups([]);
            return;
        }

        const fetchData = async () => {
            try {
                setLoading(true);
                try {
                    const res = await sdk.searchGroups({ client, query: { q: search, limit } });
                    setGroups((res?.data?.groups || []).filter(g => g?.token));
                } catch (err) {
                    console.error('Error fetching group suggestions:', err);
                    setGroups([]);
                }
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [search, client, sdk, limit]);

    // Secondary line: "description (display name)", with either part omitted when
    // it is missing — imported groups usually carry only a description, since
    // their display name is just the group ID and is dropped by the API.
    const describe = (g) => (g.description && g.label)
        ? `${g.description} (${g.label})`
        : (g.description || g.label || '');
    const detailByToken = Object.fromEntries(groups.map(g => [g.token, describe(g)]));

    return (
        <Autocomplete
            placeholder={placeholder}
            value={value}
            data={groups.map(g => g.token)}
            filter={({ options }) => options}
            clearable={true}
            onChange={(val) => { setSearch(val); onChange(val); }}
            onOptionSubmit={(val) => { if (onSelect) onSelect(val); }}
            renderOption={({ option }) => (
                <div>
                    <Text size="sm">{option.value}</Text>
                    {detailByToken[option.value] && (
                        <Text size="xs" c="dimmed">{detailByToken[option.value]}</Text>
                    )}
                </div>
            )}
            rightSection={loading ? <Loader size="xs" /> : null}
        />
    );

}
