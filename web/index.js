import 'bulma/css/bulma.css';
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';

import { render } from 'preact';
import { html } from 'htm/preact';
import { Router, Route, Switch } from 'wouter-preact';
import { MantineProvider, AppShell } from '@mantine/core';
import { Container, Paper, Anchor } from '@mantine/core';

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
import { DnsPolicy } from '/dyndns/policy.js';
import { ClientProvider } from './providers/client.js';
import { CloudResourceManagement } from './cloudresources/resources.js';

render(
    html`<${MantineProvider} theme=${{
        colorScheme: 'light',
        primaryColor: 'dhbw',
        colors: {
            dhbw: ['#F5D8D8', '#E69C9A', '#DD6462', '#D52C2A', '#CF2C29', '#B32421', '#991B1A', '#7D1312', '#600B0B', '#400404'],
            neutral: ['#F0F1F1', '#D9DBDC', '#BFC3C5', '#A5A9AB', '#8B8F91', '#788187', '#5F6466', '#474C4E', '#303537', '#1A1E20'],
        },
        fontFamily: 'Arial, sans-serif',
    }}
      withGlobalStyles
      withNormalizeCSS>
        <${App} name="Dynamic Zones DNS API" />
    <//>`, document.getElementById('app')
)

function App() {
    return html`
        <${DynDnsConfigProvider}>
            <${AuthProvider}>
                <${Main} />
            <//>
        <//>
    `
}

function DynamicDnsRoutes() {
    const { config: dynDnsConfig, error: configLoadError } = useDynDnsConfig();
    const { client, sdk, error: clientLoadError } = useClient('dyndns');

    const dynamicZonesLoaded = dynDnsConfig && client && sdk

    const dynDnsLoadState = function () {
        return html`<${DynDnsLoadState} clientLoadError=${clientLoadError} configLoadError=${configLoadError} client=${client} sdk=${sdk} />`;
    }

    return html`
        <${Switch}>
            <${Route} path="/dyndns/zones" component=${dynamicZonesLoaded ? DynDnsZones : dynDnsLoadState} nest/>
            <${Route} path="/dyndns/tokens" component=${dynamicZonesLoaded ? Tokens : dynDnsLoadState}  />
            <${Route} path="/dyndns/api-doc" component=${dynamicZonesLoaded ? DynamicZonesApiSwagger : dynDnsLoadState} />
            <${Route} path="/dyndns/policy" component=${dynamicZonesLoaded ? DnsPolicy : dynDnsLoadState} />
        <//>
    `
}

function Main() {
    const { user, login } = useAuth()
    const footer = html`<${Footer} title=${html`<b>dhbwCloud Self Service</b>`} version=${__APP_VERSION__} />`

    return html`
        <${AppShell}  header=${{ height: 60 }} padding="md">
            <${AppShell.Header}>
                <${Header}/>
            <//>
            <${AppShell.Main}>

                ${!user ? html`
                    <${Container} size="md" py="xl">
                        <${Paper} p="lg" withBorder>
                            Please <${Anchor} onClick=${login} style=${{ cursor: 'pointer' }}>log in</> to access your data.
                        <//>
                    <//>
                ` : html`
                    <${Router}>
                        <!-- Router -->
                        <${Switch}>
                            <!-- Generic Routes -->
                            <${Route} path="/" component=${Home}/>
                            <${Route} path="/documentation" component=${Documentation} />
                            
                            <${Route} path="/cloudresources" component=${CloudResourceManagement} nest/>

                            <!-- Dynamic DNS Routes -->
                            <${ClientProvider} name="dyndns" baseURL=${window?.appconfig?.dynamicZonesBaseUrl}>
                                <${DynamicDnsRoutes} />
                            <//>
                            
                            <${Route} component=${NotFound} />
                        <//>
                    <//>
                `}
                ${footer}
            <//>
        <//>
    `
}

function NotFound() {
    return html`
        <${Container} size="md">
            <${Paper} p="lg" withBorder>404: Page not found<//>
        <//>
    `
}
