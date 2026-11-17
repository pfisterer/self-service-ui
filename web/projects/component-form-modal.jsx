import { Badge, Box, Button, Group, Modal, NavLink, Select, Stack, Tabs, Text, Tooltip } from '@mantine/core';
import { useElementSize, useMediaQuery } from '@mantine/hooks';
import { useTranslation } from 'react-i18next';
import { BarChart3, CheckCheck, Gauge, HardDrive, History, Hourglass, Info, KeyRound, Layers, ListChecks, Settings2, SlidersHorizontal, Tags, Timer, Users, UsersRound, Zap } from 'lucide-react';
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

// tabWithError names the first tab that holds a failed field, so a submit can
// jump there. `fieldsByTab` maps a tab to a test of a field key: the tabs are
// tried in the order given.
export function tabWithError(fieldsByTab, errors) {
    return Object.keys(fieldsByTab).find(tab => Object.keys(errors || {}).some(fieldsByTab[tab])) ?? null;
}

// tabHasError says whether one tab holds a failed field.
export function tabHasError(fieldsByTab, tab, errors) {
    const test = fieldsByTab[tab];
    return !!test && Object.keys(errors || {}).some(test);
}

/**
 * FormTabs renders the tab strip plus its panels.
 *
 * tabs: [{ value, label, hasError?, content }]
 */
// TAB_ICONS gives every tab of the project and budget dialogs its symbol, by the tab's value (resources-<kind> counts as resources), so the strip reads at a glance and looks the same in every dialog.
const TAB_ICONS = {
    details: Info,
    resources: Gauge,
    workspaces: Settings2,
    members: Users,
    attributes: Tags,
    access: KeyRound,
    'auto-approve': CheckCheck,
    usage: BarChart3,
    history: History,
    // The workspace settings of a project, one entry each in FormSections.
    'workspaces-environment': Layers,
    'workspaces-groups': UsersRound,
    'workspaces-storage': HardDrive,
    'workspaces-limits': SlidersHorizontal,
    'workspaces-jobs': ListChecks,
    'workspaces-release': Timer,
};

function tabIcon(value) {
    const Icon = TAB_ICONS[value] ?? TAB_ICONS[String(value).split('-')[0]];
    return Icon ? <Icon size={16} /> : null;
}

