import { lazy, Suspense } from 'react';
import { Route, Switch, Redirect } from 'wouter';
import { useDynDnsConfig } from '/providers/dyndns-config.jsx';
import { DynDnsZones } from '/dyndns/zones.jsx';
import { Tokens } from '/dyndns/tokens.jsx';
import { DnsPolicy } from '/dyndns/policy.jsx';
import { DynDnsLoadState } from '/dyndns/dyndns-load-state.jsx';

// Swagger UI is ~1 MB — load it only when the API-doc route is opened.
const DynamicZonesApiSwagger = lazy(() =>
    import('/swagger/swagger.jsx').then(m => ({ default: m.DynamicZonesApiSwagger })));

export function DynamicDnsManagement() {
    const { config: dynDnsConfig, error: configLoadError } = useDynDnsConfig();
    // The client is a module singleton now; only the remote config is awaited.
    const dynamicZonesLoaded = Boolean(dynDnsConfig);

    if (!dynamicZonesLoaded) {
        return (
            <DynDnsLoadState configLoadError={configLoadError} />
        );
    }

    return (
        <Suspense fallback={<div style={{ padding: '2rem' }}>Lädt…</div>}>
            <Switch>
                <Route path="/zones" component={DynDnsZones} nest/>
                <Route path="/tokens" component={Tokens} />
                <Route path="/api-doc" component={DynamicZonesApiSwagger} />
                <Route path="/policy" component={DnsPolicy} />
                <Route path="/">
                    <Redirect to="/zones" replace />
                </Route>
            </Switch>
        </Suspense>
    );
}
