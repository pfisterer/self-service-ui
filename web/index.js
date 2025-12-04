import 'bulma/css/bulma.css';
import { render } from 'preact';
import { html } from 'htm/preact';
import { Router, Route, Switch } from 'wouter-preact';
import { useHashLocation } from "wouter-preact/use-hash-location"

import { DynDnsConfigProvider } from './providers/dyndns-config.js';
import { DynDnsClientProvider } from './providers/dyndns-client.js';
import { useAuth, AuthProvider } from './providers/auth.js';

import { Header } from './header.js';
import { Footer } from './footer.js';
import { Home } from './components/home/home.js';
import { ListZones } from './components/zones/zones.js';
import { ListTokens } from './components/tokens/tokens.js';
import { Documentation } from './components/documentation/documentation.js';

render(
    html`<${App} name="Dynamic Zones DNS API" />`, document.getElementById('app')
)

function App() {
    return html`
        <${DynDnsConfigProvider}>
            <${AuthProvider}>
                <${DynDnsClientProvider}>
                    <${Main} />
                <//>
            <//>
        <//>
    `
}

function Main() {
    const { user, login } = useAuth()
    const footer = html`<${Footer} title=${html`<b>dhbwCloud Self Service</b>`} version=${__APP_VERSION__} />`

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
        <${Router} hook=${useHashLocation}>
            <${Header}/>
            <main class="section mt-5">
                <${Switch}>
                    <${Route} path="/" component=${Home}/>
                    <${Route} path="/documentation" component=${Documentation} />
                    <${Route} path="/dyndns/zones" component=${ListZones} nest/>
                    <${Route} path="/dyndns/tokens" component=${ListTokens} />
                    <${Route} component=${NotFound} />
                <//>
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
