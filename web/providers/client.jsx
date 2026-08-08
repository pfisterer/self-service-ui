import { useState, useEffect, useContext } from 'react';
import { createContext } from 'react';
import { useAuth } from '/providers/auth.jsx';
import { useSession } from '/providers/session.jsx';

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
    const { expire } = useSession();
    const parentContext = useContext(ClientContext);
    const [state, setState] = useState({ client: null, sdk: null, error: null });

    useEffect(() => {
        if (auth?.loading) {
            return;
        }

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
                    // BFF mode: the SPA holds NO token (access_token is null),
                    // so no Authorization is set here; the oauth2-proxy in front injects
                    // the Bearer server-side. Pre-BFF, the SPA still sets it from the token.
                    const token = auth?.user?.access_token;
                    token ? request.headers.set('Authorization', `Bearer ${token}`) : request.headers.delete('Authorization');

                    // Dev/dummy auth only: assert an identity via header. Gated on
                    // useDummyAuth (false in every production build, see auth.jsx).
                    if (auth?.useDummyAuth && auth?.dev_user) {
                        console.debug(`ClientProvider: Adding dummy auth header for user '${auth.dev_user}'`);
                        request.headers.set('X-Dummy-Auth-User', auth.dev_user);
                    }

                    return request;
                });

                // BFF: a 401 means the oauth2-proxy session expired (it answers
                // AJAX requests with 401 rather than a cross-origin redirect an XHR can't
                // follow). Only a full-page navigation can re-run the OIDC login — but
                // starting one from here, silently, is what made an expired session look
                // like a hung page. Raise it instead and let the person choose the moment
                // (see providers/session.jsx). Skipped in dummy/dev mode (there the API
                // itself returns 401 for real auth errors).
                const responseInterceptorId = myClient.interceptors.response.use(async (response) => {
                    if (response?.status === 401 && !auth?.useDummyAuth) {
                        expire();
                    }
                    return response;
                });

                setState({ client: myClient, sdk: sdkMod, error: null });

                return () => {
                    myClient.interceptors.request.eject(interceptorId);
                    myClient.interceptors.response.eject(responseInterceptorId);
                };
            } catch (e) {
                setState(s => ({ ...s, error: { message: 'Load failed', details: e.message } }));
            }
        })();
        // `auth.useDummyAuth` is read inside the interceptors but is a build-time
        // constant (import.meta.env.DEV && config), so it cannot change while
        // this provider is mounted; listing it would only rebuild the client.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [auth?.loading, auth?.user, baseURL, auth.dev_user, expire]);

    const newValue = { ...parentContext, [name]: state };

    return (
        <ClientContext.Provider value={newValue}>
            {children}
        </ClientContext.Provider>
    );
}