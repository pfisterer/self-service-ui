import { useState } from 'react';
import { Archive, Calendar, Check, CircleCheck, CircleHelp, CirclePlus, CircleX, Clock, CloudDownload, Info, Link2, LogOut, Trash2, User, Users } from 'lucide-react';
import { useClipboard } from '@mantine/hooks';
import { DatePickerInput } from '@mantine/dates';
import { ActionIcon, Anchor, Badge, Box, Button, Checkbox, Group, NumberInput, Popover, Progress, Select, Stack, Table, Text, Tooltip } from '@mantine/core';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import relativeTime from 'dayjs/plugin/relativeTime';
import { COLOR, UNLIMITED_QUOTA, formatRoleLabel, isAvailability, limitDelta, nodeChanges, resourceBarSegments, statusDescription, statusLabel, statusStyle } from './util-project.jsx';
import { tokenDisplay, tokenEmail, useTokenLabels } from './token-labels.jsx';
import { formatDate } from '../format-date.js';

dayjs.extend(relativeTime);

// ── Facts ───────────────────────────────────────────────────────────────────

// InfoPopover is the (i) after a control whose label cannot say everything:
// hovering shows the longer explanation, so the label stays one line. A tap
// opens it too — a touch screen has no hover — and a tap elsewhere closes it.
// The click only opens: as a toggle it would close what hovering just opened.
// `plain` hands the content over as it is, for content that is not a sentence
// (a small table, say) and must not sit inside a paragraph.
export function InfoPopover({ label, children, width = 300, plain = false }) {
    const [opened, setOpened] = useState(false);
    return (
        <Popover width={width} position="bottom-start" withArrow shadow="md"
            opened={opened} onChange={setOpened}>
            <Popover.Target>
                <ActionIcon variant="subtle" color="gray" size="sm" aria-label={label}
                    onMouseEnter={() => setOpened(true)} onMouseLeave={() => setOpened(false)}
                    onClick={() => setOpened(true)}>
                    <Info size="14" />
                </ActionIcon>
            </Popover.Target>
            <Popover.Dropdown>
                {plain ? children : <Text size="xs">{children}</Text>}
            </Popover.Dropdown>
        </Popover>
    );
}

// FactRow is the single shape in which a card states a fact: a dimmed label of
// fixed width, the value beside it. Every card uses it for every fact, so the
// eye finds "who owns this" or "when does it end" in the same place on a
// project and on a budget — instead of one card using headings, the other
// label/value rows and both mixing in badges.
//
// `hint` is a second, smaller line under the value: the place for the sentence
// that explains what the value means to someone seeing it for the first time.
// CopyLinkButton copies a link to a node — something to send someone, who then
// lands on that node in their own tree.
export function CopyLinkButton({ link }) {
    const { t } = useTranslation();
    const clipboard = useClipboard({ timeout: 1500 });
    const label = clipboard.copied ? t('projects.actions.linkCopied') : t('projects.actions.copyLink');
    return (
        <Tooltip label={label} withArrow>
            <ActionIcon variant="subtle" color="gray" size="sm" aria-label={label} onClick={() => clipboard.copy(link)}>
                {clipboard.copied ? <Check size="14" /> : <Link2 size="14" />}
            </ActionIcon>
        </Tooltip>
    );
}

export function FactRow({ label, hint, children }) {
    return (
        <Group gap="xs" wrap="nowrap" align="flex-start">
            <Text size="xs" c="dimmed" style={{ minWidth: 86, paddingTop: 1 }}>{label}</Text>
            <div style={{ flex: 1, minWidth: 0 }}>
                {typeof children === 'string' ? <Text size="xs">{children}</Text> : children}
                {hint && <Text size="xs" c="dimmed" mt="2">{hint}</Text>}
            </div>
        </Group>
    );
}

// ── Badges ──────────────────────────────────────────────────────────────────

