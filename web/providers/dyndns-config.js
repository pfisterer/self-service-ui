import { useState, useEffect, useContext } from 'preact/hooks';
import { createContext } from 'preact';
import { html } from 'htm/preact';
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
    const configUrl = new URL('/config.json', window.appconfig.dynamicZonesBaseUrl).toString();

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
        return html`<p>Error loading dynamic DNS configuration: ${error.message}</p>`;
    }

    if (!config) {
        return html`<${Delayed}><p>Loading dynamic DNS configuration from ${configUrl}...</p><//>`;
    }

    return html`
        <${DynDnsConfigContext.Provider} value=${config}>
            ${children}
        <//>
    `;
}