import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { LogIn } from 'lucide-react';
import { useAuth } from '/providers/auth.jsx';

// The oauth2-proxy in front of this app owns the session; the browser holds
// nothing but its cookie. When that cookie expires the proxy answers every
// request with 401 — and the app used to react by navigating to the sign-in
// endpoint without a word. That reads exactly like a frozen page: clicks do
// nothing while the navigation is pending, and whatever was typed into an open
// dialog is gone when it completes.
//
// So the expiry is made visible instead, and the page is left standing. Two
// things raise it, both landing on the same dialog:
//
//   - a request that comes back 401 (see providers/client.jsx), and
//   - a check when the tab regains focus, because a session almost always dies
//     while nobody is looking at the tab.
//
// Deliberately NO polling interval. The proxy refreshes the session on every
// request it sees, so a periodic probe would double as a keep-alive and an
// unattended tab would stay signed in for ever. Tying the check to focus means
// the session lasts as long as somebody is actually there.

const SessionContext = createContext(null);

// oauth2-proxy's endpoint for exactly this question: 202 when the session is
// valid, 401 when it is not, no body and no redirect either way.
const PROBE_URL = '/oauth2/auth';

export function SessionProvider({ children }) {
    const { useDummyAuth } = useAuth() ?? {};
    const [expiredByRequest, setExpiredByRequest] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    const probe = useQuery({
        queryKey: ['session'],
        queryFn: async () => {
            const res = await fetch(PROBE_URL, { credentials: 'include' });
            // ONLY an explicit 401 means "signed out". A 404 (endpoint not
            // exposed on this deployment) or a 502 says something about the
            // proxy, not about the session, and must never throw a sign-in
            // dialog in somebody's face. A network failure throws, which react
            // query keeps as an error — also not a verdict on the session.
            return { signedOut: res.status === 401 };
        },
        // Dev has no proxy in front of it; there is nothing to probe and
        // /oauth2/auth would 404 through the vite dev server.
        enabled: !useDummyAuth,
        refetchOnWindowFocus: true,
        refetchInterval: false,
        staleTime: 0,
        retry: false,
    });

    // expire() is what the 401 interceptor calls. It clears `dismissed`: a
    // fresh failure is a new event, even if the dialog was waved away earlier.
    const expire = useCallback(() => {
        setExpiredByRequest(true);
        setDismissed(false);
    }, []);

    const expired = expiredByRequest || probe.data?.signedOut === true;
    const value = useMemo(() => ({ expired, expire }), [expired, expire]);

    return (
        <SessionContext.Provider value={value}>
            {children}
            <SessionExpiredModal opened={expired && !dismissed} onDismiss={() => setDismissed(true)} />
        </SessionContext.Provider>
    );
}

// Inert outside the provider, so callers never have to check.
export function useSession() {
    return useContext(SessionContext) ?? { expired: false, expire: () => {} };
}

// Dismissable on purpose. Signing in again means a full page load, so anything
// half-typed is lost — being able to close this and copy it out first is the
// difference between an interruption and losing work. The next failed request
// brings the dialog back.
function SessionExpiredModal({ opened, onDismiss }) {
    const signIn = () => {
        const back = window.location.pathname + window.location.search;
        window.location.href = '/oauth2/start?rd=' + encodeURIComponent(back);
    };

    return (
        <Modal opened={opened} onClose={onDismiss} centered title="Your session has expired">
            <Stack gap="md">
                <Text size="sm">
                    You have been signed out, so nothing on this page can be saved or reloaded
                    until you sign in again. Signing in reloads the page and brings you back
                    here — copy anything you have typed before you do.
                </Text>
                <Group justify="flex-end">
                    <Button variant="default" onClick={onDismiss}>Not now</Button>
                    <Button onClick={signIn} leftSection={<LogIn size={16} />}>Sign in again</Button>
                </Group>
            </Stack>
        </Modal>
    );
}
