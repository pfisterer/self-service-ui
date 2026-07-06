import { Badge, Button, Group, Loader, Paper, Stack, Text, TextInput } from '@mantine/core';

export function SearchableItemSelector({
    label,
    selectedItems,
    onAdd,
    onRemove,
    searchResults,
    isSearching,
    onSearch,
    placeholder = 'Search and add...',
    searchDescription = 'Type to search',
    emptyMessage = 'No items selected',
    buttonLabel = 'Add',
    renderItem,
    renderSearchResult,
    error,
    isActive = true,
    onFocus,
}) {
    return (
        <div>
            <Text fw={600} mb="xs">{label}</Text>
            <Stack gap="sm">
                <TextInput
                    placeholder={placeholder}
                    onChange={(e) => onSearch(e.target.value)}
                    onFocus={onFocus}
                    description={searchDescription}
                    rightSection={isSearching && <Loader size="xs" />}
                />

                {searchResults.length > 0 && isActive && (
                    <Paper p="sm" withBorder style={{ maxHeight: '200px', overflowY: 'auto' }}>
                        <Stack gap="xs">
                            {searchResults.map((item) => renderSearchResult
                                ? renderSearchResult(item, onAdd, buttonLabel)
                                : (
                                    <Group justify="space-between" key={item.id || item}>
                                        <Text size="sm">{item.name || item}</Text>
                                        <Button
                                            size="xs"
                                            variant="light"
                                            onClick={() => onAdd(item)}
                                        >
                                            {buttonLabel}
                                        </Button>
                                    </Group>
                                )
                            )}
                        </Stack>
                    </Paper>
                )}

                {selectedItems.length === 0 ? (
                    <Text size="xs" c="dimmed" fw={500}>{emptyMessage}</Text>
                ) : renderItem ? (
                    <Stack gap="xs">
                        {selectedItems.map(item => renderItem(item, onRemove))}
                    </Stack>
                ) : (
                    <Group gap="xs">
                        {selectedItems.map(item => (
                            <Badge
                                key={item}
                                rightSection={<button
                                    type="button"
                                    onClick={() => onRemove(item)}
                                    style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '0', margin: '0', display: 'flex', alignItems: 'center' }}
                                >
                                    x
                                </button>}
                            >
                                {item}
                            </Badge>
                        ))}
                    </Group>
                )}
                {error && <Text c="red" size="xs">{error}</Text>}
            </Stack>
        </div>
    );
}
