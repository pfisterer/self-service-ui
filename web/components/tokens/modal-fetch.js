import { useState } from 'preact/hooks';
import { html } from 'htm/preact';

export function FetchModal({ endpoint, token, method = "GET" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  endpoint = new URL(endpoint).toString();

  const handleFetch = async () => {
    setLoading(true);
    setResponse(null);
    setError(null);

    try {
      const res = await fetch(endpoint, {
        method,
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const data = await res.json();
      setResponse(data);
    } catch (err) {
      setError(err.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const copyCurlToClipboard = () => {
    const curlCommand = `curl -H "Authorization: Bearer ${token}" ${endpoint}`;
    navigator.clipboard.writeText(curlCommand)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      })
      .catch(err => console.error('Failed to copy:', err));
  };

  return html`
    <div>
      <button
        class="button is-primary"
        onClick=${() => setIsOpen(true)}
      >
        Open API Fetch Modal
      </button>

      <div class="modal ${isOpen ? 'is-active' : ''}">
        <div class="modal-background" onClick=${() => setIsOpen(false)}></div>
        <div class="modal-card">
          <header class="modal-card-head">
            <p class="modal-card-title">API Request</p>
            <button class="delete" aria-label="close" onClick=${() => setIsOpen(false)}></button>
          </header>

          <section class="modal-card-body">
            <div class="field">
              <label class="label">Token</label>
              <div class="control">
                <input class="input" type="text" value=${token} readonly />
              </div>
            </div>

            <div class="field">
              <label class="label">Endpoint</label>
              <div class="control">
                <input class="input" type="text" value=${endpoint} readonly />
              </div>
            </div>

            <div class="field">
              <div class="control">
                <button
                  class="button is-success"
                  disabled=${loading}
                  onClick=${handleFetch}
                >
                  ${loading ? "Fetching..." : "Fetch"}
                </button>
              </div>
            </div>

            <div class="box" style="max-height: 300px; overflow:auto;">
              ${loading && html`<p>Loading...</p>`}
              ${error && html`<p class="has-text-danger">${error}</p>`}
              
              <div class="field mt-3" style="display:flex; gap:6px; align-items:center;">
              <strong>cURL:</strong>
              <pre style="background:#f5f5f5; padding:4px; margin:0; margin-left: 10px; white-space: pre-wrap; word-wrap: break-word;">
              curl -H "Authorization: Bearer ${token}" ${endpoint}</pre>
              <button class="button is-small is-info" onClick=${copyCurlToClipboard}>
              ${copied ? "Copied" : "Copy"}
              </button>
              </div>
              
              ${response && html`<pre style="white-space: pre-wrap; word-wrap: break-word;">${JSON.stringify(response, null, 2)}</pre>`}
            </div>
          </section>

          <footer class="modal-card-foot">
            <button class="button" onClick=${() => setIsOpen(false)}>Close</button>
          </footer>
        </div>
      </div>
    </div>
  `;
}
