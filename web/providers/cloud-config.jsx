import { createContext, useContext } from 'react';
import { useRemoteConfig } from './remote-config.jsx';

// The openstack-management-api's public config, loaded the same way as the
// dyndns one (see remote-config.jsx) — consumers such as the footer reuse this
// value instead of fetching it themselves.
export const CloudConfigContext = createContext(null);

export function useCloudConfig() {
    // Lenient (unlike useDynDnsConfig): the Cloud API may be unconfigured, so a
    // consumer outside the provider gets an empty value rather than a throw.
    return useContext(CloudConfigContext) ?? { config: undefined, error: undefined, loading: false };
}

export function CloudConfigProvider({ children }) {
    const value = useRemoteConfig(window?.appconfig?.cloudResourcesBaseUrl);
    return (
        <CloudConfigContext.Provider value={value}>
            {children}
        </CloudConfigContext.Provider>
    );
}
