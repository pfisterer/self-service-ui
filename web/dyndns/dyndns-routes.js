import { html } from 'htm/preact';
import { Route, Switch, useLocation } from 'wouter-preact';
import { useDynDnsConfig } from '/providers/dyndns-config.js';
import { useClient } from '/providers/client.js';
import { DynDnsZones } from '/dyndns/zones.js';
import { Tokens } from '/dyndns/tokens.js';
import { DynamicZonesApiSwagger } from '/swagger/swagger.js';
import { DnsPolicy } from '/dyndns/policy.js';
import { DynDnsLoadState } from '/dyndns/dyndns-load-state.js';

export function DynamicDnsManagement() {
    const { config: dynDnsConfig, error: configLoadError } = useDynDnsConfig();
    const { client, sdk, error: clientLoadError } = useClient('dyndns');
    const [, navigate] = useLocation();

    const dynamicZonesLoaded = Boolean(dynDnsConfig && client && sdk);

    if (!dynamicZonesLoaded) {
        return html`
            <${DynDnsLoadState}
                clientLoadError=${clientLoadError}
                configLoadError=${configLoadError}
                client=${client}
                sdk=${sdk}
            />
        `;
    }

    return html`
        <${Switch}>
            <${Route} path="/zones" component=${DynDnsZones} nest/>
            <${Route} path="/tokens" component=${Tokens} />
            <${Route} path="/api-doc" component=${DynamicZonesApiSwagger} />
            <${Route} path="/policy" component=${DnsPolicy} />
            <${Route} path="/">
                ${() => {
            navigate('/zones', { replace: true });
            return null;
        }}
            <//>
        <//>
    `;
}