// NodeStatusBadge renders the status of a node in the one shared vocabulary,
// and explains it on hover. The label is a word we invented for a state the
// reader did not choose; the tooltip is where it says what that means for them.
//
// `full` keeps the label whole: in a table column a badge would otherwise be
// shrunk to an ellipsis, because Mantine clips the label and the column then
// sizes to the clipped width.
//
// `icon` draws it for tight spaces: one icon in the status's colour, label and
// explanation on hover. `deleting` (with the reconciler's `purge` progress)
// shows a project being deleted instead of its status, in either form.
const STATUS_ICONS = {
    pending: Clock,
    approved: CircleCheck,
    change_pending: CirclePlus,
    rejected: CircleX,
    released: LogOut,
    archived: Archive,
    imported: CloudDownload,
};

export function NodeStatusBadge({ status, size = 'sm', provisioning = false, full = false, icon = false, deleting = false, purge = null }) {
    const { t } = useTranslation();
    if (icon) {
        const Icon = deleting ? Trash2 : (STATUS_ICONS[status] ?? CircleHelp);
        const color = deleting ? COLOR.negative : statusStyle(status, provisioning).color;
        const title = deleting ? t('projects.projectCard.deleting') : statusLabel(t, status, provisioning);
        const detail = deleting
            ? (purge ? purgeLines(t, purge).join(' ') : t('projects.projectCard.deletingHint'))
            : statusDescription(t, status, provisioning);
        return (
            <Tooltip label={<><b>{title}</b>{detail ? <><br />{detail}</> : null}</>} multiline w={280} withArrow>
                <Box component="span" aria-label={title}
                    style={{ display: 'inline-flex', cursor: 'help', color: `var(--mantine-color-${color}-6)` }}>
                    <Icon size={size === 'xs' ? 14 : 16} />
                </Box>
            </Tooltip>
        );
    }
    if (deleting) return <DeletingBadge size={size} purge={purge} />;
    const style = statusStyle(status, provisioning);
    const badge = (
        <Badge size={size} color={style.color} variant={style.variant}
            styles={full ? { root: { maxWidth: 'none', flexShrink: 0 }, label: { overflow: 'visible' } } : undefined}>
            {statusLabel(t, status, provisioning)}
        </Badge>
    );
    const description = statusDescription(t, status, provisioning);
    if (!description) return badge;
    return (
        <Tooltip label={description} multiline w={300} withArrow>
            <span style={{ cursor: 'help' }}>{badge}</span>
        </Tooltip>
    );
}

// PersonBadge names a person and lets you write to them: everything the UI says
// about who is responsible ends in a question ("can I ask them?"), and the
// address is right there. A group has no mailbox, so it stays plain text.
//
// Text with a small icon rather than an outlined pill: a card names half a
// dozen people and groups, and as many pills made it restless without saying
// anything more. The icon tells a person from a group, the link appears on
// hover.
export function PersonBadge({ email, children, size = 'sm' }) {
    const label = children ?? email;
    const Icon = email ? User : Users;
    const content = (
        <Group component="span" gap={4} wrap="nowrap" style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
            <Icon size={size === 'xs' ? 12 : 14} style={{ flexShrink: 0, color: 'var(--mantine-color-gray-6)' }} />
            <Text span size={size}>{label}</Text>
        </Group>
    );
    if (!email) return content;
    return (
        <Anchor href={`mailto:${email}`} title={`Write to ${email}`} c="inherit" underline="hover" size={size}>
            {content}
        </Anchor>
    );
}

// TokenBadgeList renders a list of user:/group: tokens as badges, showing the
// group's display name next to the token where the directory knows one.
export function TokenBadgeList({ tokens, emptyMessage = null, size = 'sm' }) {
    const labels = useTokenLabels(tokens);
    if (!tokens || tokens.length === 0) {
        return emptyMessage
            ? <Text size="xs" c="dimmed">{emptyMessage}</Text>
            : null;
    }
    return (
        <Group gap="md" rowGap={2} wrap="wrap">
            {tokens.map(token => (
                <PersonBadge key={token} email={tokenEmail(token)} size={size}>
                    {tokenDisplay(token, labels[token])}
                </PersonBadge>
            ))}
        </Group>
    );
}

