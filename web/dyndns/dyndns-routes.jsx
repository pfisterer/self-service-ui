import { lazy, Suspense } from 'react';
import { Route, Switch, Redirect } from 'wouter';
import { useTranslation } from 'react-i18next';
import { useDynDnsConfig } from '/providers/dyndns-config.jsx';
import { DynDnsZones } from '/dyndns/zones.jsx';
import { DnsPolicy } from '/dyndns/policy.jsx';
import { DynDnsLoadState } from '/dyndns/dyndns-load-state.jsx';
import { ApiTokens } from '/tokens/api-tokens.jsx';
import { TlsCertificatesPage } from '/dyndns/tls-page.jsx';

// Swagger UI is ~1 MB — load it only when the API-doc route is opened.
const DynamicZonesApiSwagger = lazy(() =>
    import('/swagger/swagger.jsx').then(m => ({ default: m.DynamicZonesApiSwagger })));

export function DynamicDnsManagement() {
    const { t } = useTranslation();
    const { config: dynDnsConfig, error: configLoadError } = useDynDnsConfig();
    // The client is a module singleton now; only the remote config is awaited.
    const dynamicZonesLoaded = Boolean(dynDnsConfig);

    if (!dynamicZonesLoaded) {
        return (
            <DynDnsLoadState configLoadError={configLoadError} />
        );
    }

    return (
        <Suspense fallback={<div style={{ padding: '2rem' }}>{t('dyndns.loading')}</div>}>
            <Switch>
                <Route path="/zones" component={DynDnsZones} nest/>
                {/* The API tokens of the zones API, next to its documentation. */}
                <Route path="/tokens"><ApiTokens scope="dns" /></Route>
                <Route path="/api-doc" component={DynamicZonesApiSwagger} />
                {/* The tab lives in the URL (/administration/delegations, ...),
                    so a reload and a shared link land on the SAME tab — plain
                    component state used to reset to the first tab on reload. */}
                <Route path="/administration/:tab?" component={DnsPolicy} />
                {/* The certificates as a page of their own (the new layout's menu links here); the zone's TLS tab stays. */}
                <Route path="/tls" component={TlsCertificatesPage} />
                <Route path="/">
                    <Redirect to="/zones" replace />
                </Route>
            </Switch>
        </Suspense>
    );
}
