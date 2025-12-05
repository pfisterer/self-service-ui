import { useState, useEffect } from 'preact/hooks';
import { html } from 'htm/preact';
import { FetchModal } from './modal-fetch.js';
import { Delayed } from '../helper/delayed.js';
import { useDynDnsClient } from '../../providers/dyndns-client.js';

export function ListTokens() {
    const [tokens, setTokens] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [readOnly, setReadOnly] = useState(false);
    const { client, sdk } = useDynDnsClient();

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

    if (loading) return html`<${Delayed}><p>Loading tokens...</p><//>`;
    if (error) return html`<p>Error: ${error.message}</p>`;

    const endpoint = new URL("/v1/zones/", window.appconfig.dynamicZonesBaseUrl).toString();

    return html`
        <section class="mt-5">
            <div class="container">
                <h1 class="title">API Tokens</h1>

                <div class="panel">
                    <div class="panel-heading">API Tokens</div>

                    <div class="panel-block" style="gap: 10px; align-items: center;">
                        <button class="button is-primary" onClick=${createToken}>Create Token</button>
                        <label>
                            <input type="checkbox" checked=${readOnly}
                                onChange=${e => setReadOnly(e.target.checked)} />
                            Read-only
                        </label>
                    </div>

                    ${tokens.length === 0 && html`<div class="panel-block">No tokens found.</div>`}

                    ${tokens.map(t => html`
                        <div class="panel-block">
                            <div style="display:flex; justify-content: space-between; width:100%;">
                                <div>
                                    <strong>${t.token_string}</strong> (ID: ${t.id})<br/>
                                    Expires: ${t.expires_at}<br/>
                                    Mode: ${t.read_only ? "🔒 read-only" : "✏️ read-write"}
                                </div>
                                <${FetchModal} endpoint=${endpoint} token=${t.token_string} />
                                <button class="button is-danger is-small" onClick=${() => deleteToken(t.id)}>Delete</button>
                            </div>
                        </div>
                    `)}
                </div>
            </div>
        </section>
    `;
}