// QuotaBadges renders a quota map as one badge per resource ("10 vCPUs" …).
export function QuotaBadges({ resources, quota, size = 'sm' }) {
    if (!quota || !resources) return null;
    return (
        <Group gap="xs" wrap="wrap">
            {resources.map(r => {
                const value = quota[r.id] ?? 0;
                // An availability is granted or not: its name alone when granted,
                // nothing when withheld — "0 DHBW IPv4 network" reads like an amount.
                if (isAvailability(r)) {
                    return value === 1
                        ? <Badge key={r.id} size={size} variant="outline" color={COLOR.identity}>{r.name}</Badge>
                        : null;
                }
                const display = value === UNLIMITED_QUOTA ? '∞' : (r.unit ? `${value} ${r.unit}` : value);
                return <Badge key={r.id} size={size} variant="outline" color={COLOR.identity}>{display} {r.name}</Badge>;
            })}
        </Group>
    );
}

// UserRoleBadgeList renders authorized users with their OpenStack role.
export function UserRoleBadgeList({ users, label, labelColor, size = 'sm' }) {
    if (!users || users.length === 0) return null;
    return (
        <div>
            {label && <Text size="xs" c={labelColor} fw={600} mb="xs">{label}</Text>}
            <Group gap="md" rowGap={2} wrap="wrap">
                {users.map(u => (
                    <PersonBadge key={`${u.token}:${u.openstack_role}`} email={tokenEmail(u.token)} size={size}>
                        {u.token} <Text span inherit c="dimmed">({formatRoleLabel(u.openstack_role)})</Text>
                    </PersonBadge>
                ))}
            </Group>
        </div>
    );
}

// usageText writes a bar's figures: what is committed, what is waiting on a
// decision, and what a grant being looked at would add — "4 (+8 pending) / 20".
// One string per case rather than three fragments glued together, because the
// parenthesis and the order of the parts differ between languages.
function usageText(t, approved, changePending, incoming, limit, retired = 0) {
    const parts = [
        retired > 0 ? t('projects.usage.retired', { count: retired }) : null,
        changePending > 0 ? t('projects.usage.pending', { count: changePending }) : null,
        incoming > 0 ? t('projects.usage.incoming', { count: incoming }) : null,
    ].filter(Boolean);
    return parts.length > 0
        ? t('projects.usage.ofLimitWith', { used: approved, extra: parts.join(', '), limit })
        : t('projects.usage.ofLimit', { used: approved, limit });
}

// ── Usage bars ──────────────────────────────────────────────────────────────

// ResourceBar renders one resource row with a usage progress bar.
// approved and changePending are plain numbers (already extracted by the caller).
// retired is the part of approved that released and archived projects still
// hold — counted, because the budget is charged for it, and named, because
// otherwise a full bar over a list of given-up projects makes no sense.
// limit may be UNLIMITED_QUOTA (-1) to indicate no cap.
// incoming (optional) adds a highlighted segment previewing a pending grant's impact.
export function ResourceBar({ resource, limit, approved = 0, changePending = 0, incoming = 0, retired = 0 }) {
    const { t } = useTranslation();
    const label = resource.unit ? `${resource.name} (${resource.unit})` : resource.name;
    const unlimited = limit === UNLIMITED_QUOTA;

    if (unlimited) {
        return (
            <Group justify="space-between">
                <Text size="xs">{label}</Text>
                <Text size="xs" c="dimmed">
                    {usageText(t, approved, changePending, incoming, '∞', retired)}
                </Text>
            </Group>
        );
    }

    const { approvedPct, pendingPct, incomingPct, totalPct } =
        resourceBarSegments(limit, { approved, changePending, incoming });
    // Two steps, not a traffic light: the bar is neutral until the budget is
    // nearly full, and only then does it become a warning. A middle colour would
    // add a hue that means nothing anywhere else in the UI.
    const color = totalPct >= 90 ? COLOR.negative : COLOR.info;

    return (
        <Stack gap="2">
            <Group justify="space-between">
                <Text size="xs">{label}</Text>
                <Text size="xs" c="dimmed">
                    {usageText(t, approved, changePending, incoming, limit, retired)}
                </Text>
            </Group>
            <Progress.Root size="sm">
                <Progress.Section value={approvedPct} color={color} />
                {changePending > 0 && <Progress.Section value={pendingPct} color={COLOR.attention} striped animated />}
                {incoming > 0 && <Progress.Section value={incomingPct} color={COLOR.positive} striped animated />}
            </Progress.Root>
        </Stack>
    );
}

