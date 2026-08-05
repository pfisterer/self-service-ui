import { useState, useEffect } from 'react';
import { useClient } from '/providers/client.jsx';
import { useErrorModal } from '/providers/error-modal.jsx';
import { useConfirm } from '/providers/confirm.jsx';
import { Delayed } from '../helper/delayed.jsx';
import { Container, Title, Button, Checkbox, Stack, Group, Paper, Text, Loader, Divider, Alert, Code, CopyButton } from '@mantine/core';

const sdkError = (res) => res?.error?.detail ?? res?.error?.error ?? res?.error?.message ?? (res?.error ? String(res.error) : null);

export function Tokens() {
    const { client, sdk } = useClient('dyndns');
    const { showError } = useErrorModal();
    const confirm = useConfirm();
    const [tokens, setTokens] = useState([]);
    const [loading, setLoading] = useState(true);
    const [readOnly, setReadOnly] = useState(false);
    // The server stores only a hash, so a token exists in readable form exactly
    // once: in the response that created it. Keep those for this page view (id →
    // token) and say plainly that they are gone after a reload.
    const [revealed, setRevealed] = useState({});

    useEffect(() => {
        (async () => {
            setLoading(true);
            const res = await sdk.listTokens({ client });
            const err = sdkError(res);
            if (err) { showError(err); } else { setTokens(res?.data?.tokens || []); }
            setLoading(false);
        })();
    }, [client]);

    async function createToken() {
        setLoading(true);
        const res = await sdk.createToken({
            client,
            body: { read_only: readOnly },
            headers: { "Content-Type": "application/json" }
        });
        const err = sdkError(res);
        if (err) {
            showError(err);
        } else if (res?.data?.token) {
            const created = res.data.token;
            setTokens(prev => [...prev, created]);
            if (created.token_string) {
                setRevealed(prev => ({ ...prev, [created.id]: created.token_string }));
            }
        }
        setLoading(false);
    }

    async function deleteToken(tokenId) {
        const ok = await confirm({
            title: 'Delete API token?',
            confirmLabel: 'Delete token',
            message: 'Any client still using this token will immediately stop working. This cannot be undone.',
        });
        if (!ok) return;
        setLoading(true);
        const res = await sdk.deleteToken({ path: { id: tokenId }, client });
        const err = sdkError(res);
        if (err) { showError(err); } else { setTokens(prev => prev.filter(t => t.id !== tokenId)); }
        setLoading(false);
    }

    if (loading) return (<Delayed><Loader size="lg" /></Delayed>);

    return (
        <Container size="lg" py="xl">
            <Stack gap="lg">
                <Title order={2}>API Tokens</Title>

                <Paper shadow="sm" radius="md" withBorder>
                    <Stack gap="md">
                        <Group p="md" align="center">
                            <Button onClick={createToken}>Create Token</Button>
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
