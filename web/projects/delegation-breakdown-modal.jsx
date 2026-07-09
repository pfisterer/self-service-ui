import { useEffect, useMemo, useState } from 'react';
import { Accordion, ActionIcon, Badge, Button, Group, Loader, Modal, Stack, Table, Text, TextInput } from '@mantine/core';
import { Search, X } from 'lucide-react';
import { useClient } from '../providers/client.jsx';
import { useProjectConfig } from './projects.jsx';
import { formatRelativeDate, statusLabel, statusStyle } from './util-project.jsx';


// Returns true if the query string matches any searchable field in the project or its group label.
function projectMatchesQuery(project, groupLabel, query) {
    if (!query) return true;
    const q = query.toLowerCase();
    const candidates = [
        project.id,
        project.reason,
        project.status,
        statusLabel(project.status),
        project.termination_date,
        groupLabel,
        ...Object.entries(project.quota ?? {}).map(([k, v]) => `${k} ${v}`),
        ...(project.requester_tokens ?? []),
    ];
    return candidates.some(s => s && String(s).toLowerCase().includes(q));
}

// Header rendered inside each Accordion.Control.
// Shows the delegation name on the left and a summary of resource totals + status counts on the right.
function GroupHeader({ name, reqs, projectConfig }) {
    const quotaSums = {};
    const statusCounts = {};
    for (const req of reqs) {
        for (const [k, v] of Object.entries(req.quota ?? {})) {
            quotaSums[k] = (quotaSums[k] ?? 0) + v;
        }
        statusCounts[req.status] = (statusCounts[req.status] ?? 0) + 1;
    }

    return (
        <Group justify="space-between" wrap="nowrap" style={{ flex: 1, paddingRight: '8px' }}>
            <Text size="sm" fw={600}>{name}</Text>
            <Group gap="xs">
                {(projectConfig?.projects ?? []).map(r => quotaSums[r.id] > 0 && (
                    <Badge key={r.id} size="sm" variant="outline" color="gray" style={{ textTransform: 'none' }}>
                        {quotaSums[r.id]}{r.unit ? ` ${r.unit}` : ''} {r.name}
                    </Badge>
                ))}
                {Object.entries(statusCounts).map(([status, count]) => {
        const style = statusStyle(status);
        return (
                        <Badge key={status} size="sm" color={style.color} variant={style.variant}>
                            {count}{'\u00a0'}{statusLabel(status)}
                        </Badge>
                    );
    })}
            </Group>
        </Group>
    );
}

