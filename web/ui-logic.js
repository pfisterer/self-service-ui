import { render } from 'preact';
import { html } from 'htm/preact';
import { Router, Route, Switch, Link, useLocation } from 'wouter-preact';
import { useHashLocation } from "wouter-preact/use-hash-location"

import { DynDnsConfigProvider } from './providers/dyndns-config.js';
import { DynDnsClientProvider } from './providers/dyndns-client.js';
import { useAuth, AuthProvider } from './providers/auth.js';
import { Home } from './components/home/home.js';
import { ListZones } from './components/zones/zones.js';
import { ListTokens } from './components/tokens/tokens.js';
import { Documentation } from './components/documentation/documentation.js';
import 'bulma/css/bulma.css';

function LoginLogoutButton() {
    const { user, login, logout } = useAuth()

    if (user) {
        return html`Welcome ${user.profile.name}! <button class="button" onClick=${logout}>Logout</button>`
    } else {
        return html`<button class="button" onClick=${login}>Login</button>`
    }
}

function Header(props) {
    const [currentPath] = useLocation();
    const getLinkClass = (href) => { return (currentPath.startsWith(href)) ? "has-text-danger" : ""; };

    return html`
        <nav class="navbar is-fixed-top" role="navigation" class="has-background-white-bis has-text-primary-invert" hoverable="false">
                <div class="navbar-brand">
                <a class="navbar-item" href="#">
                    <img src="img/DHBW-Logo.svg" style="height: 2em;" />
                </a>

                <div class="navbar-item">
                    ${props.title}
                </div>

                <div class="navbar-item">
                    <${Link} className=${active => active ? "has-text-danger" : ""} href="/">Home<//>
                </div>
                <div class="navbar-item">
                    <${Link} className=${active => active ? "has-text-danger" : ""} href="/tokens">API Tokens<//>
                </div>

                <div class="navbar-item">
                    <${Link} className=${getLinkClass("/zones")} href="/zones">Zone Management<//>
                </div>

                <div class="navbar-item">
                    <${Link} className=${active => active ? "has-text-danger" : ""} href="/documentation">Documentation<//>
                </div>
                
                <div class="navbar-end">
                    <div class="navbar-item">
                        <${LoginLogoutButton} />
                    </div>
                </div>
            </div>
        </nav>
  `
}

function Main() {
    const { user, login } = useAuth()
    const title = window.appconfig ? html`<b>dhbwCloud Self Service</b> (${window.appconfig.appVersion})` : "Loading application..."
    const header = html`<${Header} title=${title} version=${window.appconfig.appVersion} />`

    if (!user) {
        return html`
            ${header}
            <div class="container">
                <div class="box">Please <a onClick="${login}">log in</a> to access your data.</div>
            </div>
        `
    }

    return html`
        <${Router} hook=${useHashLocation}>
            ${header}   
            <${Switch}>
                <${Route} path="/" component=${Home}/>
                <${Route} path="/zones" component=${ListZones} nest/>
                <${Route} path="/tokens" component=${ListTokens} />
                <${Route} path="/documentation" component=${Documentation} />
                <${Route} component=${NotFound} />
            <//>
        <//>
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

render(
    html`<${App} name="Dynamic Zones DNS API" />`, document.getElementById('app')
)
