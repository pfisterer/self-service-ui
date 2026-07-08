import { useState, useEffect, useContext } from 'react';
import { createContext } from 'react';

export const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export function authHeaders(user) {
    return user?.access_token ? { Authorization: `Bearer ${user.access_token}` } : {};
}

// Dummy-auth (dev) user object — no real OIDC session.
const makeDummyUser = (email) => ({ profile: { email, name: `User: ${email}` }, access_token: 'dummy-token' });

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [devUser, setDevUser] = useState(null);
    // Build-time floor dummy auth (impersonate any user by email) can ONLY
    // be active in a dev build. `import.meta.env.DEV` is false in every `vite build`
    // artifact (staging/prod images), so no runtime config can re-enable the bypass.
    const useDummyAuth = import.meta.env.DEV && window.appconfig?.dummyAuth === true;
    const urlParams = new URLSearchParams(window.location.search);
    const emailParam = urlParams.get('dev_user');

    useEffect(() => {
        (async () => {
            try {
                if (useDummyAuth) {
                    // Dev/dummy auth: sign in as any user (dev-login screen / ?dev_user).
                    if (!user) {
                        if (emailParam && emailParam.trim() !== "") {
                            urlParams.delete('dev_user');
                            const newUrl = `${window.location.pathname}?${urlParams.toString()}`;
                            window.history.replaceState({}, document.title, newUrl);
                            setDevUser(emailParam);
                            setUser(makeDummyUser(emailParam));
                        } else {
                            const defaultEMail = 'dennis.pfisterer@dhbw.de';
                            setUser(makeDummyUser(defaultEMail));
                            setDevUser(defaultEMail);
                        }
                    }
                } else {
                    // BFF mode: authentication is done by the oauth2-proxy in
                    // front of this app. If this code runs at all, the request already
                    // passed the proxy, so the user IS authenticated — we just fetch
                    // their identity (email) from the proxy's userinfo endpoint for
                    // display. No token lives in the browser: the proxy injects the
                    // Bearer into /api/* calls server-side (see providers/client.jsx).
                    const res = await fetch('/oauth2/userinfo', {
                        credentials: 'include',
                        headers: { Accept: 'application/json' },
                    });
                    if (res.ok) {
                        const info = await res.json();
                        const email = info.email || info.preferredUsername || info.user || '';
                        setUser({ profile: { email, name: email }, access_token: null });
                    } else {
                        // No valid session (should be rare — the proxy pre-authenticates):
                        // a full-page navigation is the only way to re-run the OIDC login.
                        window.location.href = '/oauth2/start?rd=' +
                            encodeURIComponent(window.location.pathname + window.location.search);
                        return;
                    }
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        })();
        // Intentionally not depending on `user` — the effect must not re-run on login.
    }, [useDummyAuth, emailParam]);

    // Dummy (dev) mode: login/logout toggle the local user (preview signed-out state).
    // BFF (prod) mode: the proxy owns the session — login goes through the proxy
    // sign-in, logout through the proxy sign-out (clears the cookie).
    const login = useDummyAuth
        ? (email) => {
            const e = (typeof email === 'string' && email.trim()) ? email.trim() : (devUser || 'dennis.pfisterer@dhbw.de');
            setDevUser(e);
            setUser(makeDummyUser(e));
        }
        : () => { window.location.href = '/oauth2/start?rd=' + encodeURIComponent(window.location.pathname); };
    const logout = useDummyAuth
        ? () => setUser(null)
        : () => { window.location.href = '/oauth2/sign_out'; };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading, useDummyAuth, dev_user: devUser }}>
            {children}
        </AuthContext.Provider>
    );
}
