import { useState, useEffect, useContext } from 'preact/hooks';
import { html } from 'htm/preact';
import { createContext } from 'preact';
import { useAuth } from '/providers/auth.js';

export const ClientContext = createContext({});

export function useClient(name = 'dyndns') {
    const contexts = useContext(ClientContext);
    const context = contexts[name];

    if (!context) {
        throw new Error(`ClientProvider "${name}" not found. Ensure the Provider is configured with this name.`);
    }
    return context;
};

export function ClientProvider({ children, name = 'dyndns', baseURL }) {
    const auth = useAuth();
    const parentContext = useContext(ClientContext);
    const [state, setState] = useState({ client: null, sdk: null, error: null });

    useEffect(() => {
        if (auth?.loading)
            return;

        (async () => {
            if (!baseURL) {
                setState(s => ({ ...s, error: { message: 'No Base URL provided.' } }));
                return;
            }

            const clientUrl = new URL("client/client.gen.mjs", baseURL).toString();
            const sdkUrl = new URL("client/sdk.gen.mjs", baseURL).toString();

            try {
                const sdkMod = await import(/* @vite-ignore */ sdkUrl);
                const clientMod = await import(/* @vite-ignore */ clientUrl);
                const myClient = clientMod.client;

                myClient.setConfig({ baseUrl: baseURL });

                const interceptorId = myClient.interceptors.request.use(async (request) => {
                    const token = auth?.user?.access_token;
                    token ? request.headers.set('Authorization', `Bearer ${token}`) : request.headers.delete('Authorization');
                    return request;
                });

                setState({ client: myClient, sdk: sdkMod, error: null });

                return () => { myClient.interceptors.request.eject(interceptorId); };
            } catch (e) {
                setState(s => ({ ...s, error: { message: 'Load failed', details: e.message } }));
            }
        })();
    }, [auth?.loading, auth?.user, baseURL]);

    const newValue = { ...parentContext, [name]: state }

    return html`
        <${ClientContext.Provider} value=${newValue}>
            ${children}
        <//>
    `;
}