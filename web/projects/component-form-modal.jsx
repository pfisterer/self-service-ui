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
 * FormModal is the modal + form frame for EVERY dialog in this section — the
 * two big tabbed forms and the small single-purpose ones (approve, reject,
 * move, transfer, adopt) alike. Those five used to build the same frame by
 * hand: a Modal, a form, a Stack, an error line and a Cancel/Submit pair,
 * about 35 identical lines each, differing only in their fields.
 *
 * `submitting`/`submitError` are primitives rather than a mutation object so
 * the component stays dumb; callers pass `m.isPending` and
 * `formatError(m.error)`.
 */
export function FormModal({
    opened, onClose, title, size = 'lg',
    onSubmit, submitting, submitError, submitLabel, submitColor,
    children,
}) {
    return (
        <Modal opened={opened} onClose={onClose} size={size} title={title}>
            {/* noValidate: these forms live in tabs, so a `required` field on an
                inactive tab is display:none. The browser then refuses to submit
                AND cannot focus the offender to say why ("An invalid form control
                is not focusable") — the button simply does nothing. Every dialog
                validates in its own submit handler and marks the offending tab,
                so native validation only had this failure mode to contribute. */}
            <form onSubmit={onSubmit} noValidate>
                <Stack>
                    {children}

                    {submitError && <Text c="red" size="sm">{submitError}</Text>}

                    <Group justify="flex-end" mt="md">
                        <Button variant="default" type="button" onClick={onClose}>Cancel</Button>
                        <Button type="submit" color={submitColor} loading={submitting}>{submitLabel}</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
}
