import { useState, useEffect } from 'preact/hooks';
import { html } from 'htm/preact';
import { useClient } from '/providers/client.js';
import { useErrorModal } from '/providers/error-modal.js';
import { FetchModal } from './tokens/modal-fetch.js';
import { Delayed } from '../helper/delayed.js';
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

    if (loading) return html`<${Delayed}><${Loader} size="lg" /><//>`;

    return html`
        <${Container} size="lg" py="xl">
            <${Stack} gap="lg">
                <${Title} order=${2}>API Tokens<//>

                <${Paper} shadow="sm" radius="md" withBorder>
                    <${Stack} gap="md">
                        <${Group} p="md" align="center">
                            <${Button} onClick=${createToken}>Create Token<//>
                            <${Checkbox} 
                                label="Read-only" 
                                checked=${readOnly}
                                onChange=${e => setReadOnly(e.currentTarget.checked)}
                            />
                        <//>

                        ${tokens.length === 0 && html`
                            <${Text} p="md" c="dimmed">No tokens found.<//>
                        `}

                        ${tokens.map(t => html`
                            <div>
                                <${Divider} />
                                <${Group} p="md" justify="space-between" align="flex-start">
                                    <${Stack} gap="xs" style=${{ flex: 1 }}>
                                        <${Text} fw=${600}>${t.token_string}<//>
                                        <${Text} size="sm" c="dimmed">ID: ${t.id}<//>
                                        <${Text} size="sm" c="dimmed">Expires: ${t.expires_at}<//>
                                        <${Text} size="sm">Mode: ${t.read_only ? "🔒 read-only" : "✏️ read-write"}<//>
                                    <//>
                                    <${Group} gap="xs">
                                        <${FetchModal} sdk=${sdk} client=${client} token=${t.token_string} />
                                        <${Button} color="red" size="sm" onClick=${() => deleteToken(t.id)}>Delete<//>
                                    <//>
                                <//>
                            </div>
                        `)}
                    <//>
                <//>
            <//>
        <//>
    `;
}
