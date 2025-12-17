import 'bulma/css/bulma.css';
import { render } from 'preact';
import { html } from 'htm/preact';
import { Router, Route, Switch } from 'wouter-preact';

import { DynDnsConfigProvider, useDynDnsConfig } from '/providers/dyndns-config.js';
import { useAuth, AuthProvider } from '/providers/auth.js';
import { useClient } from '/providers/client.js';

import { Header } from '/header.js';
import { Footer } from '/footer.js';
import { Home } from '/home/home.js';
import { DynDnsZones } from '/dyndns/zones.js';
import { Tokens } from '/dyndns/tokens.js';
import { Documentation } from '/documentation/documentation.js';
import { DynamicZonesApiSwagger } from '/swagger/swagger.js';
import { DynDnsLoadState } from '/dyndns/dyndns-load-state.js';
import { DnsPolicy } from '/dns-policy/dns-policy.js';
import { ClientProvider } from './providers/client.js';

render(
    html`<${App} name="Dynamic Zones DNS API" />`, document.getElementById('app')
)

function App() {
    return html`
        <${DynDnsConfigProvider}>
            <${AuthProvider}>
                <${ClientProvider} name="dyndns" baseURL=${window?.appconfig?.dynamicZonesBaseUrl}>
                    <${ClientProvider} name="selfService" baseURL=${window?.appconfig?.cloudSelfServiceBaseUrl}>
                        <${Main} />
                    <//>
                <//>
            <//>
        <//>
    `
}

function Main() {
    const { user, login } = useAuth()
    const footer = html`<${Footer} title=${html`<b>dhbwCloud Self Service</b>`} version=${__APP_VERSION__} />`
    const { client, sdk, error: clientLoadError } = useClient('dyndns');
    const { config: dynDnsConfig, error: configLoadError } = useDynDnsConfig();
    const dynamicZonesLoaded = dynDnsConfig && client && sdk
    const dynDnsLoadState = function () {
        return html`<${DynDnsLoadState} clientLoadError=${clientLoadError} configLoadError=${configLoadError} client=${client} sdk=${sdk} />`;
    }

    if (!user) {
        return html`
            <${Header}/>
            <main class="section mt-5">
                <div class="container">
                    <div class="box">Please <a onClick="${login}">log in</a> to access your data.</div>
                </div>
            </main>
            ${footer}
        `
    }

    return html`
        <${Router}>
        
        <main class="section mt-5">
            <!--  {Header}/> -->
            <${Header}/>

            <!-- Router -->
            <${Switch}>
                <!-- Generic Routes -->
                <${Route} path="/" component=${Home}/>
                <${Route} path="/documentation" component=${Documentation} />

                <!-- Dynamic DNS Routes -->
                <${Route} path="/dyndns/zones" component=${dynamicZonesLoaded ? DynDnsZones : dynDnsLoadState} nest/>
                <${Route} path="/dyndns/tokens" component=${dynamicZonesLoaded ? Tokens : dynDnsLoadState}  />
                <${Route} path="/dyndns/api-doc" component=${dynamicZonesLoaded ? DynamicZonesApiSwagger : dynDnsLoadState} />

                <!-- DNS Policy Routes -->
                <${Route} path="/dns-policy/" component=${DnsPolicy} />

                <!-- 404 Route -->
                <${Route} component=${NotFound} />
            <//>

            <!-- Footer -->
            ${footer}
        </main>
        <div class="mb-6"></div>
    `
}

function NotFound() {
    return html`
        <div class="container">
            <div class="box">404: Page not found</div>
        </div>
    `
}
