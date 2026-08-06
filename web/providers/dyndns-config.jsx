import { createContext, useContext } from 'react';
import { useRemoteConfig } from './remote-config.jsx';

// The dynamic-zones API's public config. Strict: everything that reads this
// context lives in the dyndns section, which cannot work without that API.
export const DynDnsConfigContext = createContext(null);

export function useDynDnsConfig() {
    const context = useContext(DynDnsConfigContext);
    if (!context) {
        throw new Error('useDynDnsConfig must be used within a DynDnsConfigProvider');
    }
    return context;
}

export function DynDnsConfigProvider({ children }) {
    const value = useRemoteConfig(window?.appconfig?.dynamicZonesBaseUrl);
    return (
        <DynDnsConfigContext.Provider value={value}>
            {children}
        </DynDnsConfigContext.Provider>
    );
}
