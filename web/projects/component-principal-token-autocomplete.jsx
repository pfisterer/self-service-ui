import { useState, useEffect } from 'react';
import { Autocomplete, Loader, Stack, Text } from '@mantine/core';
import { useClient } from '../providers/client.jsx';

/**
 * PrincipalTokenAutocomplete
 *
 * Suggests both kinds of token a rule may name: groups (matched by token,
 * display name or description) and individual users (matched by email address
 * only — the directory is deliberately not searchable by person's name).
 *
 * The dropdown must show whatever the server returned. Mantine filters `data`
 * client-side by default, which would drop every match found through a label or
 * description (the option text is the token, and the token does not contain the
 * typed text) — hence the identity `filter`. The option's label stays the bare
 * token so selecting one inserts the token, with the detail rendered underneath.
 *
 * Props:
 *   value: string
 *   onChange: (value: string) => void
 *   onSelect?: (value: string) => void
 *   placeholder?: string
 *   disabled?: boolean
 *   limit?: number
 */
export function PrincipalTokenAutocomplete({ value, onChange, onSelect, placeholder = 'e.g. group:cs-students', limit = 10 }) {
    const { sdk, client } = useClient('projects');
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(false);
    // A directory that is down looks exactly like "no group matches" — both show
    // an empty dropdown — so the failure is stated instead of swallowed.
    const [failed, setFailed] = useState(false);
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
                    const res = await sdk.searchPrincipals({ client, query: { q: search, limit } });
                    setGroups([
                        ...(res?.data?.groups || []).filter(g => g?.token),
                        ...(res?.data?.users || []).map(email => ({ token: `user:${email}`, description: 'Individual person' })),
                    ]);
                    setFailed(false);
                } catch (err) {
                    console.error('Error fetching group suggestions:', err);
                    setGroups([]);
                    setFailed(true);
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

    // Hand the token over and empty the field — both the visible value and the
    // query behind it, so the next keystroke starts a fresh search instead of
    // filtering against what was just added.
    const submit = (raw) => {
        const token = (raw ?? '').trim();
        if (!token) return;
        onSelect?.(token);
        setSearch('');
        onChange('');
    };

    return (
        <Stack gap="4">
        <Autocomplete
            placeholder={placeholder}
            value={value}
            data={groups.map(g => g.token)}
            filter={({ options }) => options}
            clearable={true}
            onChange={(val) => { setSearch(val); onChange(val); }}
            onOptionSubmit={submit}
            onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                // With an option highlighted Mantine submits that one; taking over
                // here would add the typed text as a second entry.
                if (e.currentTarget.getAttribute('aria-activedescendant')) return;
                e.preventDefault();
                submit(e.currentTarget.value);
            }}
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
        {failed && (
            <Text size="xs" c="orange.8">
                The group directory is not reachable — no suggestions. You can still type a token by hand.
            </Text>
        )}
        </Stack>
    );

}