// NodeUsageBars renders the full set of resource bars for a budget node, taken
// from the node's server-computed usage rollup (usage[status].limit per status).
// incomingQuota (optional) previews the impact of granting an additional request.
//
// Availabilities do not get a bar. A progress track needs a quantity to be a
// fraction OF, and there is none: a granted network is not "1 of 1 used", it is
// simply there. They are drawn as badges below the bars instead, and only the
// granted ones — a row of greyed-out badges for everything withheld says nothing
// and grows with the catalogue.
export function NodeUsageBars({ resources, node, incomingQuota = null }) {
    if (!resources || !node) return null;
    const usage = node.usage ?? {};
    const quantities = resources.filter(r => !isAvailability(r));
    const granted = resources.filter(r => isAvailability(r) && node.limit?.[r.id] === 1);

    return (
        <Stack gap="xs">
            {quantities.map(r => {
                // Only what the deployment charges shows up under these keys.
                const retired = (usage.released?.limit?.[r.id] ?? 0) + (usage.archived?.limit?.[r.id] ?? 0);
                return (
                    <ResourceBar
                        key={r.id}
                        resource={r}
                        limit={node.limit?.[r.id] ?? 0}
                        approved={(usage.approved?.limit?.[r.id] ?? 0) + retired}
                        retired={retired}
                        changePending={usage.change_pending?.limit?.[r.id] ?? 0}
                        incoming={incomingQuota?.[r.id] ?? 0}
                    />
                );
            })}
            <AvailabilityBadges resources={granted} />
        </Stack>
    );
}

// AvailabilityBadges lists what a node may use, as opposed to how much of it.
export function AvailabilityBadges({ resources }) {
    if (!resources?.length) return null;
    return (
        <Group gap="4" wrap="wrap">
            {resources.map(r => (
                <Badge key={r.id} size="xs" variant="light" color="gray">{r.name}</Badge>
            ))}
        </Group>
    );
}

// ── Change diff ─────────────────────────────────────────────────────────────

// NodeChangesDiff shows a before/after table for limit and termination date
// plus added/removed authorized users. Renders nothing when nothing changed.
export function NodeChangesDiff({ resources, limitFrom, limitTo, dateFrom, dateTo, usersFrom, usersTo, label }) {
    const { t } = useTranslation();
    const heading = label ?? t('projects.changes.proposed');
    const { hasLimitChange, hasDateChange, added, removed, roleChanged, hasUserChanges } =
        nodeChanges({ resources, limitFrom, limitTo, dateFrom, dateTo, usersFrom, usersTo });

    if (!hasLimitChange && !hasDateChange && !hasUserChanges) return null;

    const diff = (id) => {
        const { before, after, d } = limitDelta(limitFrom, limitTo, id);
        return { before, after, d, color: d > 0 ? 'green' : d < 0 ? 'red' : 'gray' };
    };

    return (
        <Box mt="md">
            <Text fw={600} size="sm" mb="xs">{heading}</Text>

            {(hasLimitChange || hasDateChange) && (
                <Table size="xs" mb={hasUserChanges ? 'md' : 0}>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>{t('projects.changes.resource')}</Table.Th>
                            <Table.Th>{t('projects.changes.before')}</Table.Th>
                            <Table.Th>{t('projects.changes.after')}</Table.Th>
                            <Table.Th>{t('projects.changes.change')}</Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {hasLimitChange && resources.map(r => {
                            const d = diff(r.id);
                            return (
                                <Table.Tr key={r.id}>
                                    <Table.Td>{r.unit ? `${r.name} (${r.unit})` : r.name}</Table.Td>
                                    <Table.Td>{d.before}</Table.Td>
                                    <Table.Td>{d.after}</Table.Td>
                                    <Table.Td c={d.color}>{d.d > 0 ? '+' : ''}{d.d}</Table.Td>
                                </Table.Tr>
                            );
                        })}
                        {hasDateChange && (
                            <Table.Tr>
                                <Table.Td>{t('projects.changes.endDate')}</Table.Td>
                                <Table.Td>{formatDate(dateFrom)}</Table.Td>
                                <Table.Td>{formatDate(dateTo)}</Table.Td>
                                {dateFrom ? (
                                    <Table.Td c={new Date(dateTo) - new Date(dateFrom) >= 0 ? 'green' : 'red'}>
                                        {new Date(dateTo) > new Date(dateFrom) ? '+' : ''}{dayjs(dateTo).from(dayjs(dateFrom), true)}
                                    </Table.Td>
                                ) : <Table.Td />}
                            </Table.Tr>
                        )}
                    </Table.Tbody>
                </Table>
            )}

            {hasUserChanges && (
                <Stack gap="xs">
                    <UserRoleBadgeList users={added} label={t('projects.changes.added')} />
                    <UserRoleBadgeList users={removed} label={t('projects.changes.removed')} labelColor="dimmed" />
                    {roleChanged.length > 0 && (
                        <div>
                            <Text size="xs" c="dimmed" fw={600} mb="xs">{t('projects.changes.rolesChanged')}</Text>
                            <Stack gap="xs">
                                {roleChanged.map(u => (
                                    <Group key={u.token} gap="xs" align="center">
                                        <Text size="sm">{u.token}:</Text>
                                        <Badge size="sm" variant="outline" color="gray">
                                            {formatRoleLabel(u.previous_role)}
                                        </Badge>
                                        <Text size="xs" c="dimmed">→</Text>
                                        <Badge size="sm" variant="outline" color="dark">
                                            {formatRoleLabel(u.openstack_role)}
                                        </Badge>
                                    </Group>
                                ))}
                            </Stack>
                        </div>
                    )}
                </Stack>
            )}
        </Box>
    );
}

