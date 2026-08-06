import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useZonesApi } from '/dyndns/api-zones.jsx';
import { dyndnsKeys } from '/dyndns/query-keys.js';
import { Loading, LoadError, useApiMutation } from '/helper/query-state.jsx';
import { useConfirm } from '/providers/confirm.jsx';
import { Container, Title, Button, Checkbox, Stack, Group, Paper, Text, Divider, Alert, Code, CopyButton } from '@mantine/core';


export function Tokens() {
    const api = useZonesApi();
    const confirm = useConfirm();
    const [readOnly, setReadOnly] = useState(false);
    // The server stores only a hash, so a token exists in readable form exactly
    // once: in the response that created it. Keep those for this page view (id →
    // token) and say plainly that they are gone after a reload. This is the one
    // piece of state here that is NOT server state — the API can never answer
    // with it again, so it cannot live in the query cache.
    const [revealed, setRevealed] = useState({});

    const tokensQuery = useQuery({
        queryKey: dyndnsKeys.tokens(),
        queryFn: () => api.listTokens(),
        enabled: !!api,
    });

    const createMutation = useApiMutation({
        mutationFn: () => api.createToken({ readOnly }),
        invalidates: [dyndnsKeys.tokens()],
        onSuccess: (created) => {
            if (created?.token_string) {
                setRevealed(prev => ({ ...prev, [created.id]: created.token_string }));
            }
        },
    });

    const deleteMutation = useApiMutation({
        mutationFn: (id) => api.deleteToken(id),
        invalidates: [dyndnsKeys.tokens()],
    });

    async function deleteToken(tokenId) {
        const ok = await confirm({
            title: 'Delete API token?',
            confirmLabel: 'Delete token',
            message: 'Any client still using this token will immediately stop working. This cannot be undone.',
        });
        if (ok) deleteMutation.mutate(tokenId);
    }

    if (!api || tokensQuery.isPending) return <Loading />;
    if (tokensQuery.isError) return <LoadError query={tokensQuery} title="Could not load API tokens" />;

    const tokens = tokensQuery.data ?? [];

    return (
        <Container size="lg" py="xl">
            <Stack gap="lg">
                <Title order={2}>API Tokens</Title>

                <Paper shadow="sm" radius="md" withBorder>
                    <Stack gap="md">
                        <Group p="md" align="center">
                            <Button onClick={() => createMutation.mutate()} loading={createMutation.isPending}>Create Token</Button>
                            <Checkbox
                                label="Read-only"
                                checked={readOnly}
                                onChange={e => setReadOnly(e.currentTarget.checked)}
                            />
                        </Group>

                        {tokens.length === 0 && (
                            <Text p="md" c="dimmed">No tokens found.</Text>
                        )}

                        {tokens.map(t => {
                            const secret = revealed[t.id];
                            return (
                                <div key={t.id}>
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
                                                <Text fw={600}>{t.token_prefix ? `${t.token_prefix}…` : `Token #${t.id}`}</Text>
                                            )}
                                            <Text size="sm" c="dimmed">ID: {t.id}</Text>
                                            <Text size="sm" c="dimmed">Expires: {t.expires_at}</Text>
                                            <Text size="sm">Mode: {t.read_only ? "🔒 read-only" : "✏️ read-write"}</Text>
                                        </Stack>
                                        <Button color="red" size="sm" onClick={() => deleteToken(t.id)}>Delete</Button>
                                    </Group>
                                </div>
                            );
                        })}
                    </Stack>
                </Paper>
            </Stack>
        </Container>
    );
}
