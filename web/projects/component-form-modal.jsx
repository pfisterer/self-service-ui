import { useState } from 'react';
import { Badge, Button, Group, Modal, Stack, Tabs, Text } from '@mantine/core';
import { COLOR } from './util-project.jsx';

// The shell every create/change dialog in this section shares: a modal holding a
// form, its tab strip, the submit error and the Cancel/Submit pair. The dialogs
// differ in their fields, not in their frame — keeping the frame here is what
// makes "request a project" and "new sub-budget" look and behave the same.

// TabLabel marks a tab whose fields failed validation, so a submit does not fail
// silently on a field the user cannot see.
export function TabLabel({ label, hasError }) {
    return (
        <Group gap="xs" wrap="nowrap">
            {label}
            {hasError && <Badge size="xs" color={COLOR.negative} circle>!</Badge>}
        </Group>
    );
}

/**
 * FormTabs renders the tab strip plus its panels.
 *
 * tabs: [{ value, label, hasError?, content }]
 */
export function FormTabs({ value, onChange, tabs }) {
    return (
        <Tabs value={value} onChange={onChange}>
            <Tabs.List mb="md">
                {tabs.map(t => (
                    <Tabs.Tab key={t.value} value={t.value}>
                        <TabLabel label={t.label} hasError={!!t.hasError} />
                    </Tabs.Tab>
                ))}
            </Tabs.List>

            {tabs.map(t => (
                <Tabs.Panel key={t.value} value={t.value}>{t.content}</Tabs.Panel>
            ))}
        </Tabs>
    );
}

/**
 * FormModal is the modal + form frame. `children` are the form's contents
 * (typically a FormTabs plus anything shown below the tabs).
 */
export function FormModal({
    opened, onClose, title, size = 'lg',
    onSubmit, submitting, submitError, submitLabel,
    children,
}) {
    return (
        <Modal opened={opened} onClose={onClose} size={size} title={title}>
            <form onSubmit={onSubmit}>
                <Stack>
                    {children}

                    {submitError && <Text c="red" size="sm">{submitError}</Text>}

                    <Group justify="flex-end" mt="md">
                        <Button variant="default" type="button" onClick={onClose}>Cancel</Button>
                        <Button type="submit" loading={submitting}>{submitLabel}</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
}

/**
 * useFormErrors holds the per-field validation errors. `clear` drops the error
 * of the field being edited — every input did this inline before, which is the
 * kind of repetition that quietly goes out of sync.
 */
export function useFormErrors() {
    const [errors, setErrors] = useState({});

    const clear = (...keys) => setErrors(prev => {
        if (!keys.some(k => prev[k])) return prev;
        const next = { ...prev };
        keys.forEach(k => delete next[k]);
        return next;
    });

    // Clears every error whose key starts with prefix (the "auto_" quota block).
    const clearPrefixed = (prefix) => setErrors(prev => {
        const next = Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith(prefix)));
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });

    return { errors, setErrors, clear, clearPrefixed };
}
