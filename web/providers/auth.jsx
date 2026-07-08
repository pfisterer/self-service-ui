import { useState, useEffect, useContext } from 'react';
import { createContext } from 'react';
import { UserManager } from 'oidc-client-ts';
import { useClient } from '../providers/client.jsx';

export const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export function authHeaders(user) {
    return user?.access_token ? { Authorization: `Bearer ${user.access_token}` } : {};
}

// Dummy-auth (dev) user object — no real OIDC session.
const makeDummyUser = (email) => ({ profile: { email, name: `User: ${email}` }, access_token: 'dummy-token' });

export function AuthProvider({ children }) {
    const [userManager, setUserManager] = useState(null);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [devUser, setDevUser] = useState(null);
    // dummy auth (impersonate any user by email) can ONLY be active in a dev build. 
    // `import.meta.env.DEV` is false in every `vite build` artifact (staging/prod images), so no runtime config — e.g. a stray dummyAuth:true in a served config.js — can re-enable the bypass.
    const useDummyAuth = import.meta.env.DEV && window.appconfig?.dummyAuth === true;
    const urlParams = new URLSearchParams(window.location.search);
    const emailParam = urlParams.get('dev_user');

    useEffect(() => {
        (async () => {
            try {
                if (useDummyAuth) {

                    // Check wheter we would need to set a user at all
                    if (!user) {

                        // No user set, check URL whether to override the default user
                        if (emailParam && emailParam.trim() !== "") {
                            // Remove the dev_user query parameter from the URL for cleaner subsequent requests
                            urlParams.delete('dev_user');
                            const newUrl = `${window.location.pathname}?${urlParams.toString()}`;
                            window.history.replaceState({}, document.title, newUrl);

                            // Set the devUser so that 
                            setDevUser(emailParam);
                            setUser(makeDummyUser(emailParam));
                        } else {
                            const defaultEMail = 'dennis.pfisterer@dhbw.de';
                            setUser(makeDummyUser(defaultEMail));
                            setDevUser(defaultEMail);
                        }

                    }

                } else {

                    // Setup OIDC client. Use a STABLE redirect URI (origin + path,
                    // NO query/hash). Building it from window.location.href would embed
                    // transient OIDC params (?code&state) after a callback, so the
                    // redirect_uri sent on the next login is polluted; Keycloak then
                    // returns to a URL carrying the stale code/state first, URLSearchParams
                    // reads the old state, and login fails until the query is removed by
                    // hand. The path is kept so users return to the same route after login.
                    const cleanUrl = window.location.origin + window.location.pathname;
                    const config = {
                        authority: window.appconfig.oidc.issuer_url,
                        client_id: window.appconfig.oidc.client_id,
                        redirect_uri: cleanUrl,
                        post_logout_redirect_uri: cleanUrl,
                        response_type: 'code',
                        scope: 'openid profile email',
                        loadUserInfo: true,
                        //automaticSilentRenew: true,
                    };

                    const um = new UserManager(config);
                    setUserManager(um);

                    // Handle OIDC callback, then ALWAYS strip the query — even if the
                    // callback failed — so a stale ?code/&state can't linger and break
                    // the next login attempt.
                    const urlParams = new URLSearchParams(window.location.search);
                    const isCallback = urlParams.has('code') || urlParams.has('error');
                    if (isCallback) {
                        try {
                            await um.signinRedirectCallback();
                        } finally {
                            window.history.replaceState({}, document.title, window.location.pathname);
                        }
                    }

                    const u = await um.getUser();
                    if (u && !u.expired) setUser(u);

                    um.events.addUserLoaded(setUser);
                    um.events.addUserUnloaded(() => setUser(null));
                    um.events.addAccessTokenExpired(() => setUser(null));
                    um.events.addSilentRenewError((error) => {
                        console.error("Silent renew failed:", error);
                    });
                }

            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        })();
    }, [window?.appconfig?.oidc, useDummyAuth, emailParam]);

    // In dummy-auth (dev) mode there is no OIDC session, so login/logout just
    // toggle the local dummy user — this makes the Login/Logout buttons work in
    // dev (e.g. to preview the signed-out state). login() accepts an optional
    // email so the dev login screen can sign in as ANY user; a non-string arg
    // (e.g. the click event from the header button) falls back to the last/default
    // dev user. The mount effect does not depend on `user`, so it won't re-set the
    // user after a dev logout.
    const login = useDummyAuth
        ? (email) => {
            const e = (typeof email === 'string' && email.trim()) ? email.trim() : (devUser || 'dennis.pfisterer@dhbw.de');
            setDevUser(e);
            setUser(makeDummyUser(e));
        }
        : () => userManager?.signinRedirect();
    const logout = useDummyAuth
        ? () => setUser(null)
        : () => userManager?.signoutRedirect();

    return (
        <AuthContext.Provider value={{ user, login, logout, loading, useDummyAuth, dev_user: devUser }}>
            {children}
        </AuthContext.Provider>
    );
}
