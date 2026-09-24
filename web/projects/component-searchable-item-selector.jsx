import { Badge, Button, Group, Loader, Paper, Stack, Text, TextInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';

export function SearchableItemSelector({
    label,
    selectedItems,
    onAdd,
    onRemove,
    searchResults,
    isSearching,
    onSearch,
    placeholder,
    searchDescription,
    emptyMessage,
    buttonLabel,
    renderItem,
    renderSearchResult,
    error,
    isActive = true,
    onFocus,
}) {
    const { t } = useTranslation();
    const addLabel = buttonLabel ?? t('projects.forms.add');
    return (
        <div>
            <Text fw={600} mb="xs">{label}</Text>
            <Stack gap="sm">
                <TextInput
                    placeholder={placeholder ?? t('projects.itemSelector.placeholder')}
                    onChange={(e) => onSearch(e.target.value)}
                    onFocus={onFocus}
                    description={searchDescription ?? t('projects.itemSelector.searchHint')}
                    rightSection={isSearching && <Loader size="xs" />}
                />

                {searchResults.length > 0 && isActive && (
                    <Paper p="sm" withBorder style={{ maxHeight: '200px', overflowY: 'auto' }}>
                        <Stack gap="xs">
                            {searchResults.map((item) => renderSearchResult
                                ? renderSearchResult(item, onAdd, addLabel)
                                : (
                                    <Group justify="space-between" key={item.id || item}>
                                        <Text size="sm">{item.name || item}</Text>
                                        <Button
                                            size="xs"
                                            variant="light"
                                            onClick={() => onAdd(item)}
                                        >
                                            {addLabel}
                                        </Button>
                                    </Group>
                                )
                            )}
                        </Stack>
                    </Paper>
                )}

                {selectedItems.length === 0 ? (
                    <Text size="xs" c="dimmed" fw={500}>{emptyMessage ?? t('projects.itemSelector.empty')}</Text>
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
                                    aria-label={t('projects.forms.remove')}
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
