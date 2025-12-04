import { useState, useEffect, useContext } from 'preact/hooks';
import { html } from 'htm/preact';
import { createContext } from 'preact';
import { UserManager } from 'oidc-client-ts';
import { useDynDnsConfig } from './dyndns-config.js';

export const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export function authHeaders(user) {
    return user?.access_token ? { Authorization: `Bearer ${user.access_token}` } : {};
}

export function AuthProvider({ children }) {
    const [userManager, setUserManager] = useState(null);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const dynDnsConfig = useDynDnsConfig();

    useEffect(() => {
        (async () => {
            if (!dynDnsConfig) {
                console.error('DynDnsConfig is not available for AuthProvider');
                return;
            }

            try {
                const myUrl = new URL(window.location.href).toString();

                const config = {
                    authority: dynDnsConfig.auth.issuer_url,
                    client_id: dynDnsConfig.auth.client_id,
                    redirect_uri: myUrl,
                    post_logout_redirect_uri: myUrl,
                    response_type: 'code',
                    scope: 'openid profile email',
                    loadUserInfo: true,
                    //automaticSilentRenew: true,
                };

                const um = new UserManager(config);
                setUserManager(um);

                // Handle OIDC callback
                const urlParams = new URLSearchParams(window.location.search);
                const isCallback = urlParams.has('code') || urlParams.has('error');
                if (isCallback) {
                    await um.signinRedirectCallback();
                    window.history.replaceState({}, document.title, window.location.pathname);
                }

                const u = await um.getUser();
                if (u && !u.expired) setUser(u);

                um.events.addUserLoaded(setUser);
                um.events.addUserUnloaded(() => setUser(null));
                um.events.addAccessTokenExpired(() => setUser(null));
                um.events.addSilentRenewError((error) => {
                    console.error("Silent renew failed:", error);
                });

            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        })();
    }, [dynDnsConfig]);

    const login = () => userManager?.signinRedirect();
    const logout = () => userManager?.signoutRedirect();

    return html`
        <${AuthContext.Provider} value=${{ user, login, logout, loading }}>
            ${children}
        <//>
    `;
}
