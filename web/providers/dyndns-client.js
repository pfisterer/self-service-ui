import { useState, useEffect, useContext } from 'preact/hooks';
import { createContext } from 'preact';
import { html } from 'htm/preact';
import { useAuth } from './auth.js';
import { useDynDnsConfig } from './dyndns-config.js';

export const DynDnsClientContext = createContext(null);

export function useDynDnsClient() {
    const context = useContext(DynDnsClientContext);
    if (!context) {
        throw new Error('useDynDnsClient must be used within a DynDnsClientProvider');
    }
    return context;
};

export function DynDnsClientProvider({ children }) {
    const auth = useAuth()
    const dyndnsConfig = useDynDnsConfig();
    const [client, setClient] = useState();

    const authLoading = auth?.loading;

    useEffect(() => {
        if (!window.dynamicZonesClient) {
            return;
        }

        const client = window.dynamicZonesClient.client
        client.setConfig({ baseUrl: window.appconfig.dynamicZonesBaseUrl });

        // Update the Authorization header of the client on each request
        const authInterceptorId = client.interceptors.request.use(async (request, options) => {
            const currentToken = auth?.user?.access_token;
            if (currentToken) {
                request.headers.set('Authorization', `Bearer ${currentToken}`);
            } else {
                request.headers.delete('Authorization');
            }
            return request;
        });

        setClient(client);
        return () => { client.interceptors.request.eject(authInterceptorId); };
    }, [authLoading, window.DynamicZonesClient, dyndnsConfig]);

    if (!client) {
        return html`<p>Loading Dynamic DNS client...</p>`;
    }

    return html`
        <${DynDnsClientContext.Provider} value=${client}>
            ${children}
        <//>
    `;
}