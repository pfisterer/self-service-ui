import { createContext, useState, useEffect, useContext } from 'react';

// Mirrors DynDnsConfigProvider for the Cloud API (openstack-management-api):
// loads its public /config.json once and exposes it via context, so consumers
// (e.g. the footer) reuse the value instead of fetching it themselves.
export const CloudConfigContext = createContext(null);

export function useCloudConfig() {
    // Lenient (unlike useDynDnsConfig): the Cloud API may be unconfigured.
    return useContext(CloudConfigContext) ?? { config: undefined, error: undefined };
}

export function CloudConfigProvider({ children }) {
    const [config, setConfig] = useState();
    const [error, setError] = useState();
    const baseUrl = window?.appconfig?.cloudResourcesBaseUrl;

    useEffect(() => {
        if (!baseUrl) return; // Cloud API not configured (e.g. staging) -> nothing to load.
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(new URL('config.json', baseUrl).toString(), { signal: AbortSignal.timeout(5000) });
                if (!cancelled && res.ok) setConfig(await res.json());
            } catch (e) {
                if (!cancelled) setError(e);
            }
        })();
        return () => { cancelled = true; };
    }, [baseUrl]);

    return (
        <CloudConfigContext.Provider value={{ config, error }}>
            {children}
        </CloudConfigContext.Provider>
    );
}
