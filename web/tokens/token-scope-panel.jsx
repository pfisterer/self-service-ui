import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loading, LoadError, useApiMutation } from '/helper/query-state.jsx';
import { useConfirm } from '/providers/confirm.jsx';
import { Trash2 } from 'lucide-react';
import {
    ActionIcon, Alert, Badge, Button, Checkbox, Code, CopyButton, Group, Paper,
    Select, Stack, Table, Text, TextInput,
} from '@mantine/core';
import { formatDateTime } from '../format-date.js';

// The lifetimes offered, in the hours the API takes. -1 is "never expires",
// the same value the shared library calls NeverExpires, so nothing in between
// has to translate.
//
// Hard-coded rather than read from the server: both APIs cap a request at a
// year and both permit "never", so this list is exactly what they accept today.
// A deployment that configures a shorter maximum, or forbids "never", will
// refuse the request with a message saying so — honest, but the UI would then be
// offering something it cannot deliver. Exposing the policy through the two
// config endpoints the UI already fetches is the fix, and is written down as
// such rather than guessed at here.
const LIFETIMES = [
    { value: '720', label: '30 days' },
    { value: '2160', label: '90 days' },
    { value: '8760', label: '1 year' },
    { value: '-1', label: 'Never expires' },
];
const DEFAULT_LIFETIME = '8760';

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
    const [description, setDescription] = useState('');
    const [lifetime, setLifetime] = useState(DEFAULT_LIFETIME);
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
        mutationFn: () => scope.api.create({
            readOnly,
            description,
            ttlHours: Number(lifetime),
        }),
        invalidates: [scope.queryKey],
        onSuccess: (created) => {
            if (created?.token_string) {
                setRevealed(prev => ({ ...prev, [created.id]: created.token_string }));
            }
            // Only the note is cleared: the next token is a different one and
            // needs its own, while lifetime and read-only are usually the same
            // choice again.
            setDescription('');
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
                        {/* The note is what turns "three tokens, two dates" into
                            something a person can act on months later, so it is
                            offered here rather than hidden behind a dialog —
                            optional, but in front of you when you create one. */}
                        <TextInput
                            size="sm"
                            w={240}
                            placeholder="What is this for?"
                            maxLength={100}
                            value={description}
                            onChange={e => setDescription(e.currentTarget.value)}
                        />
                        <Select
                            size="sm"
                            w={150}
                            data={LIFETIMES}
                            value={lifetime}
                            onChange={value => setLifetime(value ?? DEFAULT_LIFETIME)}
                            allowDeselect={false}
                            comboboxProps={{ withinPortal: true }}
                        />
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
                                        <Table.Th w={50}>ID</Table.Th>
                                        <Table.Th w={170}>Token</Table.Th>
                                        <Table.Th>Description</Table.Th>
                                        <Table.Th w={110}>Mode</Table.Th>
                                        {/* Next to each other on purpose: "made
                                            a year ago, never used" is the whole
                                            answer to "can I revoke this?". */}
                                        <Table.Th w={130}>Created</Table.Th>
                                        <Table.Th w={130}>Last used</Table.Th>
                                        <Table.Th w={130}>Expires</Table.Th>
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
                    {token.description
                        ? <Text size="sm">{token.description}</Text>
                        : <Text size="sm" c="dimmed">—</Text>}
                </Table.Td>
                <Table.Td>
                    <Badge size="sm" variant="light" color={token.read_only ? 'gray' : 'blue'}>
                        {token.read_only ? 'read-only' : 'read-write'}
                    </Badge>
                </Table.Td>
                <Table.Td c="dimmed">{formatMoment(token.created_at)}</Table.Td>
                {/* Dimmed when it has never been used, because that is the case
                    worth spotting: nothing depends on this token. */}
                <Table.Td c={neverHappened(token.last_used_at) ? 'dimmed' : undefined}>
                    {neverHappened(token.last_used_at) ? 'never' : formatMoment(token.last_used_at)}
                </Table.Td>
                {/* Both columns say "never" for an absent time, and they mean
                    different things — never used, never expires. The headers
                    carry that; the cell should not invent wording for it. */}
                <Table.Td>
                    {neverHappened(token.expires_at) ? 'never' : formatMoment(token.expires_at)}
                </Table.Td>
                <Table.Td>
                    <ActionIcon color="red" variant="subtle" onClick={onRevoke}
                        aria-label={`Delete token ${token.token_prefix || token.id}`}>
                        <Trash2 size={16} />
                    </ActionIcon>
                </Table.Td>
            </Table.Tr>
            {secret && (
                <Table.Tr>
                    <Table.Td colSpan={8}>
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

// neverHappened covers the two ways "there is no such moment" can arrive: null
// from the current APIs, and Go's zero time (the year 1) from an older one that
// serialised a time.Time it had no value for. The second case matters during a
// rollout, when the UI is newer than a backend for a few minutes.
function neverHappened(value) {
    if (value === null || value === undefined || value === '') return true;
    const d = new Date(value);
    return !Number.isNaN(d.getTime()) && d.getFullYear() <= 1;
}

// The shared formatter, not a local copy: this page used to keep its own so it
// would not pull the projects section's module into its chunk, and the result
// was a second answer to "how does a date read here". format-date.js has no
// section behind it and no dependencies, so there is nothing left to avoid.
//
// "No such moment" stays neverHappened's business — callers ask that first, so
// anything arriving here is meant to be a date.
const formatMoment = formatDateTime;