// ── Durations and end dates ─────────────────────────────────────────────────

// A month is 30 days here, as everywhere a duration turns into a date: "6
// months" from today is 180 days, not "the same day in April".
const DAYS_PER_UNIT = { days: 1, weeks: 7, months: 30 };
const DAY_MS = 24 * 60 * 60 * 1000;
// The terms people actually hand out: a quarter, a semester, a year.
const SHORTCUT_MONTHS = [3, 6, 12];

// durationUnitFor picks the unit a span reads best in: the one it divides into
// exactly ("6 months", not "26 weeks"), else the one with the fewest digits.
export function durationUnitFor(days) {
    if (days >= 30 && days % 30 === 0) return 'months';
    if (days >= 14 && days % 7 === 0) return 'weeks';
    return days < 60 ? 'days' : days < 365 ? 'weeks' : 'months';
}

// DurationInput: a span of days as a number and a unit, plus shortcuts for
// three, six and twelve months. Stored in days whatever the unit shows.
//
// The unit the user PICKED sticks; null means "whichever reads best". Deriving
// it from the value on every render fights the user, because "Weeks" + 4 is 28
// days and a derived unit would snap that straight back to "Days" — the
// number jumped and the unit reset on every keystroke.
//
// `leading` renders in the same row before the number (the date field of
// TerminationDatePicker), so both stay bottom-aligned with the shortcuts below.
// `maxDays` caps what can be entered and hides the shortcuts beyond it.
export function DurationInput({ days, onChange, maxDays = null, disabled = false, leading = null, error }) {
    const { t } = useTranslation();
    const [pickedUnit, setPickedUnit] = useState(null);
    const unit = pickedUnit ?? (days ? durationUnitFor(days) : 'days');
    // No span means no number: a number standing next to an empty date field
    // claims something that is not stored anywhere.
    const value = days ? Math.round(days / DAYS_PER_UNIT[unit]) : null;

    const emit = (v, u) => {
        if (!v || v <= 0) return;
        const span = v * DAYS_PER_UNIT[u];
        onChange?.(maxDays && span > maxDays ? maxDays : span);
    };
    const shortcuts = SHORTCUT_MONTHS.filter(m => !maxDays || m * DAYS_PER_UNIT.months <= maxDays);

    return (
        <Stack gap={6}>
            <Group gap="xs" align="flex-start">
                {leading}
                <NumberInput size="xs" w={110} label={t('projects.endDate.duration')} min={1}
                    max={maxDays ? Math.max(1, Math.floor(maxDays / DAYS_PER_UNIT[unit])) : undefined}
                    value={value ?? ''}
                    placeholder="—"
                    disabled={disabled}
                    error={error}
                    onChange={(v) => emit(v, unit)} />
                <Select size="xs" label={t('projects.endDate.unit')} w={110} value={unit} allowDeselect={false}
                    data={['days', 'weeks', 'months'].map(u => ({ value: u, label: t(`projects.endDate.${u}`) }))}
                    disabled={disabled}
                    onChange={(u) => { setPickedUnit(u); emit(value, u); }} />
            </Group>
            {shortcuts.length > 0 && (
                <Group gap="xs">
                    {shortcuts.map(m => (
                        <Button key={m} size="compact-xs" variant={days === m * DAYS_PER_UNIT.months ? 'light' : 'subtle'}
                            disabled={disabled}
                            onClick={() => { setPickedUnit('months'); onChange?.(m * DAYS_PER_UNIT.months); }}>
                            {t('projects.endDate.monthsShortcut', { count: m })}
                        </Button>
                    ))}
                </Group>
            )}
        </Stack>
    );
}

