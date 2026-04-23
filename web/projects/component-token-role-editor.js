import { html } from 'htm/preact';
import { Badge, Button, Group, Select, Text, Stack } from '@mantine/core';
import { formatRoleLabel } from './util-project.js';
import { SearchableItemSelector } from './component-searchable-item-selector.js';

export function TokenRoleEditor({
    label,
    authorizedUsers,
    onAddToken,
    onRemoveToken,
    onOpenstackRoleChange,
    searchResults,
    isSearching,
    onSearch,
    roles,
    defaultOpenstackRole = 'member',
    error,
    emptyMessage = 'No authorized users',
    isActive = true,
    onFocus = null,
    readOnly = false,
}) {
    const renderSearchResult = (item, onAdd, buttonLabel) => html`
        <${Group} justify="space-between" key=${item}>
            <${Text} size="sm">${item}<//>
            <${Button}
                size="xs"
                variant="light"
                onClick=${() => onAdd(item, defaultOpenstackRole)}
            >
                ${buttonLabel}
            <//>
        <//>
    `;

    const renderItem = (auth, onRemove) => {
        if (!auth) return null;
        return html`
            <${Group} justify="space-between" key=${auth.token} align="center">
                <${Text} size="sm">${auth.token}<//>
                <${Group} gap="xs">
                    <${Text} size="xs" c="dimmed">OpenStack role<//>
                    <${Select}
                        size="xs"
                        value=${auth.openstack_role}
                        onChange=${(newRole) => { if (newRole) onOpenstackRoleChange(auth.token, newRole); }}
                        data=${roles.map(role => ({ value: role, label: formatRoleLabel(role) }))}
                        w=${130}
                    />
                    <${Button}
                        size="xs"
                        color="red"
                        variant="light"
                        onClick=${() => onRemove(auth.token)}
                    >
                        Remove
                    <//>
                <//>
            <//>
        `;
    };

    if (readOnly) {
        const users = authorizedUsers || [];
        return html`
            <${Stack} gap="xs">
                ${label && html`<${Text} size="sm" fw=${600}>${label}<//>`}
                ${users.length === 0
                    ? html`<${Text} size="xs" c="dimmed">${emptyMessage}<//>`
                    : users.map(auth => html`
                        <${Group} key=${auth.token} gap="xs">
                            <${Text} size="sm">${auth.token}<//>
                            <${Badge} size="xs" variant="outline" color="gray">
                                ${formatRoleLabel(auth.openstack_role)}
                            <//>
                        <//>
                    `)
                }
            <//>
        `;
    }

    return html`
        <${SearchableItemSelector}
            label=${label}
            selectedItems=${authorizedUsers}
            onAdd=${onAddToken}
            onRemove=${onRemoveToken}
            searchResults=${searchResults}
            isSearching=${isSearching}
            onSearch=${onSearch}
            placeholder="Search and add users/groups..."
            searchDescription="Type to search for users or groups to authorize"
            emptyMessage=${emptyMessage}
            buttonLabel="Add"
            renderItem=${renderItem}
            renderSearchResult=${renderSearchResult}
            error=${error}
            isActive=${isActive}
            onFocus=${onFocus}
        />
    `;
}
