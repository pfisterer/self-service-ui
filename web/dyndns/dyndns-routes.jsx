import { lazy, Suspense } from 'react';
import { Route, Switch, Redirect } from 'wouter';
import { useDynDnsConfig } from '/providers/dyndns-config.jsx';
import { DynDnsZones } from '/dyndns/zones.jsx';
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
                {/* The token page moved out of this section and up one level,
                    because os-mgt-api issues tokens too. This URL was the only
                    place to manage them for a long time and is bookmarked and
                    linked from documentation, so it keeps working. `~` makes
                    the target absolute — a plain "/tokens" would resolve
                    against this nested router's base and redirect here again. */}
                <Route path="/tokens">
                    <Redirect to="~/tokens" replace />
                </Route>
                <Route path="/api-doc" component={DynamicZonesApiSwagger} />
                <Route path="/policy" component={DnsPolicy} />
                <Route path="/">
                    <Redirect to="/zones" replace />
                </Route>
            </Switch>
        </Suspense>
    );
}