// pickedDate turns what the calendar reports into the Date every form expects.
// Mantine's date pickers report a "YYYY-MM-DD" string since v8, while the
// duration fields and the forms' initial values work with Date objects — a
// string slipping through failed only when someone clicked a day, in
// termination_date.toISOString(). Parsed as local midnight, which is what the
// picker meant by that day.
export function pickedDate(value) {
    if (value === null || value === undefined || value === '') return null;
    return value instanceof Date ? value : dayjs(value).toDate();
}

// TerminationDatePicker: a date and a duration (DurationInput) kept in sync —
// beginners think in durations, admins in dates.
//
// `optional` adds the switch that decides whether there is an end date at all.
// Without it the duration read "90 Days" next to an empty date field, which is
// two contradicting answers to the same question. `optionalHint` says what
// "no end" means for the thing at hand.
//
// `maxDate` is the latest allowed end — a budget's end, or the longest term a
// budget gives its projects: the calendar, the duration and the "set an end
// date" default all stop there, and the switch cannot be turned off.
// `maxHint` says why; without it the reason is a budget's end.
const DEFAULT_DURATION_DAYS = 90;

export function TerminationDatePicker({ value, onChange, error, label, optional = false, optionalHint, maxDate = null, maxHint }) {
    const { t } = useTranslation();
    const heading = label ?? t('projects.endDate.label');
    const currentDate = value;

    const daysUntil = currentDate
        ? Math.max(1, Math.ceil((new Date(currentDate) - new Date()) / DAY_MS))
        : null;
    const latest = maxDate ? new Date(maxDate) : null;
    const maxDays = latest ? Math.max(1, Math.floor((latest - new Date()) / DAY_MS)) : null;
    const dateFromDuration = (days) => {
        const date = new Date(Date.now() + days * DAY_MS);
        return latest && date > latest ? latest : date;
    };

    const hasEndDate = !optional || !!latest || !!currentDate;

    const fields = (
        <DurationInput
            days={daysUntil}
            maxDays={maxDays}
            disabled={!hasEndDate}
            onChange={(days) => onChange?.(dateFromDuration(days))}
            leading={
                <DatePickerInput style={{ flex: 1 }} size="xs" placeholder={t('projects.endDate.pick')} leftSection={<Calendar size="14" />}
                    valueFormat={t('dates.pickerFormat')}
                    label={currentDate
                        ? t('projects.endDate.dateWithRelative', { relative: dayjs(currentDate).fromNow() })
                        : t('projects.endDate.date')}
                    value={currentDate}
                    onChange={(v) => onChange?.(pickedDate(v))}
                    minDate={new Date()}
                    maxDate={latest ?? undefined}
                    disabled={!hasEndDate}
                    error={error}
                />
            }
        />
    );

    return (
        <Stack gap="xs">
            <Text fw={600} size="sm">{heading}</Text>

            {optional && !latest ? (
                <>
                    {/* Ticking the box writes a real date right away, so the fields
                        below never describe something that is not stored. */}
                    <Checkbox
                        label={t('projects.endDate.setEndDate')}
                        description={optionalHint ?? t('projects.endDate.setEndDateHint')}
                        checked={hasEndDate}
                        onChange={e => onChange?.(e.currentTarget.checked
                            ? dateFromDuration(DEFAULT_DURATION_DAYS)
                            : null)}
                    />
                    <Box
                        pl="xl"
                        ml="xs"
                        style={{
                            opacity: hasEndDate ? 1 : 0.45,
                            transition: 'opacity 150ms ease',
                        }}
                    >
                        {fields}
                    </Box>
                </>
            ) : fields}
            {latest && (
                <Text size="xs" c="dimmed">
                    {maxHint ?? t('projects.endDate.atMost', { date: formatDate(latest) })}
                </Text>
            )}
        </Stack>
    );
}

