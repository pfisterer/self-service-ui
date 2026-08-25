import { useState } from 'react';
import { Calendar } from 'lucide-react';
import { DatePickerInput } from '@mantine/dates';
import { Badge, Box, Checkbox, Group, NumberInput, Progress, Select, Stack, Table, Text, Tooltip } from '@mantine/core';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { COLOR, formatRoleLabel, limitDelta, nodeChanges, resourceBarSegments, statusDescription, statusLabel, statusStyle, UNLIMITED_QUOTA } from './util-project.jsx';
import { tokenDisplay, tokenEmail, useTokenLabels } from './token-labels.jsx';
import { formatDate } from '../format-date.js';

dayjs.extend(relativeTime);

// ── Facts ───────────────────────────────────────────────────────────────────

// FactRow is the single shape in which a card states a fact: a dimmed label of
// fixed width, the value beside it. Every card uses it for every fact, so the
// eye finds "who owns this" or "when does it end" in the same place on a
// project and on a budget — instead of one card using headings, the other
// label/value rows and both mixing in badges.
//
// `hint` is a second, smaller line under the value: the place for the sentence
// that explains what the value means to someone seeing it for the first time.
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
export function NodeStatusBadge({ status, size = 'sm', provisioning = false }) {
    const style = statusStyle(status, provisioning);
    const badge = (
        <Badge size={size} color={style.color} variant={style.variant}>
            {statusLabel(status, provisioning)}
        </Badge>
    );
    const description = statusDescription(status, provisioning);
    if (!description) return badge;
    return (
        <Tooltip label={description} multiline w={300} withArrow>
            <span style={{ cursor: 'help' }}>{badge}</span>
        </Tooltip>
    );
}

// PersonBadge names a person and lets you write to them: everything the UI says
// about who is responsible ends in a question ("can I ask them?"), and the
// address is right there. A group has no mailbox, so it stays a plain badge.
export function PersonBadge({ email, children, color = COLOR.identity, variant = 'outline', size = 'sm' }) {
    const label = children ?? email;
    if (!email) {
        return (
            <Badge size={size} variant={variant} color={color} style={{ textTransform: 'none' }}>
                {label}
            </Badge>
        );
    }
    return (
        <Badge component="a" href={`mailto:${email}`} title={`Write to ${email}`}
            size={size} variant={variant} color={color}
            style={{ textTransform: 'none', cursor: 'pointer' }}>
            {label}
        </Badge>
    );
}

