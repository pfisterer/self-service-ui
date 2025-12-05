import { useState, useEffect, useContext } from 'preact/hooks';
import { createContext } from 'preact';
import { html } from 'htm/preact';
import { Delayed } from '../components/helper/delayed.js';
import { useAuth } from './auth.js';

export const DynDnsClientContext = createContext(null);

export function useDynDnsClient() {
    const context = useContext(DynDnsClientContext);
    if (!context) {
        throw new Error('useDynDnsClient must be used within a DynDnsClientProvider');
    }
    return context;
};

export function DynDnsClientProvider({ children }) {
    const auth = useAuth();
    const [sdk, setSdk] = useState();
    const [client, setClient] = useState();
    const [error, setError] = useState();

    // Load modules from dynamicZonesBaseUrl
    useEffect(() => {
        if (auth?.loading) {
            return;
        }

        (async () => {
            const baseUrl = window.appconfig.dynamicZonesBaseUrl;
            const clientSourceUrl = new URL("client/client.gen.mjs", baseUrl).toString();
            const sdkSourceUrl = new URL("client/sdk.gen.mjs", baseUrl).toString();

            try {
                // Load sdk and client modules
                setSdk(await import( /* @vite-ignore */ sdkSourceUrl))
                const clientModule = await import( /* @vite-ignore */ clientSourceUrl)
                const myClient = clientModule.client;

                // Configure client instance with base url
                myClient.setConfig({ baseUrl: window.appconfig.dynamicZonesBaseUrl });

                // Update the Authorization header of the client on each request
                const authInterceptorId = myClient.interceptors.request.use(async (request, options) => {
                    const currentToken = auth?.user?.access_token;
                    if (currentToken) {
                        request.headers.set('Authorization', `Bearer ${currentToken}`);
                    } else {
                        request.headers.delete('Authorization');
                    }
                    return request;
                });

                // Set the client instance and finish setup
                setClient(myClient);
                return () => { myClient.interceptors.request.eject(authInterceptorId); };
            } catch (e) {
                setError({
                    message: html`Unable to load <a href=${clientSourceUrl}>Client</a> and/or <a href=${sdkSourceUrl}>SDK</a> modules`,
                    details: e.message || String(e)
                });
                return;

            }
        })();
    }, [auth?.loading, auth?.user]);

    // Provide error feedback if module loading failed
    if (error) {
        return html`
            <div class="container is-max-desktop pt-6">
                <div class="notification is-danger has-text-white">
                    <h3 class="title is-4 has-text-white">❌ Client Setup Failed</h3>
                    <p>${error.message}</p>
                    <div class="content mt-3">
                        <p class="is-size-7"><strong>Details:</strong> ${error.details}</p>
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
                        <progress class="progress is-small is-link" max="100"></progress>
                        <p class="has-text-centered has-text-grey is-size-7">
                            Loading SDK modules and configuring authorization.
                        </p>
                    </div>
                </div>
            <//>
        `;
    }

    return html`
        <${DynDnsClientContext.Provider} value=${{ client, sdk }}>
            ${children}
        <//>
    `;
}