// MaxTermInput: the longest a project below a budget may run at a time, or no
// such limit. `bound` is the limit of the budget above: this one may be
// shorter, never longer or absent, so the switch is locked on beneath one.
export function MaxTermInput({ value, onChange, bound = null }) {
    const { t } = useTranslation();
    const limited = value !== null && value !== undefined;
    return (
        <Stack gap="xs">
            <Text fw={600} size="sm">{t('projects.maxTerm.label')}</Text>
            <Checkbox
                label={t('projects.maxTerm.enable')}
                description={bound
                    ? t('projects.maxTerm.inherited', { duration: formatTerm(t, bound) })
                    : t('projects.maxTerm.hint')}
                checked={limited}
                disabled={!!bound}
                onChange={e => onChange?.(e.currentTarget.checked ? (bound ?? 180) : null)}
            />
            <Box pl="xl" ml="xs" style={{ opacity: limited ? 1 : 0.45, transition: 'opacity 150ms ease' }}>
                <DurationInput days={value ?? null} maxDays={bound} disabled={!limited} onChange={onChange} />
            </Box>
        </Stack>
    );
}

// formatTerm states a term of days in the unit it reads best in.
export function formatTerm(t, days) {
    const unit = durationUnitFor(days);
    return t(`projects.maxTerm.${unit}`, { count: Math.round(days / DAYS_PER_UNIT[unit]) });
}

// DeletingBadge marks a released or archived project whose deletion for good is
// under way — from the request until it disappears from the list.
export function DeletingBadge({ size = 'sm', purge = null }) {
    const { t } = useTranslation();
    // Where the reconciler has started, the tooltip says how far it got.
    const label = purge ? purgeLines(t, purge).join(' ') : t('projects.projectCard.deletingHint');
    return (
        <Tooltip label={label} multiline w={260}>
            <Badge size={size} color={COLOR.negative} variant="light" style={{ cursor: 'default' }}>
                {t('projects.projectCard.deleting')}
            </Badge>
        </Tooltip>
    );
}

// purgeLines says how far emptying a project before its deletion has got —
// the step, and why it waits where it is not just OpenStack finishing up.
export function purgeLines(t, purge) {
    const lines = [t('projects.purge.progress', {
        index: purge.index, steps: purge.steps,
        step: t(`projects.purge.step.${purge.step}`, { defaultValue: purge.step }),
    })];
    if (purge.blocked) {
        lines.push(t(`projects.purge.blocked.${purge.blocked}`, { detail: purge.detail, defaultValue: '' }));
    }
    return lines.filter(Boolean);
}

// PurgeProgress shows it on a project card: a bar for the steps, and the
// reason it waits in the colour of a problem.
export function PurgeProgress({ purge }) {
    const { t } = useTranslation();
    if (!purge) return null;
    const [progress, reason] = purgeLines(t, purge);
    return (
        <Stack gap="4" mb="xs">
            <Text size="xs" c="dimmed">{progress}</Text>
            <Progress size="xs" value={purge.steps ? (purge.index / purge.steps) * 100 : 0}
                color={purge.blocked ? COLOR.attention : COLOR.negative} />
            {reason && <Text size="xs" c={`${COLOR.attention}.7`}>{reason}</Text>}
        </Stack>
    );
}
