import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loading, LoadError, useApiMutation } from '/helper/query-state.jsx';
import { useConfirm } from '/providers/confirm.jsx';
import {
    Alert, Badge, Button, Checkbox, Code, CopyButton, Divider, Group, Paper,
    Stack, Text, Title,
} from '@mantine/core';

// One scope's tokens: its own query, its own error state, its own create form.
//
// Per scope and not per page, because the scopes are separate services. A
// backend that is restarting must take out its own panel and nothing else —
// with one shared query the page would be all-or-nothing, and someone coming
// here to revoke a credential would be told to try again later for a service
// that is answering fine.
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

    async function revoke(tokenId) {
        const ok = await confirm({
            title: 'Delete API token?',
            confirmLabel: 'Delete token',
            // Names the scope: with several lists on one page, "any client
            // still using this token" is not enough to tell which credential
            // is about to stop working.
            message: `Any client still using this ${scope.label} token will immediately stop working. This cannot be undone.`,
        });
        if (ok) deleteMutation.mutate(tokenId);
    }

    const tokens = tokensQuery.data ?? [];

    return (
        <Paper shadow="sm" radius="md" withBorder>
            <Stack gap="md">
                <Group p="md" pb={0} justify="space-between" align="flex-start" wrap="nowrap">
                    <Stack gap={4}>
                        <Group gap="xs" align="center">
                            <Title order={4}>{scope.label}</Title>
                            {/* The prefix is what tells two tokens apart in a
                                script, so it belongs next to the heading and
                                not only in the rows below. */}
                            <Badge variant="light" style={{ textTransform: 'none' }}>{scope.prefix}…</Badge>
                        </Group>
                        <Text size="sm" c="dimmed">{scope.description}</Text>
                    </Stack>
                </Group>

                <Group p="md" pt={0} align="center">
                    <Button onClick={() => createMutation.mutate()} loading={createMutation.isPending}>
                        Create token
                    </Button>
                    <Checkbox
                        label="Read-only"
                        checked={readOnly}
                        onChange={e => setReadOnly(e.currentTarget.checked)}
                    />
                </Group>

                {tokensQuery.isPending && <div style={{ padding: '0 1rem 1rem' }}><Loading size="sm" /></div>}

                {tokensQuery.isError && (
                    <div style={{ padding: '0 1rem 1rem' }}>
                        <LoadError query={tokensQuery} title={`Could not load ${scope.label} tokens`} />
                    </div>
                )}

                {!tokensQuery.isPending && !tokensQuery.isError && tokens.length === 0 && (
                    <Text px="md" pb="md" c="dimmed">No tokens yet.</Text>
                )}

                {tokens.map(t => (
                    <TokenRow
                        key={t.id}
                        token={t}
                        secret={revealed[t.id]}
                        onRevoke={() => revoke(t.id)}
                    />
                ))}
            </Stack>
        </Paper>
    );
}

function TokenRow({ token, secret, onRevoke }) {
    return (
        <div>
            <Divider />
            <Group p="md" justify="space-between" align="flex-start">
                <Stack gap="xs" style={{ flex: 1 }}>
                    {secret ? (
                        <Alert color="green" title="Copy this token now">
                            <Stack gap="xs">
                                <Code style={{ wordBreak: 'break-all' }}>{secret}</Code>
                                <Group gap="xs">
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
                            </Stack>
                        </Alert>
                    ) : (
                        <Text fw={600}>{token.token_prefix ? `${token.token_prefix}…` : `Token #${token.id}`}</Text>
                    )}
                    <Text size="sm" c="dimmed">ID: {token.id}</Text>
                    <Text size="sm" c="dimmed">Expires: {formatMoment(token.expires_at)}</Text>
                    <Text size="sm">Mode: {token.read_only ? '🔒 read-only' : '✏️ read-write'}</Text>
                </Stack>
                <Button color="red" size="sm" onClick={onRevoke}>Delete</Button>
            </Group>
        </div>
    );
}

// Local on purpose: this page spans both sections, so it must not import the
// projects section's date helper and pull that module into its chunk.
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
    return d.toLocaleString();
}
