import { useState } from 'react';
import { Badge, Button, Group, Stack, Text } from '@mantine/core';
import { GroupTokenAutocomplete } from './component-group-token-autocomplete.jsx';
import { tokenDisplay, useTokenLabels } from './token-labels.jsx';

// TokenListEditor edits a plain list of user:/group: tokens (admin scope,
// eligible requesters). Group tokens autocomplete from the directory; user
// tokens (user:someone@…) can be typed directly.
export function TokenListEditor({ label, description, tokens, onChange, placeholder, error }) {
    const [draft, setDraft] = useState('');
    const labels = useTokenLabels(tokens);

    const add = (raw) => {
        const token = (raw ?? draft).trim();
        if (!token) return;
        if (!tokens.includes(token)) onChange([...tokens, token]);
        setDraft('');
    };

    const remove = (token) => onChange(tokens.filter(t => t !== token));

    return (
        <Stack gap="xs">
            <div>
                {label && <Text fw={600} size="sm">{label}</Text>}
                {description && <Text size="xs" c="dimmed">{description}</Text>}
            </div>

            <Group gap="xs" align="flex-start" wrap="nowrap">
                <div style={{ flex: 1 }}>
                    <GroupTokenAutocomplete
                        value={draft}
                        onChange={setDraft}
                        onSelect={add}
                        placeholder={placeholder ?? 'group:name or user:email@…'}
                    />
                </div>
                <Button variant="light" onClick={() => add()} disabled={!draft.trim()}>Add</Button>
            </Group>

            {tokens.length === 0
                ? <Text size="xs" c="dimmed">Nobody added yet.</Text>
                : (
                    <Group gap="xs" wrap="wrap">
                        {tokens.map(token => (
                            <Badge key={token} variant="outline" color="gray" style={{ textTransform: 'none' }}
                                rightSection={
                                    <span role="button" style={{ cursor: 'pointer' }} onClick={() => remove(token)}>×</span>
                                }>
                                {tokenDisplay(token, labels[token])}
                            </Badge>
                        ))}
                    </Group>
                )}

            {error && <Text c="red" size="xs">{error}</Text>}
        </Stack>
    );
}
