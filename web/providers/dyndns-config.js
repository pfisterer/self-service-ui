import { html } from 'htm/preact';
import { createContext } from 'preact';
import { useState, useEffect, useContext } from 'preact/hooks';
import { Delayed } from '../components/helper/delayed.js';

export const DynDnsConfigContext = createContext(null);

export function useDynDnsConfig() {
    const context = useContext(DynDnsConfigContext);
    if (!context) {
        throw new Error('useDynDnsConfig must be used within a DynDnsConfigProvider');
    }
    return context;
};

export function DynDnsConfigProvider({ children }) {
    const [config, setConfig] = useState();
    const [error, setError] = useState();
    const configUrl = new URL('config.json', window.appconfig.dynamicZonesBaseUrl).toString();

    useEffect(() => {
        (async () => {
            try {
                setConfig(await (await fetch(configUrl)).json());
            } catch (error) {
                setError(error);
            }
        })();
    }, [configUrl]);

    if (error) {
        return html`
            <div class="container is-max-desktop pt-6">
                <div class="notification is-danger has-text-white">
                    <h3 class="title is-4">❌ Configuration Load Error</h3>
                    <p>
                        The application failed to load its core dynamic DNS configuration. Accessing the service is not possible at this time.
                    </p>
                    <div class="content mt-3">
                        <p class="is-size-7"><strong>Details:</strong> ${error.message}</p>
                        <p class="is-size-7"><strong>URL:</strong> <a href="${configUrl}">${configUrl}</a></p>
                    </div>
                    <p class="mt-3">Please check the service status or refresh the page.</p>
                </div>
            </div>
        `;
    }

    if (!config) {
        return html`
            <${Delayed}>
                <div class="container">
                    <div class="box is-loading-box">
                        <p class="is-size-5 has-text-centered has-text-grey">
                            ⚙️ Loading application configuration...
                        </p>
                        <progress class="progress is-small is-primary" max="100"></progress>
                        <p class="has-text-centered has-text-grey is-size-7">
                            Fetching configuration from ${configUrl}
                        </p>
                    </div>
                </div>
            <//>
        `;
    }

    return html`
        <${DynDnsConfigContext.Provider} value=${config}>
            ${children}
        <//>
    `;
}