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
    const useDummyAuth = window.appconfig?.dummyAuth === true;
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

                    // Setup OIDC client
                    const myUrl = new URL(window.location.href).toString();
                    const config = {
                        authority: window.appconfig.oidc.issuer_url,
                        client_id: window.appconfig.oidc.client_id,
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