// DelegationBreakdownModal shows which projects are consuming resources in a delegation's pool,
// grouped by which child delegation directly funded each project.
//
// Props:
//   delegation       — the delegation object whose usage is being inspected
//   opened           — modal visibility flag
//   onClose          — called when the modal should close
//   knownDelegations — optional array of delegation objects used for name resolution;
//                      typically the list already loaded in the parent view
export function DelegationBreakdownModal({ delegation, opened, onClose, knownDelegations }) {
    const { client, sdk } = useClient('projects');
    const projectConfig = useProjectConfig();
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(false);
    const [query, setQuery] = useState('');
    const [openItems, setOpenItems] = useState([]);

    // Build delegation ID → name map from whatever the parent already fetched.
    const delegationNames = new Map((knownDelegations ?? []).map(d => [d.id, d.name]));
    delegationNames.set(delegation.id, delegation.name);

    const groupLabel = (funderId) => funderId === delegation.id
        ? `Direct — ${delegation.name}`
        : (delegationNames.get(funderId) ?? funderId);

    useEffect(() => {
        if (!opened) return;

        const ids = [...new Set(
            Object.values(delegation?.quota?.usage_by_status ?? {}).flatMap(s => s?.project_ids ?? [])
        )];
        if (ids.length === 0) {
            setProjects([]);
            return;
        }

        setLoading(true);
        Promise.all(
            ids.map(id =>
                sdk.getProject({ client, path: { id } })
                    .then(res => res?.data ?? res)
                    .catch(() => null)
            )
        ).then(results => {
            const loaded = results.filter(Boolean);
            setProjects(loaded);
            setLoading(false);

            // Expand all groups by default once projects are loaded.
            const groups = new Set(loaded.map(r => r.funded_by ?? delegation.id));
            setOpenItems([...groups]);
        });
    }, [opened, delegation?.id]);

    // Group all projects by funded_by, sorted with direct projects first.
    const allGroups = useMemo(() => {
        const groups = new Map();
        for (const project of projects) {
            const key = project.funded_by ?? delegation.id;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(project);
        }
        return [...groups.entries()].sort(([a], [b]) => {
            if (a === delegation.id) return -1;
            if (b === delegation.id) return 1;
            return (delegationNames.get(a) ?? a).localeCompare(delegationNames.get(b) ?? b);
        });
    }, [projects, delegation.id]);

    // Apply search: filter rows within each group, drop empty groups.
    const filteredGroups = useMemo(() => {
        if (!query) return allGroups;
        return allGroups
            .map(([funderId, reqs]) => [
                funderId,
                reqs.filter(req => projectMatchesQuery(req, groupLabel(funderId), query)),
            ])
            .filter(([, reqs]) => reqs.length > 0);
    }, [allGroups, query]);

    // Derive all group IDs for expand/collapse all.
    const allGroupIDs = filteredGroups.map(([id]) => id);
    const allExpanded = allGroupIDs.length > 0 && allGroupIDs.every(id => openItems.includes(id));

    const toggleExpandAll = () => {
        setOpenItems(allExpanded ? [] : allGroupIDs);
    };

    // When search narrows the results, auto-expand matching groups so content is immediately visible.
    useEffect(() => {
        if (query) setOpenItems(allGroupIDs);
    }, [query]);

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={`Project Breakdown: ${delegation.name}`}
            size="90%"
            styles={{ body: { maxHeight: '80vh', overflowY: 'auto' } }}
        >
            {loading && <Stack align="center" py="xl"><Loader /></Stack>}

            {!loading && projects.length === 0 && (
                <Text c="dimmed" ta="center" py="xl">No active projects found.</Text>
            )}

            {!loading && projects.length > 0 && (
                <Stack gap="sm">

                    {/* Toolbar: search + expand/collapse all */}
                    <Group justify="space-between" align="flex-end">
                        <TextInput
                            style={{ flex: 1 }}
                            size="xs"
                            placeholder="Search reason, status, requester, resources…"
                            leftSection={<Search size="14" />}
                            rightSection={query && (
                                <ActionIcon size="xs" variant="subtle" onClick={() => setQuery('')}>
                                    <X size="12" />
                                </ActionIcon>
                            )}
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                        />
                        <Button size="xs" variant="subtle" onClick={toggleExpandAll}>
                            {allExpanded ? 'Collapse All' : 'Expand All'}
                        </Button>
                    </Group>

                    {filteredGroups.length === 0 && (
                        <Text c="dimmed" ta="center" py="md">No projects match "{query}".</Text>
                    )}

                    <Accordion
                        variant="separated"
                        chevronPosition="left"
                        multiple
                        value={openItems}
                        onChange={setOpenItems}
                    >
                        {filteredGroups.map(([funderId, reqs]) => (
                            <Accordion.Item key={funderId} value={funderId}>

                                <Accordion.Control>
                                    <GroupHeader
                                        name={groupLabel(funderId)}
                                        reqs={reqs}
                                        projectConfig={projectConfig}
                                    />
                                </Accordion.Control>

                                <Accordion.Panel>
                                    <Table size="xs" striped highlightOnHover>
                                        <Table.Thead>
                                            <Table.Tr>
                                                <Table.Th>Status</Table.Th>
                                                {(projectConfig?.projects ?? []).map(r => (
                                                    <Table.Th key={r.id}>
                                                        {r.name}{r.unit ? ` (${r.unit})` : ''}
                                                    </Table.Th>
                                                ))}
                                                <Table.Th>Reason</Table.Th>
                                                <Table.Th>Expires</Table.Th>
                                            </Table.Tr>
                                        </Table.Thead>
                                        <Table.Tbody>
                                            {reqs.map(req => {
        const style = statusStyle(req.status);
        return (
                                                    <Table.Tr key={req.id}>
                                                        <Table.Td>
                                                            <Badge size="xs" color={style.color} variant={style.variant}>
                                                                {statusLabel(req.status)}
                                                            </Badge>
                                                        </Table.Td>
                                                        {(projectConfig?.projects ?? []).map(r => (
                                                            <Table.Td key={r.id}>
                                                                {req.quota?.[r.id] ?? 0}
                                                            </Table.Td>
                                                        ))}
                                                        <Table.Td>
                                                            <Text size="xs" truncate maw={220}>{req.reason}</Text>
                                                        </Table.Td>
                                                        <Table.Td>
                                                            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                                                                {formatRelativeDate(req.termination_date)}
                                                            </Text>
                                                        </Table.Td>
                                                    </Table.Tr>
                                                );
    })}
                                        </Table.Tbody>
                                    </Table>
                                </Accordion.Panel>

                            </Accordion.Item>
                        ))}
                    </Accordion>
                </Stack>
            )}
        </Modal>
    );
}
