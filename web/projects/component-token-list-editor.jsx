import { useState } from 'react';
import { Badge, Button, Group, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { PrincipalTokenAutocomplete } from './component-principal-token-autocomplete.jsx';
import { tokenDisplay, useTokenLabels } from './token-labels.jsx';

// TokenListEditor edits a plain list of user:/group: tokens (admin scope,
// eligible requesters). Group tokens autocomplete from the directory; user
// tokens (user:someone@…) can be typed directly.
export function TokenListEditor({ label, description, tokens, onChange, placeholder, error }) {
    const { t } = useTranslation();
    const [draft, setDraft] = useState('');
    const labels = useTokenLabels(tokens);

    const add = (raw) => {
        let token = (raw ?? draft).trim();
        if (!token) return;
        // A bare email means a person: store it as the user: token it has to be
        // to ever match. The badge strips the prefix for display, so an
        // unprefixed address would look identical — and silently never grant.
        if (!token.includes(':') && token.includes('@')) token = 'user:' + token;
        if (!tokens.includes(token)) onChange([...tokens, token]);
        setDraft('');
    };

    const remove = (token) => onChange(tokens.filter(existing => existing !== token));

    return (
        <Stack gap="xs">
            <div>
                {label && <Text fw={600} size="sm">{label}</Text>}
                {description && <Text size="xs" c="dimmed">{description}</Text>}
            </div>

            <Group gap="xs" align="flex-start" wrap="nowrap">
                <div style={{ flex: 1 }}>
                    <PrincipalTokenAutocomplete
                        value={draft}
                        onChange={setDraft}
                        onSelect={add}
                        placeholder={placeholder ?? t('projects.tokenList.placeholder')}
                    />
                </div>
                <Button variant="light" onClick={() => add()} disabled={!draft.trim()}>{t('projects.forms.add')}</Button>
            </Group>

            {tokens.length === 0
                ? <Text size="xs" c="dimmed">{t('projects.tokenList.empty')}</Text>
                : (
                    <Group gap="xs" wrap="wrap">
                        {tokens.map(token => (
                            <Badge key={token} variant="outline" color="gray" style={{ textTransform: 'none' }}
                                rightSection={
                                    <span role="button" aria-label={t('projects.forms.remove')} style={{ cursor: 'pointer' }} onClick={() => remove(token)}>×</span>
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
