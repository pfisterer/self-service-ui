import { Badge, Button, Group, Select, Text, Stack } from '@mantine/core';
import { formatRoleLabel } from './util-project.jsx';
import { SearchableItemSelector } from './component-searchable-item-selector.jsx';

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
    const renderSearchResult = (item, onAdd, buttonLabel) => (
        <Group justify="space-between" key={item}>
            <Text size="sm">{item}</Text>
            <Button
                size="xs"
                variant="light"
                onClick={() => onAdd(item, defaultOpenstackRole)}
            >
                {buttonLabel}
            </Button>
        </Group>
    );

    const renderItem = (auth, onRemove) => {
        if (!auth) return null;
        return (
            <Group justify="space-between" key={auth.token} align="center">
                <Text size="sm">{auth.token}</Text>
                <Group gap="xs">
                    <Text size="xs" c="dimmed">OpenStack role</Text>
                    <Select
                        size="xs"
                        value={auth.openstack_role}
                        onChange={(newRole) => { if (newRole) onOpenstackRoleChange(auth.token, newRole); }}
                        data={roles.map(role => ({ value: role, label: formatRoleLabel(role) }))}
                        w={130}
                    />
                    <Button
                        size="xs"
                        color="red"
                        variant="light"
                        onClick={() => onRemove(auth.token)}
                    >
                        Remove
                    </Button>
                </Group>
            </Group>
        );
    };

    if (readOnly) {
        const users = authorizedUsers || [];
        return (
            <Stack gap="xs">
                {label && <Text size="sm" fw={600}>{label}</Text>}
                {users.length === 0
                    ? <Text size="xs" c="dimmed">{emptyMessage}</Text>
                    : users.map(auth => (
                        <Group key={auth.token} gap="xs">
                            <Text size="sm">{auth.token}</Text>
                            <Badge size="xs" variant="outline" color="gray">
                                {formatRoleLabel(auth.openstack_role)}
                            </Badge>
                        </Group>
                    ))
                }
            </Stack>
        );
    }

    return (
        <SearchableItemSelector
            label={label}
            selectedItems={authorizedUsers}
            onAdd={onAddToken}
            onRemove={onRemoveToken}
            searchResults={searchResults}
            isSearching={isSearching}
            onSearch={onSearch}
            placeholder="Search and add users/groups..."
            searchDescription="Type to search for users or groups to authorize"
            emptyMessage={emptyMessage}
            buttonLabel="Add"
            renderItem={renderItem}
            renderSearchResult={renderSearchResult}
            error={error}
            isActive={isActive}
            onFocus={onFocus}
        />
    );
}