// TokenBadgeList renders a list of user:/group: tokens as badges, showing the
// group's display name next to the token where the directory knows one.
export function TokenBadgeList({ tokens, color = COLOR.identity, emptyMessage = null, size = 'sm' }) {
    const labels = useTokenLabels(tokens);
    if (!tokens || tokens.length === 0) {
        return emptyMessage
            ? <Text size="xs" c="dimmed">{emptyMessage}</Text>
            : null;
    }
    return (
        <Group gap="xs" wrap="wrap">
            {tokens.map(token => (
                <PersonBadge key={token} email={tokenEmail(token)} size={size} color={color}>
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
            <Group gap="xs" wrap="wrap">
                {users.map(u => (
                    <Badge key={`${u.token}:${u.openstack_role}`} size={size} variant="outline" color={COLOR.identity}
                        style={{ textTransform: 'none' }}>
                        {u.token} ({formatRoleLabel(u.openstack_role)})
                    </Badge>
                ))}
            </Group>
        </div>
    );
}

// ── Usage bars ──────────────────────────────────────────────────────────────

// ResourceBar renders one resource row with a usage progress bar.
// approved and changePending are plain numbers (already extracted by the caller).
// limit may be UNLIMITED_QUOTA (-1) to indicate no cap.
// incoming (optional) adds a highlighted segment previewing a pending grant's impact.
export function ResourceBar({ resource, limit, approved = 0, changePending = 0, incoming = 0 }) {
    const label = resource.unit ? `${resource.name} (${resource.unit})` : resource.name;
    const unlimited = limit === UNLIMITED_QUOTA;

    if (unlimited) {
        return (
            <Group justify="space-between">
                <Text size="xs">{label}</Text>
                <Text size="xs" c="dimmed">
                    {approved}{changePending > 0 ? ` + ${changePending} pending` : ''}{incoming > 0 ? ` + ${incoming} incoming` : ''} / ∞
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

    const suffix = [
        changePending > 0 ? `+${changePending} pending` : null,
        incoming > 0 ? `+${incoming} incoming` : null,
    ].filter(Boolean).join(', ');

    return (
        <Stack gap="2">
            <Group justify="space-between">
                <Text size="xs">{label}</Text>
                <Text size="xs" c="dimmed">
                    {approved}{suffix ? ` (${suffix})` : ''} / {limit}
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
export function NodeUsageBars({ resources, node, incomingQuota = null }) {
    if (!resources || !node) return null;
    const usage = node.usage ?? {};
    return (
        <Stack gap="xs">
            {resources.map(r => (
                <ResourceBar
                    key={r.id}
                    resource={r}
                    limit={node.limit?.[r.id] ?? 0}
                    approved={usage.approved?.limit?.[r.id] ?? 0}
                    changePending={usage.change_pending?.limit?.[r.id] ?? 0}
                    incoming={incomingQuota?.[r.id] ?? 0}
                />
            ))}
        </Stack>
    );
}

// ── Change diff ─────────────────────────────────────────────────────────────

// NodeChangesDiff shows a before/after table for limit and termination date
// plus added/removed authorized users. Renders nothing when nothing changed.
export function NodeChangesDiff({ resources, limitFrom, limitTo, dateFrom, dateTo, usersFrom, usersTo, label = 'Proposed changes' }) {
    const { hasLimitChange, hasDateChange, added, removed, roleChanged, hasUserChanges } =
        nodeChanges({ resources, limitFrom, limitTo, dateFrom, dateTo, usersFrom, usersTo });

    if (!hasLimitChange && !hasDateChange && !hasUserChanges) return null;

    const diff = (id) => {
        const { before, after, d } = limitDelta(limitFrom, limitTo, id);
        return { before, after, d, color: d > 0 ? 'green' : d < 0 ? 'red' : 'gray' };
    };

    return (
        <Box mt="md">
            <Text fw={600} size="sm" mb="xs">{label}</Text>

            {(hasLimitChange || hasDateChange) && (
                <Table size="xs" mb={hasUserChanges ? 'md' : 0}>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Resource</Table.Th>
                            <Table.Th>Before</Table.Th>
                            <Table.Th>After</Table.Th>
                            <Table.Th>Change</Table.Th>
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
                                <Table.Td>End date</Table.Td>
                                <Table.Td>{formatDate(dateFrom)}</Table.Td>
                                <Table.Td>{formatDate(dateTo)}</Table.Td>
                                <Table.Td c={new Date(dateTo) - new Date(dateFrom) >= 0 ? 'green' : 'red'}>
                                    {new Date(dateTo) > new Date(dateFrom) ? '+' : ''}{dayjs(dateTo).from(dayjs(dateFrom), true)}
                                </Table.Td>
                            </Table.Tr>
                        )}
                    </Table.Tbody>
                </Table>
            )}

            {hasUserChanges && (
                <Stack gap="xs">
                    <UserRoleBadgeList users={added} label="Added:" />
                    <UserRoleBadgeList users={removed} label="Removed:" labelColor="dimmed" />
                    {roleChanged.length > 0 && (
                        <div>
                            <Text size="xs" c="dimmed" fw={600} mb="xs">Roles changed:</Text>
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

// ── End date picker ─────────────────────────────────────────────────────────

// TerminationDatePicker: date input plus a duration shortcut ("90 days") that
// keeps both in sync — beginners think in durations, admins in dates.
//
// `optional` adds the switch that decides whether there is an end date at all.
// Without it the duration read "90 Days" next to an empty date field, which is
// two contradicting answers to the same question. Budgets use it (a department
// budget usually runs until somebody changes it); a project request does not,
// because there an end date is required.
const DEFAULT_DURATION_DAYS = 90;

export function TerminationDatePicker({ value, onChange, error, readOnly = false, label = 'End date', optional = false }) {
    const currentDate = value;
    // No date means no duration to show: a number standing next to an empty date
    // field claims something that is not stored anywhere.
    // The unit the user PICKED, or null for "whichever states the span in the
    // fewest digits". Picking one has to stick: deriving it from the date on
    // every render fights the user, because "Weeks" + 4 is 28 days and the
    // thresholds below would snap that straight back to "Days" — the number
    // jumped and the unit reset on every keystroke.
    //
    // That protection used to exist as a `unitPicked` flag which nothing ever
    // set to true, so it never worked; the duration was written into state from
    // an effect that also re-chose the unit. Both are derived here instead.
    const [pickedUnit, setPickedUnit] = useState(null);

    const selectData = [
        { value: 'days', label: 'Days' },
        { value: 'weeks', label: 'Weeks' },
        { value: 'months', label: 'Months' },
    ];

    const daysUntil = currentDate
        ? Math.ceil((new Date(currentDate) - new Date()) / (1000 * 60 * 60 * 24))
        : null;

    const autoUnit = daysUntil === null ? 'days'
        : daysUntil < 60 ? 'days'
            : daysUntil < 365 ? 'weeks'
                : 'months';
    const durationUnit = pickedUnit ?? autoUnit;

    // No date means no duration to show: a number standing next to an empty
    // date field claims something that is not stored anywhere.
    const durationValue = daysUntil === null ? null
        : durationUnit === 'weeks' ? Math.round(daysUntil / 7)
            : durationUnit === 'months' ? Math.round(daysUntil / 30)
                : daysUntil;

    const dateFromDuration = (val, unit) => {
        const days = unit === 'weeks' ? val * 7 : unit === 'months' ? val * 30 : val;
        return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    };

    const updateDateFromDuration = (val, unit) => {
        if (!val || val <= 0) return;
        onChange?.(dateFromDuration(val, unit));
    };

    if (readOnly) {
        if (!currentDate) return null;
        return (
            <>
                <Text mt="xs" mb="xs" size="xs" fw={600}>{label}</Text>
                <Badge variant="outline" color="gray" leftSection={<Calendar size="12" />}>
                    Ends: {formatDate(currentDate)} ({dayjs(currentDate).fromNow()})
                </Badge>
            </>
        );
    }

    const hasEndDate = !optional || !!currentDate;

    const fields = (
        <Group gap="xs" align="flex-end">
            <DatePickerInput style={{ flex: 1 }} size="xs" placeholder="Pick date" leftSection={<Calendar size="14" />}
                label={`Date ${currentDate ? `(${dayjs(currentDate).fromNow()})` : ''}`}
                value={currentDate}
                onChange={onChange}
                minDate={new Date()}
                disabled={!hasEndDate}
                error={error}
            />
            <NumberInput size="xs" w={110} label="Duration" min={1} max={365}
                value={durationValue ?? ''}
                placeholder="—"
                disabled={!hasEndDate}
                onChange={(v) => updateDateFromDuration(v, durationUnit)} />
            <Select size="xs" label="Unit" w={110} value={durationUnit} data={selectData}
                disabled={!hasEndDate}
                onChange={(u) => { setPickedUnit(u); updateDateFromDuration(durationValue, u); }} />
        </Group>
    );

    return (
        <Stack gap="xs">
            <Text fw={600} size="sm">{label}</Text>

            {optional ? (
                <>
                    {/* Ticking the box writes a real date right away, so the fields
                        below never describe something that is not stored. */}
                    <Checkbox
                        label="Set an end date"
                        description="Off means the budget runs until somebody changes it."
                        checked={hasEndDate}
                        onChange={e => onChange?.(e.currentTarget.checked
                            ? dateFromDuration(DEFAULT_DURATION_DAYS, 'days')
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
        </Stack>
    );
}
