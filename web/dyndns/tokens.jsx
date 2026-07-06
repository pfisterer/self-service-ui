import { useState, useEffect } from 'react';
import { useClient } from '/providers/client.jsx';
import { useErrorModal } from '/providers/error-modal.jsx';
import { FetchModal } from './tokens/modal-fetch.jsx';
import { Delayed } from '../helper/delayed.jsx';
import { Container, Title, Button, Checkbox, Stack, Group, Paper, Text, Loader, Divider } from '@mantine/core';

const sdkError = (res) => res?.error?.detail ?? res?.error?.error ?? res?.error?.message ?? (res?.error ? String(res.error) : null);

export function Tokens() {
    const { client, sdk } = useClient('dyndns');
    const { showError } = useErrorModal();
    const [tokens, setTokens] = useState([]);
    const [loading, setLoading] = useState(true);
    const [readOnly, setReadOnly] = useState(false);

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
        if (err) { showError(err); } else if (res?.data?.token) { setTokens(prev => [...prev, res.data.token]); }
        setLoading(false);
    }

    async function deleteToken(tokenId) {
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

                        {tokens.map(t => (
                            <div key={t.id}>
                                <Divider />
                                <Group p="md" justify="space-between" align="flex-start">
                                    <Stack gap="xs" style={{ flex: 1 }}>
                                        <Text fw={600}>{t.token_string}</Text>
                                        <Text size="sm" c="dimmed">ID: {t.id}</Text>
                                        <Text size="sm" c="dimmed">Expires: {t.expires_at}</Text>
                                        <Text size="sm">Mode: {t.read_only ? "🔒 read-only" : "✏️ read-write"}</Text>
                                    </Stack>
                                    <Group gap="xs">
                                        <FetchModal sdk={sdk} client={client} token={t.token_string} />
                                        <Button color="red" size="sm" onClick={() => deleteToken(t.id)}>Delete</Button>
                                    </Group>
                                </Group>
                            </div>
                        ))}
                    </Stack>
                </Paper>
            </Stack>
        </Container>
    );
}
