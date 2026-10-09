import { useState } from 'react';
import { Badge, Button, Group, Select, Stack, Text } from '@mantine/core';
import { ListPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ProjectsPrincipalAutocomplete } from './principal-search.jsx';
import { PrincipalImportModal } from './modal-principal-import.jsx';
import { tokenDisplay, useTokenLabels } from './token-labels.jsx';
import { COLOR, formatRoleLabel } from './util-project.jsx';
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

// PrincipalListEditor is the one editor for a list of people and groups: the
// directory search (a bare email becomes the user: token it has to be to ever
// match), the list import, and the entries — as rows or as badges. With `roles`
// every entry carries an OpenStack role, picked per row.
//
// entries: [{ token, role? }]
function PrincipalListEditor({
    label, description, entries, onChange, roles = null, defaultRole = 'member',
    placeholder, error, listAs = 'rows', emptyMessage,
}) {
    const { t } = useTranslation();
    const [draft, setDraft] = useState('');
    const [importing, setImporting] = useState(false);
    const tokens = entries.map(e => e.token);
    const labels = useTokenLabels(tokens);
    const withRoles = Array.isArray(roles);

    const add = (raw) => {
        const token = canonicalToken(raw ?? draft);
        if (!token) return;
        if (!tokens.includes(token)) onChange([...entries, withRoles ? { token, role: defaultRole } : { token }]);
        setDraft('');
    };
    const importEntries = (imported) => {
        const added = imported.filter(e => !tokens.includes(e.token))
            .map(e => (withRoles ? { token: e.token, role: e.role || defaultRole } : { token: e.token }));
        if (added.length) onChange([...entries, ...added]);
    };
    const remove = (token) => onChange(entries.filter(e => e.token !== token));
    const setRole = (token, role) => onChange(entries.map(e => (e.token === token ? { ...e, role } : e)));

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
                    roles={withRoles ? roles : undefined}
                    defaultRole={withRoles ? defaultRole : undefined}
                    onImport={importEntries}
                    onClose={() => setImporting(false)}
                />
            )}

            {entries.length === 0
                ? <Text size="xs" c="dimmed">{emptyMessage ?? t('projects.tokenList.empty')}</Text>
                : listAs === 'rows' ? (
                    <Stack gap="xs">
                        {entries.map(e => (
                            <Group key={e.token} justify="space-between" align="center" wrap="nowrap">
                                <Text size="sm" style={{ overflowWrap: 'anywhere' }}>{tokenDisplay(e.token, labels[e.token])}</Text>
                                <Group gap="xs" wrap="nowrap">
                                    {withRoles && (
                                        <Select
                                            size="xs"
                                            w={130}
                                            aria-label={t('projects.memberEditor.openstackRole')}
                                            value={e.role}
                                            allowDeselect={false}
                                            onChange={(role) => { if (role) setRole(e.token, role); }}
                                            data={roles.map(role => ({ value: role, label: formatRoleLabel(role) }))}
                                        />
                                    )}
                                    <Button size="xs" color={COLOR.negative} variant="light" onClick={() => remove(e.token)}>
                                        {t('projects.forms.remove')}
                                    </Button>
                                </Group>
                            </Group>
                        ))}
                    </Stack>
                ) : (
                    <Group gap="xs" wrap="wrap">
                        {entries.map(e => (
                            <Badge key={e.token} variant="outline" color="gray" style={{ textTransform: 'none' }}
                                rightSection={
                                    <span role="button" aria-label={t('projects.forms.remove')} style={{ cursor: 'pointer' }} onClick={() => remove(e.token)}>×</span>
                                }>
                                {tokenDisplay(e.token, labels[e.token])}
                            </Badge>
                        ))}
                    </Group>
                )}

            {error && <Text c="red" size="xs">{error}</Text>}
        </Stack>
    );
}

// TokenListEditor edits a plain list of user:/group: tokens — admin scope,
// eligible requesters. listAs "badges" suits a compact list inside a larger
// form; "rows" matches MemberRoleEditor, for where the two stand together.
export function TokenListEditor({ tokens, onChange, listAs = 'badges', ...props }) {
    return (
        <PrincipalListEditor
            {...props}
            listAs={listAs}
            entries={tokens.map(token => ({ token }))}
            onChange={(entries) => onChange(entries.map(e => e.token))}
        />
    );
}

// MemberRoleEditor edits a project's members with their OpenStack role
// (authorized_users: [{ token, openstack_role }]).
export function MemberRoleEditor({ members, onChange, roles, defaultRole = 'member', ...props }) {
    const { t } = useTranslation();
    return (
        <PrincipalListEditor
            emptyMessage={t('projects.memberEditor.empty')}
            placeholder={t('projects.memberEditor.placeholder')}
            {...props}
            roles={roles || []}
            defaultRole={defaultRole}
            entries={(members || []).map(m => ({ token: m.token, role: m.openstack_role }))}
            onChange={(entries) => onChange(entries.map(e => ({ token: e.token, openstack_role: e.role })))}
        />
    );
}
