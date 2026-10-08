import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Autocomplete, Loader, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';

/**
 * PrincipalTokenAutocomplete
 *
 * Suggests both kinds of token a rule may name: groups (matched by token,
 * display name or description) and individual users (matched by email address
 * only — the directory is deliberately not searchable by person's name).
 *
 * Shared by every token field: the projects' rule and member lists and the
 * LLM service's access rules. Both APIs answer the same role-provider search
 * in the same shape, so only `search` differs — which API is asked is the
 * caller's business, because a deployment may run one of them without the other.
 *
 * Two ways to use it. For a LIST (default) the field empties after each pick
 * and the token goes to onSelect. With `single` the picked token stays in the
 * field as its value — for a form that names exactly one token.
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
 *   search: (q: string, limit: number) => Promise<[{ token, label?, description? }]>
 *   searchKey: array — query-key prefix naming the API, e.g. ['llm', 'principals']
 *   onSelect?: (value: string) => void
 *   single?: boolean
 *   placeholder?: string
 *   label?: string
 *   limit?: number
 */
export function PrincipalTokenAutocomplete({
    value, onChange, search: searchFn, searchKey, onSelect, single = false, placeholder, label, limit = 10,
}) {
    const { t } = useTranslation();
    const [search, setSearch] = useState(single ? '' : (value || ''));
    // The token just handed over from the dropdown. Mantine calls onChange with
    // the picked option right AFTER onOptionSubmit, which wrote the token back
    // into the field that submit() had just emptied — see onChange below.
    const justSubmitted = useRef(null);

    // The search term is part of the cache key, so typing back to something
    // already looked up answers from the cache instead of the network, and a
    // slow response for an old term can no longer overwrite a newer one. That
    // race was the reason the effect below carried its own bookkeeping.
    const suggestionsQuery = useQuery({
        queryKey: [...searchKey, search, limit],
        queryFn: () => searchFn(search, limit),
        enabled: !!searchFn && !!search,
    });

    const groups = search ? (suggestionsQuery.data ?? []) : [];
    const loading = suggestionsQuery.isFetching;
    // A directory that is down looks exactly like "no group matches" — both show
    // an empty dropdown — so the failure is stated instead of swallowed.
    const failed = suggestionsQuery.isError;

    // Secondary line: "description (display name)", with either part omitted when
    // it is missing — imported groups usually carry only a description, since
    // their display name is just the group ID and is dropped by the API.
    const describe = (g) => (g.description && g.label)
        ? `${g.description} (${g.label})`
        : (g.description || g.label || '');
    const detailByToken = Object.fromEntries(groups.map(g => [g.token, describe(g)]));

    // List: hand the token over and empty the field — both the visible value
    // and the query behind it, so the next keystroke starts a fresh search
    // instead of filtering against what was just added.
    // Single: the token becomes the field's value, and the search stops, so the
    // dropdown does not open again on the token just picked.
    const submit = (raw) => {
        const token = (raw ?? '').trim();
        if (!token) return;
        onSelect?.(token);
        justSubmitted.current = token;
        setSearch('');
        onChange(single ? token : '');
    };

    return (
        <Stack gap="4">
        <Autocomplete
            label={label}
            placeholder={placeholder ?? t('helper.principalSearch.placeholder')}
            value={value}
            data={groups.map(g => g.token)}
            filter={({ options }) => options}
            clearable={true}
            onChange={(val) => {
                const echo = justSubmitted.current !== null && val === justSubmitted.current;
                justSubmitted.current = null;
                if (echo) return;
                setSearch(val);
                onChange(val);
            }}
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
        {/* The syntax only matters once someone is searching, so it appears
            then rather than adding a line to every form. */}
        {search && !failed && (
            <Text size="xs" c="dimmed">{t('helper.principalSearch.syntax')}</Text>
        )}
        {failed && (
            <Text size="xs" c="orange.8">
                {t('helper.principalSearch.unreachable')}
            </Text>
        )}
        </Stack>
    );

}
