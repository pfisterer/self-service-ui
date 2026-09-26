import { useEffect, useState } from 'react';
import { Alert, Container } from '@mantine/core';
import { KeyRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// Whether signing in can currently work, as the two APIs see it.
//
// Both publish `auth.sign_in_available` on their public config.json: false
// while the identity provider's keys cannot be fetched. Public on purpose —
// every authenticated endpoint needs a verified token, and that is exactly what
// cannot be had while the provider is away.
//
// Polled rather than read once: an outage starts and ends while the tab is
// open, and the banner has to leave with it. The interval is the one the APIs
// keep their "unavailable" state for, so the banner lags an outage by at most
// that much in either direction.
const POLL_MS = 60_000;
const FETCH_TIMEOUT_MS = 5_000;

function configUrls() {
    const cfg = window.appconfig || {};
    return [cfg.cloudResourcesBaseUrl, cfg.dynamicZonesBaseUrl]
        .filter(Boolean)
        .map(base => {
            try {
                return new URL('config.json', base).toString();
            } catch {
                return null;
            }
        })
        .filter(Boolean);
}

// signInReportedDown reads one config.json. Only an explicit `false` counts:
// an API that is itself unreachable says nothing about the identity provider,
// and an older API without the field says nothing either.
async function signInReportedDown(url, signal) {
    try {
        const res = await fetch(url, { signal, cache: 'no-store' });
        if (!res.ok) return false;
        const config = await res.json();
        return config?.auth?.sign_in_available === false;
    } catch {
        return false;
    }
}

export function useSignInAvailable() {
    const [available, setAvailable] = useState(true);

    useEffect(() => {
        const urls = configUrls();
        if (urls.length === 0) return undefined;

        let cancelled = false;
        const check = async () => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
            const down = await Promise.all(urls.map(u => signInReportedDown(u, controller.signal)));
            clearTimeout(timer);
            if (!cancelled) setAvailable(!down.some(Boolean));
        };

        check();
        const interval = setInterval(check, POLL_MS);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, []);

    return available;
}

// SignInOutageBanner says, above every page, that the university's sign-in is
// not answering — and what that means for the person reading it: what they are
// doing keeps working, a new sign-in does not. Without it the first symptom is
// a login that fails on somebody else's server, which reads as our bug.
export function SignInOutageBanner() {
    const { t } = useTranslation();
    const available = useSignInAvailable();
    if (available) return null;
    // In a Container like every page below it, so the banner starts on the
    // same vertical line as the content it sits above.
    return (
        <Container size="xl" pt="md">
            <Alert color="orange" variant="light" icon={<KeyRound size="16" />}
                title={t('app.signInOutage.title')}>
                {t('app.signInOutage.message')}
            </Alert>
        </Container>
    );
}
