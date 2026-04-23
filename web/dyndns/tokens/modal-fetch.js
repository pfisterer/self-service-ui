import { useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { Button, Modal, TextInput, Stack, Group, Box, Text, CopyButton, Loader, Alert } from '@mantine/core';
import { AlertCircle, Copy, Check } from 'lucide-preact';

export function FetchModal({ sdk, client, token, method = "GET" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);

  const handleFetch = async () => {
    setLoading(true);
    setResponse(null);
    setError(null);

    try {
      if (typeof sdk?.listZones !== 'function') {
        throw new Error('SDK method listZones is not available.');
      }
      const res = await sdk.listZones({ client });
      setResponse(res?.data ?? null);
    } catch (err) {
      setError(err.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const sdkCommand = `sdk.listZones({ client })`;

  return html`
    <div>
      <${Button} onClick=${() => setIsOpen(true)} color="blue">
        Open API Fetch Modal
      <//>

      <${Modal} opened=${isOpen} onClose=${() => setIsOpen(false)} title="API Request" size="lg">
        <${Stack} gap="md">
          <${TextInput} label="Token" value=${token} readOnly />
          <${TextInput} label="Method" value=${method} readOnly />

          <${Button} onClick=${handleFetch} disabled=${loading} color="green">
            ${loading ? html`<${Loader} size="xs" mr="xs" />` : ''}
            ${loading ? "Fetching..." : "Fetch"}
          <//>

          <${Box} style=${{ maxHeight: '300px', overflowY: 'auto', backgroundColor: '#f5f5f5', padding: '12px', borderRadius: '4px' }}>
            ${loading && html`<${Loader} size="sm" />`}
            ${error && html`<${Alert} icon=${html`<${AlertCircle} size="16" />`} title="Error" color="red">${error}<//>}`}
            
            <${Stack} gap="sm">
              <div>
                <${Text} size="sm" fw=${600} mb="xs">SDK Call:<//>
                <${Group} gap="xs">
                  <code style=${{ backgroundColor: '#fff', padding: '8px', borderRadius: '4px', flex: 1, fontSize: '12px', whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
                    ${sdkCommand}
                  </code>
                  <${CopyButton} value=${sdkCommand}>
                    ${({ copied }) => html`
                      <${Button} size="xs" color=${copied ? 'green' : 'blue'}>
                        ${copied ? html`<${Check} size="14" />` : html`<${Copy} size="14" />`}
                      <//>
                    `}
                  <//>
                <//>
              </div>

              ${response && html`
                <div>
                  <${Text} size="sm" fw=${600} mb="xs">Response:<//>
                  <pre style=${{ backgroundColor: '#fff', padding: '8px', borderRadius: '4px', fontSize: '12px', whiteSpace: 'pre-wrap', wordWrap: 'break-word', margin: 0 }}>
                    ${JSON.stringify(response, null, 2)}
                  </pre>
                </div>
              `}
            <//>
          <//>
        <//>
      <//>
    </div>
  `;
}