export function FormTabs({ value, onChange, tabs }) {
    return (
        <Tabs value={value} onChange={onChange}>
            {/* Kept in view under the dialog's header while the content
                scrolls, spanning the dialog's width over what passes behind. */}
            <Tabs.List mb="md" style={STICKY_TABS}>
                {tabs.map(t => (
                    <Tabs.Tab key={t.value} value={t.value} leftSection={tabIcon(t.value)} fw={500}>
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

// SECTION_MARKS are the marks a group of FormSections may carry next to its heading: how a change of its entries takes effect.
const SECTION_MARKS = {
    approval: { Icon: Hourglass, color: 'var(--mantine-color-orange-7)', text: 'formSections.markApproval' },
    instant: { Icon: Zap, color: 'var(--mantine-color-green-7)', text: 'formSections.markInstant' },
};

// SectionMark is a group's mark, its meaning on hover.
function SectionMark({ mark }) {
    const { t } = useTranslation();
    const m = SECTION_MARKS[mark];
    if (!m) return null;
    return (
        <Tooltip label={t(m.text)} withArrow multiline maw={260}>
            <Box component="span" aria-label={t(m.text)} style={{ display: 'inline-flex', color: m.color, cursor: 'help' }}>
                <m.Icon size={12} />
            </Box>
        </Tooltip>
    );
}

// NAV_WIDTH is the width of FormSections' navigation, wide enough for "Rückgabezeiten" with its icon and marks.
const NAV_WIDTH = '13.5rem';

/**
 * FormSections is FormTabs for a dialog with more parts than a tab strip holds: a navigation on the left with the entries in groups, the active entry's content on the right, and an optional header above both. Below sm the navigation is a select above the content.
 *
 * groups: [{ key, label, mark?: 'approval'|'instant', items: [{ value, label, hasError?, changed?, content }] }]; a group without items is left out.
 *
 * Every content stays mounted, only hidden, as with tabs: the form's fields and the queries in them do not start over when an entry is left. The entries are tabs to assistive technology (role="tab"), named by their label.
 */
export function FormSections({ value, onChange, header = null, groups }) {
    const { t } = useTranslation();
    const narrow = useMediaQuery('(max-width: 48em)');
    const { ref: headerRef, height: headerHeight } = useElementSize();
    const shown = (groups || []).filter(g => g.items?.length > 0);
    const items = shown.flatMap(g => g.items);
    // The navigation and the header stay in view under the dialog's title while the content scrolls.
    // The header's own height is measured without its padding and line (about 2 × 10 px + 1 px), plus a gap.
    const navTop = HEADER_HEIGHT + (header ? headerHeight + 33 : 0);
    return (
        <div>
            {header && <div style={STICKY_HEADER}><div ref={headerRef}>{header}</div></div>}
            {narrow && (
                <Select mb="md" allowDeselect={false} aria-label={t('formSections.navigation')} value={value} onChange={v => v && onChange(v)}
                    data={shown.map(g => ({ group: g.label, items: g.items.map(i => ({ value: i.value, label: i.hasError ? `${i.label} (!)` : i.label })) }))} />
            )}
            <div style={{ display: 'flex', gap: 'var(--mantine-spacing-lg)', alignItems: 'flex-start' }}>
                {!narrow && (
                    <nav role="tablist" aria-orientation="vertical" aria-label={t('formSections.navigation')}
                        style={{ width: NAV_WIDTH, flexShrink: 0, position: 'sticky', top: navTop, zIndex: 1 }}>
                        <Stack gap="sm">
                            {shown.map(g => (
                                <div key={g.key}>
                                    <Group gap={6} wrap="nowrap" px="xs" mb={4}>
                                        <Text size="xs" c="dimmed" fw={700} tt="uppercase" style={{ letterSpacing: '0.04em' }}>{g.label}</Text>
                                        <SectionMark mark={g.mark} />
                                    </Group>
                                    {g.items.map(i => (
                                        <NavLink key={i.value} component="button" type="button" role="tab" aria-selected={i.value === value}
                                            active={i.value === value} onClick={() => onChange(i.value)} leftSection={tabIcon(i.value)} fw={500}
                                            style={{ borderRadius: 'var(--mantine-radius-sm)' }}
                                            label={<TabLabel label={i.label} hasError={!!i.hasError} />}
                                            rightSection={i.changed ? <ChangedDot /> : null} />
                                    ))}
                                </div>
                            ))}
                        </Stack>
                    </nav>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                    {items.map(i => (
                        <div key={i.value} role="tabpanel" style={i.value === value ? undefined : { display: 'none' }}>{i.content}</div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ChangedDot marks an entry of FormSections whose fields were changed and not yet saved.
function ChangedDot() {
    const { t } = useTranslation();
    return (
        <Tooltip label={t('formSections.changed')} withArrow>
            <Box aria-hidden w={8} h={8} style={{ borderRadius: '50%', background: 'var(--mantine-color-blue-6)' }} />
        </Tooltip>
    );
}

// The dialog header (Mantine keeps it at the top) is one line high when its
// title does not wrap — DIALOG_STYLES sees to that — and the tab strip stays
// right below it.
const HEADER_HEIGHT = 60;
const STICKY_TABS = {
    position: 'sticky',
    top: HEADER_HEIGHT,
    zIndex: 3,
    background: 'var(--mantine-color-body)',
    margin: '0 calc(-1 * var(--mb-padding, var(--mantine-spacing-md)))',
    paddingInline: 'var(--mb-padding, var(--mantine-spacing-md))',
};

// STICKY_HEADER is FormSections' header, kept under the dialog's title like the tab strip, with a line below it.
const STICKY_HEADER = {
    ...STICKY_TABS,
    paddingBlock: 'var(--mantine-spacing-xs)',
    marginBottom: 'var(--mantine-spacing-md)',
    borderBottom: '1px solid var(--mantine-color-default-border)',
};

// DIALOG_SIZE is the width of the tabbed project and budget dialogs: wide enough for a quota grid, a member row with its role picker and the Lab/KI workspace settings side by side, capped by the viewport on small screens.
export const DIALOG_SIZE = '72rem';

// DIALOG_STYLES keeps a dialog's title on one line, cut with an ellipsis, so the
// header has the height the sticky tabs expect.
export const DIALOG_STYLES = {
    title: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 },
};

// DialogFooter is a dialog's button row, kept in view: it sticks to the bottom
// of the scrolling dialog, so Save and Cancel never have to be scrolled to.
// It spans the dialog's width over the content that scrolls behind it.
// note: what pressing the button will do (e.g. "takes effect right away"), on the left of the same row, so it is read right where the decision is made.
export function DialogFooter({ children, error, note = null }) {
    return (
        <div style={{
            position: 'sticky',
            bottom: 0,
            margin: '0 calc(-1 * var(--mb-padding, var(--mantine-spacing-md))) calc(-1 * var(--mb-padding, var(--mantine-spacing-md)))',
            padding: 'var(--mantine-spacing-sm) var(--mb-padding, var(--mantine-spacing-md))',
            background: 'var(--mantine-color-body)',
            borderTop: '1px solid var(--mantine-color-default-border)',
            zIndex: 2,
        }}>
            {error && <Text c="red" size="sm" mb="xs">{error}</Text>}
            <Group justify="space-between" wrap="nowrap" align="center" gap="md">
                <div style={{ flex: 1, minWidth: 0 }}>{note}</div>
                <Group gap="sm" wrap="nowrap" style={{ flexShrink: 0 }}>{children}</Group>
            </Group>
        </div>
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
 *
 * `zIndex` and `closeOnEscape` go to the Modal: a dialog opened over another one (raising a budget from the project dialog) lies above it, and the one below does not close on the Escape meant for the one above.
 */
export function FormModal({
    opened, onClose, title, size = 'lg',
    onSubmit, submitting, submitError, submitLabel, submitColor, submitDisabled = false,
    secondary = null,
    note = null,
    zIndex,
    closeOnEscape = true,
    children,
}) {
    const { t } = useTranslation();
    return (
        <Modal opened={opened} onClose={onClose} size={size} title={title} styles={DIALOG_STYLES} zIndex={zIndex} closeOnEscape={closeOnEscape}>
            {/* noValidate: these forms live in tabs, so a `required` field on an
                inactive tab is display:none. The browser then refuses to submit
                AND cannot focus the offender to say why ("An invalid form control
                is not focusable") — the button simply does nothing. Every dialog
                validates in its own submit handler and marks the offending tab,
                so native validation only had this failure mode to contribute. */}
            <form onSubmit={onSubmit} noValidate>
                <Stack>
                    {children}

                    <DialogFooter error={submitError} note={note}>
                        <Button variant="default" type="button" onClick={onClose}>{t('projects.actions.cancel')}</Button>
                        {/* A second way to finish, e.g. reject next to approve:
                            { label, color, onClick, loading, disabled }. */}
                        {secondary && (
                            <Button type="button" variant="light" color={secondary.color} loading={secondary.loading}
                                disabled={secondary.disabled} onClick={secondary.onClick}>{secondary.label}</Button>
                        )}
                        <Button type="submit" color={submitColor} loading={submitting} disabled={submitDisabled}>{submitLabel}</Button>
                    </DialogFooter>
                </Stack>
            </form>
        </Modal>
    );
}
