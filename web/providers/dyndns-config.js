import { html } from 'htm/preact';
import { createContext } from 'preact';
import { useState, useEffect, useContext } from 'preact/hooks';

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

    return html`
        <${DynDnsConfigContext.Provider} value=${{ config, error }}>
            ${children}
        <//>
    `;
}