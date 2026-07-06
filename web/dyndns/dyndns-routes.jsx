import { lazy, Suspense } from 'react';
import { Route, Switch, Redirect } from 'wouter';
import { useDynDnsConfig } from '/providers/dyndns-config.jsx';
import { useClient } from '/providers/client.jsx';
import { DynDnsZones } from '/dyndns/zones.jsx';
import { Tokens } from '/dyndns/tokens.jsx';
import { DnsPolicy } from '/dyndns/policy.jsx';
import { DynDnsLoadState } from '/dyndns/dyndns-load-state.jsx';

// Swagger UI is ~1 MB — load it only when the API-doc route is opened.
const DynamicZonesApiSwagger = lazy(() =>
    import('/swagger/swagger.jsx').then(m => ({ default: m.DynamicZonesApiSwagger })));

export function DynamicDnsManagement() {
    const { config: dynDnsConfig, error: configLoadError } = useDynDnsConfig();
    const { client, sdk, error: clientLoadError } = useClient('dyndns');

    const dynamicZonesLoaded = Boolean(dynDnsConfig && client && sdk);

    if (!dynamicZonesLoaded) {
        return (
            <DynDnsLoadState
                clientLoadError={clientLoadError}
                configLoadError={configLoadError}
                client={client}
                sdk={sdk}
            />
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
