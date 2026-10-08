import { useState } from 'react';
import { Badge, Button, Group, Stack, Text } from '@mantine/core';
import { ListPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ProjectsPrincipalAutocomplete } from './principal-search.jsx';
import { PrincipalImportModal } from './modal-principal-import.jsx';
import { tokenDisplay, useTokenLabels } from './token-labels.jsx';
import { COLOR } from './util-project.jsx';
import { canonicalToken } from './util-principal-import.js';

// EditorHeading is the heading of a list editor — the same size and weight for
// every list of people on a form, so two of them side by side read as peers.
export function EditorHeading({ label, description }) {
    if (!label && !description) return null;
    return (
        <div>
            {label && <Text fw={600} size="sm">{label}</Text>}
            {description && <Text size="xs" c="dimmed">{description}</Text>}
        </div>
    );
}

// TokenListEditor edits a plain list of user:/group: tokens (admin scope,
// eligible requesters). Group tokens autocomplete from the directory; user
// tokens (user:someone@…) can be typed directly.
//
// listAs "badges" suits a compact list inside a larger form; "rows" matches
// TokenRoleEditor's rows, for where the two stand one above the other.
export function TokenListEditor({ label, description, tokens, onChange, placeholder, error, listAs = 'badges', emptyMessage }) {
    const { t } = useTranslation();
    const [draft, setDraft] = useState('');
    const [importing, setImporting] = useState(false);
    const labels = useTokenLabels(tokens);

    const add = (raw) => {
        // A bare email means a person: store it as the user: token it has to be
        // to ever match. The badge strips the prefix for display, so an
        // unprefixed address would look identical — and silently never grant.
        const token = canonicalToken(raw ?? draft);
        if (!token) return;
        if (!tokens.includes(token)) onChange([...tokens, token]);
        setDraft('');
    };

    const importTokens = (entries) => {
        const added = entries.map(e => e.token).filter(token => !tokens.includes(token));
        if (added.length) onChange([...tokens, ...added]);
    };

    const remove = (token) => onChange(tokens.filter(existing => existing !== token));

    return (
        <Stack gap="xs">
            <EditorHeading label={label} description={description} />

            <Group gap="xs" align="flex-start" wrap="nowrap">
                <div style={{ flex: 1 }}>
                    <ProjectsPrincipalAutocomplete
                        value={draft}
                        onChange={setDraft}
                        onSelect={add}
                        placeholder={placeholder ?? t('projects.tokenList.placeholder')}
                    />
                </div>
                <Button variant="light" onClick={() => add()} disabled={!draft.trim()}>{t('projects.forms.add')}</Button>
                <Button variant="default" leftSection={<ListPlus size={16} />} onClick={() => setImporting(true)}>
                    {t('projects.principalImport.open')}
                </Button>
            </Group>

            {importing && (
                <PrincipalImportModal
                    existing={tokens}
                    onImport={importTokens}
                    onClose={() => setImporting(false)}
                />
            )}

            {tokens.length === 0
                ? <Text size="xs" c="dimmed">{emptyMessage ?? t('projects.tokenList.empty')}</Text>
                : listAs === 'rows' ? (
                    <Stack gap="xs">
                        {tokens.map(token => (
                            <Group key={token} justify="space-between" align="center" wrap="nowrap">
                                <Text size="sm">{tokenDisplay(token, labels[token])}</Text>
                                <Button size="xs" color={COLOR.negative} variant="light" onClick={() => remove(token)}>
                                    {t('projects.forms.remove')}
                                </Button>
                            </Group>
                        ))}
                    </Stack>
                ) : (
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
