import { useEffect, useState } from 'react';
import { Calendar } from 'lucide-react';
import { DatePickerInput } from '@mantine/dates';
import { Badge, Box, Group, NumberInput, Progress, Select, Stack, Table, Text } from '@mantine/core';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { formatRoleLabel, statusLabel, statusStyle, UNLIMITED_QUOTA } from './util-project.jsx';

dayjs.extend(relativeTime);

// ── Badges ──────────────────────────────────────────────────────────────────

// NodeStatusBadge renders the status of a node in the one shared vocabulary.
export function NodeStatusBadge({ status, size = 'sm' }) {
    const style = statusStyle(status);
    return (
        <Badge size={size} color={style.color} variant={style.variant}>
            {statusLabel(status)}
        </Badge>
    );
}

// TokenBadgeList renders a list of user:/group: tokens as badges.
export function TokenBadgeList({ tokens, color = 'gray', emptyMessage = null, size = 'sm' }) {
    if (!tokens || tokens.length === 0) {
        return emptyMessage
            ? <Text size="xs" c="dimmed">{emptyMessage}</Text>
            : null;
    }
    return (
        <Group gap="xs" wrap="wrap">
            {tokens.map(token => (
                <Badge key={token} size={size} variant="outline" color={color} style={{ textTransform: 'none' }}>
                    {token}
                </Badge>
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
                return <Badge key={r.id} size={size} variant="outline" color="gray">{display} {r.name}</Badge>;
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
                    <Badge key={`${u.token}:${u.openstack_role}`} size={size} variant="outline" color="gray"
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

    const pct = (v) => (limit > 0 ? Math.round((v / limit) * 100) : 0);
    const approvedPct = Math.min(100, pct(approved));
    const pendingPct = Math.min(100 - approvedPct, pct(changePending));
    const incomingPct = Math.min(100 - approvedPct - pendingPct, pct(incoming));
    const totalPct = approvedPct + pendingPct + incomingPct;
    const color = totalPct >= 90 ? 'red' : totalPct >= 70 ? 'yellow' : 'blue';

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
                {changePending > 0 && <Progress.Section value={pendingPct} color="orange" striped animated />}
                {incoming > 0 && <Progress.Section value={incomingPct} color="teal" striped animated />}
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
    const hasLimitChange = limitFrom && limitTo && resources &&
        resources.some(r => (limitFrom[r.id] ?? 0) !== (limitTo[r.id] ?? 0));
    const hasDateChange = dateFrom && dateTo && new Date(dateFrom).getTime() !== new Date(dateTo).getTime();

    const hasUserData = usersTo !== undefined && usersTo !== null;
    const from = usersFrom || [];
    const to = usersTo || [];
    const fromMap = new Map(from.map(u => [u.token, u]));
    const toMap = new Map(to.map(u => [u.token, u]));
    const added = hasUserData ? to.filter(u => !fromMap.has(u.token)) : [];
    const removed = hasUserData ? from.filter(u => !toMap.has(u.token)) : [];
    const roleChanged = hasUserData ? to.filter(u => {
        const previous = fromMap.get(u.token);
        return previous && previous.openstack_role !== u.openstack_role;
    }) : [];
    const hasUserChanges = added.length > 0 || removed.length > 0 || roleChanged.length > 0;

    if (!hasLimitChange && !hasDateChange && !hasUserChanges) return null;

    const diff = (id) => {
        const before = limitFrom?.[id] ?? 0;
        const after = limitTo?.[id] ?? 0;
        const d = after - before;
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
                                <Table.Td>{new Date(dateFrom).toLocaleDateString()}</Table.Td>
                                <Table.Td>{new Date(dateTo).toLocaleDateString()}</Table.Td>
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
                                            {formatRoleLabel(fromMap.get(u.token)?.openstack_role)}
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
export function TerminationDatePicker({ value, onChange, error, readOnly = false, label = 'End date' }) {
    const currentDate = value;
    const [durationValue, setDurationValue] = useState(90);
    const [durationUnit, setDurationUnit] = useState('days');
    const selectData = [
        { value: 'days', label: 'Days' },
        { value: 'weeks', label: 'Weeks' },
        { value: 'months', label: 'Months' },
    ];

    useEffect(() => {
        if (!currentDate) return;
        const diffDays = Math.ceil((new Date(currentDate) - new Date()) / (1000 * 60 * 60 * 24));
        if (diffDays < 60) {
            setDurationValue(diffDays);
            setDurationUnit('days');
        } else if (diffDays < 365) {
            setDurationValue(Math.round(diffDays / 7));
            setDurationUnit('weeks');
        } else {
            setDurationValue(Math.round(diffDays / 30));
            setDurationUnit('months');
        }
    }, [currentDate]);

    const updateDateFromDuration = (val, unit) => {
        if (!val || val <= 0) return;
        const days = unit === 'weeks' ? val * 7 : unit === 'months' ? val * 30 : val;
        onChange?.(new Date(Date.now() + days * 24 * 60 * 60 * 1000));
    };

    if (readOnly) {
        if (!currentDate) return null;
        return (
            <>
                <Text mt="xs" mb="xs" size="xs" fw={600}>{label}</Text>
                <Badge variant="outline" color="gray" leftSection={<Calendar size="12" />}>
                    Ends: {new Date(currentDate).toLocaleDateString()} ({dayjs(currentDate).fromNow()})
                </Badge>
            </>
        );
    }

    return (
        <Stack gap="xs">
            <Text fw={600} size="sm">{label}</Text>
            <Group gap="xs" align="flex-end">
                <DatePickerInput style={{ flex: 1 }} size="xs" placeholder="Pick date" leftSection={<Calendar size="14" />}
                    label={`Date ${currentDate ? `(${dayjs(currentDate).fromNow()})` : ''}`}
                    value={currentDate}
                    onChange={onChange}
                    minDate={new Date()}
                    error={error}
                />
                <NumberInput size="xs" w={110} label="Duration" min={1} max={365} value={durationValue}
                    onChange={(v) => { setDurationValue(v); updateDateFromDuration(v, durationUnit); }} />
                <Select size="xs" label="Unit" w={110} value={durationUnit} data={selectData}
                    onChange={(u) => { setDurationUnit(u); updateDateFromDuration(durationValue, u); }} />
            </Group>
        </Stack>
    );
}
