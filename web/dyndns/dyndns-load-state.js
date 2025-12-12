import { html } from 'htm/preact';
import { Delayed } from '/helper/delayed.js';

export function DynDnsLoadState({ clientLoadError, configLoadError, client, sdk }) {

    // Provide error feedback if module loading failed
    if (clientLoadError || configLoadError) {
        return html`
            <div class="container is-max-desktop pt-6">
                <div class="notification is-danger has-text-white">
                    <h3 class="title is-4 has-text-white">❌ Dynamic DNS Client Setup Failed</h3>

                    <p>Config Loading Error: ${configLoadError?.message}</p>
                    <div class="content mt-3">
                        <p class="is-size-7"><strong>Details:</strong> ${configLoadError?.details}</p>
                    </div>

                    <p>Client Load Error: ${clientLoadError?.message}</p>
                    <div class="content mt-3">
                        <p class="is-size-7"><strong>Details:</strong> ${clientLoadError?.details}</p>
                    </div>
                </div>
            </div>
        `;
    }

    if (!client || !sdk) {
        return html`
            <${Delayed}>
                <div class="container is-max-desktop pt-6">
                    <div class="box is-loading-box">
                        <p class="is-size-5 has-text-centered has-text-grey">
                            ⚙️ Initializing API Client...
                        </p>
    
                        <progress class="progress is-small is-link" max="100">
                        </progress>

                        <p class="has-text-centered has-text-grey is-size-7">
                            Loading SDK modules from remote service
                        </p>

                    </div>
                </div>
            <//>
        `;
    }

}