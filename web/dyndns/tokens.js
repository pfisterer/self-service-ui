import { useState, useEffect } from 'preact/hooks';
import { html } from 'htm/preact';
import { useClient } from '/providers/client.js';
import { FetchModal } from './tokens/modal-fetch.js';
import { Delayed } from '../helper/delayed.js';
import { Container, Title, Button, Checkbox, Stack, Group, Paper, Text, Loader, Alert, Divider } from '@mantine/core';
import { AlertCircle } from 'lucide-preact';

export function Tokens() {
    const { client, sdk } = useClient('dyndns');
    const [tokens, setTokens] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [readOnly, setReadOnly] = useState(false);

    useEffect(() => {
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await sdk.getV1Tokens({ client });
                setTokens(res?.data?.tokens || []);

                // Set error when status code is not 2xx
                if (res.response.status < 200 || res.response.status >= 300) {
                    setError(new Error(`Failed to fetch tokens: ${res.response.status} ${res.response.statusText} @ ${res.request.url}`));
                }

            } catch (e) {
                setError(e);
            } finally {
                setLoading(false);
            }
        })();
    }, [client]);

    async function createToken() {
        setLoading(true);
        setError(null);
        try {
            const res = await await sdk.postV1Tokens({
                client,
                body: { read_only: readOnly },
                headers: {
                    "Content-Type": "application/json"
                }
            });

            if (res?.data?.token) {
                setTokens(prev => [...prev, res.data.token]);
            }
        } catch (e) {
            setError(e);
        } finally {
            setLoading(false);
        }
    }

    async function deleteToken(tokenId) {
        setLoading(true);
        setError(null);
        try {
            await await sdk.deleteV1TokensById({ path: { id: tokenId }, client });
            setTokens(prev => prev.filter(t => t.id !== tokenId));
        } catch (e) {
            setError(e);
        } finally {
            setLoading(false);
        }
    }

    if (loading) return html`<${Delayed}><${Loader} size="lg" /><//>`;
    if (error) return html`<${Alert} icon=${html`<${AlertCircle} size="16" />`} title="Error" color="red">${error.message}<//>`;

    const endpoint = new URL("/v1/zones/", window.appconfig.dynamicZonesBaseUrl).toString();

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
                                        <${FetchModal} endpoint=${endpoint} token=${t.token_string} />
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
