import { useEffect, useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { Calendar } from 'lucide-preact';
import { DatePickerInput } from '@mantine/dates';
import { Badge, Box, Group, NumberInput, Paper, Progress, Select, Stack, Table, Text } from '@mantine/core';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { formatRoleLabel, UNLIMITED_QUOTA } from './util-project.js';

dayjs.extend(relativeTime);

function getRoleBadgeStyle(roleId) {
    switch (roleId) {
        case 'admin': return { color: 'dark', variant: 'outline' };
        case 'member': return { color: 'gray', variant: 'outline' };
        case 'reader': return { color: 'gray', variant: 'outline' };
        case 'viewer': return { color: 'gray', variant: 'outline' };
        default: return { color: 'gray', variant: 'outline' };
    }
}

// ProjectBar renders a single resource row with a usage progress bar.
// approved and changePending are plain numbers (already extracted by the caller).
// limit may be UNLIMITED_QUOTA (-1) to indicate no cap.
// incoming (optional) adds a third highlighted segment showing a pending grant's impact.
export function ProjectBar({ resource, limit, approved = 0, changePending = 0, incoming = 0 }) {
    const label = resource.unit ? `${resource.name} (${resource.unit})` : resource.name;
    const unlimited = limit === UNLIMITED_QUOTA;

    if (unlimited) {
        return html`
            <${Group} justify="space-between">
                <${Text} size="xs">${label}<//>
                <${Text} size="xs" c="dimmed">
                    ${approved}${changePending > 0 ? ` + ${changePending} pending` : ''}${incoming > 0 ? ` + ${incoming} this project` : ''} / ∞
                <//>
            <//>
        `;
    }

    const approvedPct = limit > 0 ? Math.min(100, Math.round((approved / limit) * 100)) : 0;
    const pendingPct = limit > 0 ? Math.min(100 - approvedPct, Math.round((changePending / limit) * 100)) : 0;
    const incomingPct = limit > 0 ? Math.min(100 - approvedPct - pendingPct, Math.round((incoming / limit) * 100)) : 0;
    const totalPct = approvedPct + pendingPct + incomingPct;
    const color = totalPct >= 90 ? 'red' : totalPct >= 70 ? 'yellow' : 'blue';

    const suffix = [
        changePending > 0 ? `+${changePending} pending` : null,
        incoming > 0 ? `+${incoming} this` : null,
    ].filter(Boolean).join(', ');

    return html`
        <${Stack} gap="2">
            <${Group} justify="space-between">
                <${Text} size="xs">${label}<//>
                <${Text} size="xs" c="dimmed">
                    ${approved}${suffix ? ` (${suffix})` : ''} / ${limit}
                <//>
            <//>
            <${Progress.Root} size="sm">
                <${Progress.Section} value=${approvedPct} color=${color} />
                ${changePending > 0 && html`<${Progress.Section} value=${pendingPct} color="orange" striped animated />`}
                ${incoming > 0 && html`<${Progress.Section} value=${incomingPct} color="teal" striped animated />`}
            <//>
        <//>
    `;
}

// MyAllocationBar renders one resource row within "Resources Allocated To Me".
// myUsageByStatus: { approved: quota, change_pending: quota } from the user's own projects.
function MyAllocationBar({ resource, limit, myUsageByStatus }) {
    return html`<${ProjectBar}
        resource=${resource}
        limit=${limit}
        approved=${myUsageByStatus?.approved?.[resource.id] ?? 0}
        changePending=${myUsageByStatus?.change_pending?.[resource.id] ?? 0}
    />`;
}

// ProjectDelegationsTable shows the user's allocated resources grouped by funding delegation.
// delegations: full delegation objects (from listDelegationsToMe) containing names and limits.
// projectsByFunderId: map of delegationId → { approved: ResourceQuota, change_pending: ResourceQuota }
//   derived from the user's own projects, grouped by funded_by and status.
export function ProjectDelegationsTable({ projectConfig, projectsByFunderId, delegations }) {
    if (!projectConfig || !projectsByFunderId)
        return null;

    const funders = Object.keys(projectsByFunderId);

    if (funders.length === 0) return html`
        <${Text} c="dimmed" ta="center" py="xl">No funded allocations yet.<//>
    `;

    const delegationMap = new Map((delegations || []).map(d => [d.id, d]));

    return html`
        <${Stack} gap="md">
            ${funders.map(funderId => {
        const delegation = delegationMap.get(funderId);
        const myUsageByStatus = projectsByFunderId[funderId];
        const name = delegation?.name ?? funderId;
        const limit = delegation?.quota?.limit ?? {};

        return html`
                    <${Paper} key=${funderId} withBorder p="md">
                        <${Text} fw=${600} size="sm" mb="xs">${name}<//>
                        <${Stack} gap="xs">
                            ${projectConfig.projects.map(r => html`
                                <${MyAllocationBar}
                                    key=${r.id}
                                    resource=${r}
                                    limit=${limit[r.id] ?? 0}
                                    myUsageByStatus=${myUsageByStatus}
                                />
                            `)}
                        <//>
                    <//>
                `;
    })}
        <//>
    `;
}

export function ProjectChangesDiff({ config, quotaFrom, quotaTo, dateFrom, dateTo, usersFrom, usersTo, label = 'Proposed Changes' }) {
    const hasQuotaChange = quotaFrom && quotaTo && config &&
        config.projects.some(r => (quotaFrom[r.id] ?? 0) !== (quotaTo[r.id] ?? 0));
    const hasDateChange = dateFrom && dateTo && new Date(dateFrom).getTime() !== new Date(dateTo).getTime();

    const hasAuthData = usersTo !== undefined;
    const from = usersFrom || []
    const to = usersTo || []
    const fromMap = new Map(from.map(u => [u.token, u]));
    const toMap = new Map(to.map(u => [u.token, u]));
    const added = hasAuthData ? to.filter(u => !fromMap.has(u.token)) : [];
    const removed = hasAuthData ? from.filter(u => !toMap.has(u.token)) : [];
    const roleChanged = hasAuthData ? to.filter(u => {
        const previous = fromMap.get(u.token);
        if (!previous) return false;
        return previous.openstack_role !== u.openstack_role;
    }) : [];
    const hasAuthorizationChanges = hasAuthData && (added.length > 0 || removed.length > 0 || roleChanged.length > 0);

    if (!hasQuotaChange && !hasDateChange && !hasAuthorizationChanges) return null;

    const diff = (id) => {
        const val1 = (quotaFrom?.[id] ?? 0);
        const val2 = (quotaTo?.[id] ?? 0);
        const d = val2 - val1;
        return { before: val1, after: val2, diff: d, color: d > 0 ? 'green' : d < 0 ? 'red' : 'gray' };
    };

    const formatDate = (d) => new Date(d).toLocaleDateString();

    const getResourceLabel = (resource) => {
        return resource.unit ? `${resource.name} (${resource.unit})` : resource.name;
    };

    const getRoleName = (roleId) => formatRoleLabel(roleId);

    return html`
        <${Box} mt="md">
            <${Text} fw=${600} mb="xs">${label}<//>

            ${(hasQuotaChange || hasDateChange) && html`
                <${Table} size="xs" mb=${hasAuthorizationChanges ? 'md' : 0}>
                    <${Table.Thead}>
                        <${Table.Tr}>
                            <${Table.Th}>Resource<//>
                            <${Table.Th}>Before<//>
                            <${Table.Th}>After<//>
                            <${Table.Th}>Change<//>
                        <//>
                    <//>
                    <${Table.Tbody}>
                        ${hasQuotaChange && config.projects.map(r => {
        const d = diff(r.id);
        return html`
                                <${Table.Tr}>
                                    <${Table.Td}>${getResourceLabel(r)}<//>
                                    <${Table.Td}>${d.before}<//>
                                    <${Table.Td}>${d.after}<//>
                                    <${Table.Td} c=${d.color}>${d.diff > 0 ? '+' : ''}${d.diff}<//>
                                <//>
                            `;
    })}
                        ${hasDateChange && html`
                            <${Table.Tr}>
                                <${Table.Td}>Termination Date<//>
                                <${Table.Td}>${formatDate(dateFrom)}<//>
                                <${Table.Td}>${formatDate(dateTo)}<//>
                                <${Table.Td} c=${new Date(dateTo) - new Date(dateFrom) >= 0 ? 'green' : 'red'}>
                                    ${new Date(dateTo) > new Date(dateFrom) ? '+' : ''}${dayjs(dateTo).from(dayjs(dateFrom), true)}
                                <//>
                            <//>
                        `}
                    <//>
                <//>
            `}

            ${hasAuthorizationChanges && html`
                <${Stack} gap="xs">
                    ${added.length > 0 && html`
                        <${UserRoleBadgeList} users=${added} label="Added:" />
                    `}

                    ${removed.length > 0 && html`
                        <${UserRoleBadgeList} users=${removed} variant="outline" colorOverride="gray" label="Removed:" labelColor="dimmed" />
                    `}

                    ${roleChanged.length > 0 && html`
                        <div>
                            <${Text} size="xs" c="dimmed" fw=${600} mb="xs">Roles Changed:<//>
                            <${Stack} gap="xs">
                                ${roleChanged.map(u => {
        const oldUser = fromMap.get(u.token);
        const oldStyle = getRoleBadgeStyle(oldUser?.openstack_role);
        const newStyle = getRoleBadgeStyle(u.openstack_role);
        return html`
                                        <${Group} key=${u.token} gap="xs" align="center">
                                            <${Text} size="sm">${u.token}:<//>
                                            <${Badge} size="sm" variant=${oldStyle.variant} color=${oldStyle.color}>
                                                ${getRoleName(oldUser?.openstack_role)}
                                            <//>
                                            <${Text} size="xs" c="dimmed">→<//>
                                            <${Badge} size="sm" variant=${newStyle.variant} color=${newStyle.color}>
                                                ${getRoleName(u.openstack_role)}
                                            <//>
                                        <//>
                                    `;
    })}
                            <//>
                        </div>
                    `}
                <//>
            `}
        <//>
    `;
}

export function TerminationDatePicker({ value, date, onChange, error, readOnly = false, label = 'Termination Date' }) {
    const currentDate = value || date;
    const [durationValue, setDurationValue] = useState(90);
    const [durationUnit, setDurationUnit] = useState('days');
    const selectData = [
        { value: 'days', label: 'Days' },
        { value: 'weeks', label: 'Weeks' },
        { value: 'months', label: 'Months' }
    ];

    useEffect(() => {
        if (!currentDate) return;

        const now = new Date();
        const diffDays = Math.ceil((new Date(currentDate) - now) / (1000 * 60 * 60 * 24));

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
        if (!val || val <= 0)
            return;
        const days = unit === 'weeks' ? val * 7 : unit === 'months' ? val * 30 : val;

        onChange?.(new Date(Date.now() + days * 24 * 60 * 60 * 1000));
    };

    if (readOnly) {
        if (!currentDate)
            return null;

        return html`
            <${Text} mt="xs" mb="xs" size="xs" fw=${600}>${label}<//>
            <${Group} gap="xs" align="center">
                <${Badge} variant="outline" color="gray" leftSection=${html`<${Calendar} size="12" />`}>
                    Expires: ${new Date(currentDate).toLocaleDateString()} (${dayjs(currentDate).fromNow()})
                <//>
            <//>
        `;
    }

    return html`
        <${Stack} gap="xs">

            <${Group} gap="xs" align="center">
                <${Text} fw=${600}>${label}<//>
            <//>

            <${Group} gap="xs" align="flex-end">

                <${DatePickerInput} style=${{ flex: 1 }} size="xs" placeholder="Pick date" leftSection=${html`<${Calendar} size="14" />`}
                    label=${`Date ${currentDate && `(${dayjs(currentDate).fromNow()})`}`}
                    value=${currentDate}
                    onChange=${onChange}
                    minDate=${new Date()}
                    error=${error}
                />

                <${NumberInput} size="xs" w=${110} label="Dur." min=${1} max=${365} value=${durationValue}
                    onChange=${(v) => { setDurationValue(v); updateDateFromDuration(v, durationUnit); }} />

                <${Select} size="xs" label="Unit" w=${110} value=${durationUnit} data=${selectData} 
                    onChange=${(u) => { setDurationUnit(u); updateDateFromDuration(durationValue, u); }} />

            <//>
        <//>
    `;
}

export function ProjectDisplay({ projectConfig, quota, label = 'Resources', fundedBy = '' }) {

    if (!quota || !projectConfig || !Array.isArray(projectConfig)) {
        console.warn('Invalid resources or quota provided to ProjectDisplay component', { projects: projectConfig, quota });
        return null;
    }

    const resourceBadges = projectConfig.map(r => {
        if (!r || !r.id || !r.name) return null;
        const value = quota[r.id] || 0;
        const displayValue = r.unit ? `${value} ${r.unit}` : value;
        return html`<${Badge} variant="outline" color="gray">${displayValue} ${r.name}<//>`;
    })

    return html`
        <${Stack} gap="xs">
            
        <${Group} gap="xs" align="center">
                <${Text} size="xs" fw=${600}>${label}<//>
                ${fundedBy && html`<${Text} size="xs" c="dimmed">(funded by: ${fundedBy})<//>`}
            <//>

            <${Group} gap="xs">
                ${resourceBadges}
            <//>

        <//>
    `;
}

export function TokenList({ tokens, label, color = 'gray', size = 'sm', variant = 'outline' }) {
    if (!tokens || tokens.length === 0) return null;

    return html`
        <${Box}>
            ${label && html`<${Text} size="xs" mb="xs" fw=${700}>${label}<//>`}
            <${Group} gap="xs" wrap="wrap">
                <${Text} size="xs" c="dimmed">User-Tokens:<//>
                ${tokens.map(token => html`
                    <${Badge}
                        key=${token}
                        size=${size}
                        variant=${variant}
                        color=${color}
                        style=${{ textTransform: 'none' }}
                    >
                        ${token}
                    <//>
                `)}
            <//>
        <//>
    `;
}

export function UserRoleBadgeList({ users, label, labelColor, size = 'sm', variant, colorOverride }) {
    if (!users || users.length === 0)
        return null;

    function getRoleBadgeStyleWithOverride(roleId) {
        const base = getRoleBadgeStyle(roleId);
        return {
            color: colorOverride || base.color,
            variant: variant || base.variant,
        };
    }

    function toBadge(u) {
        const style = getRoleBadgeStyleWithOverride(u.openstack_role);

        return html`
            <${Badge}
                size=${size}
                variant=${style.variant}
                color=${style.color}
                style=${{ textTransform: 'none' }}
                key=${`${u.token}:${u.group_role}:${u.openstack_role}`}
            >
                        ${u.token} (Group: ${formatRoleLabel(u.group_role)}, OpenStack: ${formatRoleLabel(u.openstack_role)})
            <//>
        `;
    }

    return html`
        <div>
            ${label && html`<${Text} size="xs" c=${labelColor} fw=${600} mb="xs">${label}<//>`}
            
            <${Group} gap="xs" wrap="wrap">
                ${users.map(u => toBadge(u))}
            <//>
        </div >
    `;
}

export function GroupList({ items, color, emptyMessage = null }) {
    const hasItems = items && items.length > 0;

    // If no items, show empty message if provided, otherwise show default message
    if (!hasItems) {

        if (emptyMessage) {
            return html`
                <${Badge} size="sm" variant="outline" color="gray" style=${{ textTransform: 'none' }}>
                    ${emptyMessage}
                <//>
            `;
        }
        return html`<div>No data provided for this GroupList component</div>`;

    }

    // Render badges for each item
    return html`
        <div>
            <${Group} gap="xs" wrap="wrap">
                ${items.map(item => html`
                    <${Badge} size="sm" variant="outline" color=${color} style=${{ textTransform: 'none' }}  key=${item}>
                        ${item}
                    <//>
                `)}
            <//>
        </div >
    `;
}
