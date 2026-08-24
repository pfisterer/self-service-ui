import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loading, LoadError, useApiMutation } from '/helper/query-state.jsx';
import { useConfirm } from '/providers/confirm.jsx';
import { Trash2 } from 'lucide-react';
import {
    ActionIcon, Alert, Badge, Button, Checkbox, Code, CopyButton, Group, Paper,
    Stack, Table, Text,
} from '@mantine/core';

// One scope's tokens: its own query, its own error state, its own create form.
//
// Per scope and not per page, because the scopes are separate services. A
// backend that is restarting must take out its own tab and nothing else — with
// one shared query the page would be all-or-nothing, and someone coming here to
// revoke a credential would be told to try again later for a service that is
// answering fine.
//
// `scope.api` is a three-function adapter ({ list, create, remove }) that the
// page builds from the section facades. That keeps this component ignorant of
// both SDKs: the two services really do differ (one wraps the created token,
// the other returns it directly, and their subjects are not even the same
// claim), and the place to absorb that is the adapter, not the view.
export function TokenScopePanel({ scope }) {
    const confirm = useConfirm();
    const [readOnly, setReadOnly] = useState(false);
    // The server stores only a hash, so a token exists in readable form exactly
    // once: in the response that created it. Kept for this page view (id →
    // secret) and gone on reload — the one piece of state here that is NOT
    // server state, so it cannot live in the query cache.
    const [revealed, setRevealed] = useState({});

    const tokensQuery = useQuery({
        queryKey: scope.queryKey,
        queryFn: () => scope.api.list(),
    });

    const createMutation = useApiMutation({
        mutationFn: () => scope.api.create({ readOnly }),
        invalidates: [scope.queryKey],
        onSuccess: (created) => {
            if (created?.token_string) {
                setRevealed(prev => ({ ...prev, [created.id]: created.token_string }));
            }
        },
    });

    const deleteMutation = useApiMutation({
        mutationFn: (id) => scope.api.remove(id),
        invalidates: [scope.queryKey],
    });

    async function revoke(token) {
        const ok = await confirm({
            title: 'Delete API token?',
            confirmLabel: 'Delete token',
            // Names the token: with a compact table there is no other way to be
            // sure which row the dialog is about.
            message: `Any client still using ${token.token_prefix || `token #${token.id}`} will immediately stop working. This cannot be undone.`,
        });
        if (ok) deleteMutation.mutate(token.id);
    }

    const tokens = tokensQuery.data ?? [];

    return (
        <Paper shadow="sm" radius="md" withBorder p="md">
            <Stack gap="sm">
                {/* Heading, prefix and the create controls on one line: the
                    scope is already named by the tab above, so this row only
                    has to say how its tokens look and offer a new one. */}
                <Group justify="space-between" align="center" wrap="wrap" gap="xs">
                    <Group gap="xs" align="center">
                        <Badge variant="light" style={{ textTransform: 'none' }}>{scope.prefix}…</Badge>
                        <Text size="sm" c="dimmed">{scope.description}</Text>
                    </Group>
                    <Group gap="sm" align="center" wrap="nowrap">
                        <Checkbox
                            size="sm"
                            label="Read-only"
                            checked={readOnly}
                            onChange={e => setReadOnly(e.currentTarget.checked)}
                        />
                        <Button size="sm" onClick={() => createMutation.mutate()} loading={createMutation.isPending}>
                            Create token
                        </Button>
                    </Group>
                </Group>

                {tokensQuery.isPending && <Loading size="sm" />}

                {tokensQuery.isError && (
                    <LoadError query={tokensQuery} title={`Could not load ${scope.label} tokens`} />
                )}

                {!tokensQuery.isPending && !tokensQuery.isError && (
                    tokens.length === 0
                        ? <Text size="sm" c="dimmed">No tokens yet.</Text>
                        : (
                            <Table verticalSpacing="xs" horizontalSpacing="sm" highlightOnHover>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th w={60}>ID</Table.Th>
                                        <Table.Th>Token</Table.Th>
                                        <Table.Th w={120}>Mode</Table.Th>
                                        <Table.Th w={150}>Created</Table.Th>
                                        <Table.Th w={150}>Expires</Table.Th>
                                        <Table.Th w={50} />
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {tokens.map(t => (
                                        <TokenRows
                                            key={t.id}
                                            token={t}
                                            secret={revealed[t.id]}
                                            onRevoke={() => revoke(t)}
                                        />
                                    ))}
                                </Table.Tbody>
                            </Table>
                        )
                )}
            </Stack>
        </Paper>
    );
}

// A token is one row — plus a second, full-width one for the few minutes after
// it was created, while its secret is still readable. The secret is far too
// long for a cell, and it is also the one thing on this page that must not be
// easy to miss.
function TokenRows({ token, secret, onRevoke }) {
    return (
        <>
            <Table.Tr>
                <Table.Td c="dimmed">{token.id}</Table.Td>
                <Table.Td ff="monospace">{token.token_prefix ? `${token.token_prefix}…` : '—'}</Table.Td>
                <Table.Td>
                    <Badge size="sm" variant="light" color={token.read_only ? 'gray' : 'blue'}>
                        {token.read_only ? 'read-only' : 'read-write'}
                    </Badge>
                </Table.Td>
                <Table.Td c="dimmed">{formatMoment(token.created_at)}</Table.Td>
                <Table.Td>{formatMoment(token.expires_at)}</Table.Td>
                <Table.Td>
                    <ActionIcon color="red" variant="subtle" onClick={onRevoke}
                        aria-label={`Delete token ${token.token_prefix || token.id}`}>
                        <Trash2 size={16} />
                    </ActionIcon>
                </Table.Td>
            </Table.Tr>
            {secret && (
                <Table.Tr>
                    <Table.Td colSpan={6}>
                        <Alert color="green" title="Copy this token now" p="xs">
                            <Group gap="xs" wrap="wrap">
                                <Code style={{ wordBreak: 'break-all' }}>{secret}</Code>
                                <CopyButton value={secret}>
                                    {({ copied, copy }) => (
                                        <Button size="xs" variant="light" onClick={copy}>
                                            {copied ? 'Copied' : 'Copy token'}
                                        </Button>
                                    )}
                                </CopyButton>
                                <Text size="xs" c="dimmed">
                                    Stored only as a hash — reload this page and it is gone for good.
                                </Text>
                            </Group>
                        </Alert>
                    </Table.Td>
                </Table.Tr>
            )}
        </>
    );
}

// Local on purpose: this page spans both sections, so it must not import the
// projects section's date helper and pull that module into its chunk.
//
// Date plus hours and minutes, not toLocaleString: seconds are noise in a
// table, and the times that matter here (was this issued today, does it expire
// this afternoon) are readable without them.
//
// Both APIs send RFC 3339. A token that never expires would arrive as the zero
// time, which reads as the year 1 — neither service issues those today (both
// apply a configured TTL), and if one ever does, "never" is the honest word for
// it rather than a date from antiquity.
function formatMoment(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    if (d.getFullYear() <= 1) return 'never';
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}
