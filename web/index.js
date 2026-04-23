import 'bulma/css/bulma.css';
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';

import { render } from 'preact';
import { html } from 'htm/preact';
import { Router, Route, Switch } from 'wouter-preact';
import { MantineProvider, AppShell } from '@mantine/core';
import { Container, Paper, Anchor } from '@mantine/core';

import { DynDnsConfigProvider } from '/providers/dyndns-config.js';
import { useAuth, AuthProvider } from '/providers/auth.js';
import { ErrorModalProvider } from '/providers/error-modal.js';

import { Header } from '/header.js';
import { Footer } from '/footer.js';
import { Home } from '/home/home.js';
import { Delayed } from '/helper/delayed.js';
import { Documentation } from '/documentation/documentation.js';
import { ClientProvider, useClient } from './providers/client.js';
import { CloudProjectManagement } from './projects/projects.js';
import { DynamicDnsManagement } from './dyndns/dyndns-routes.js';

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
        <${ErrorModalProvider}>
            <${DynDnsConfigProvider}>
                <${AuthProvider}>
                    <${Main} />
                <//>
            <//>
        <//>
    `
}

function AppRoutes() {
    const { client: projectClient } = useClient('projects');

    return html`
        <${Switch}>
            <${Route} path="/" component=${Home}/>
            <${Route} path="/documentation" component=${Documentation} />
            <${Route} path="/dyndns" component=${DynamicDnsManagement} nest/>
            ${projectClient && html`<${Route} path="/projects" component=${CloudProjectManagement} nest/>`}
            <${Route} component=${NotFound} />
        <//>
    `;
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
                    <${Delayed} waitMs=${200}>
                        <${Container} size="md" py="xl">
                            <${Paper} p="lg" withBorder>
                                Please <${Anchor} onClick=${login} style=${{ cursor: 'pointer' }}>log in</> to access your data.
                            <//>
                        <//>
                    <//>
                ` : html`
                    <${Router}>
                        <${ClientProvider} name="dyndns" baseURL=${window?.appconfig?.dynamicZonesBaseUrl}>
                            <${ClientProvider} name="projects" baseURL=${window?.appconfig?.cloudResourcesBaseUrl}>
                                <${AppRoutes} />
                            <//>
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
