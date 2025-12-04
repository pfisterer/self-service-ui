import 'bulma/css/bulma.css';
import { render } from 'preact';
import { useState } from 'preact/hooks';
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

import dhbwLogoUrl from '/img/DHBW-Logo.svg';


function LoginLogoutButton() {
    const { user, login, logout } = useAuth()

    if (user) {
        return html`Welcome ${user.profile.name}! <button class="button" onClick=${logout}>Logout</button>`
    } else {
        return html`<button class="button" onClick=${login}>Login</button>`
    }
}

export function Header() {
    const [isBurgerActive, setIsBurgerActive] = useState(false);
    const [currentPath] = useLocation();

    // Helper for complex active path checks (like checking prefixes for the zones section)
    const getLinkClass = href => currentPath.startsWith(href) ? "is-active has-text-white has-background-grey" : "";

    // Use is-active class for Bulma component state, and has-text-danger-dark for visual emphasis
    const activeLinkClass = isActive => isActive ? "is-active has-text-white has-background-grey" : "";

    // Handlers to support burger menu toggling and link clicks
    const burgerActiveClass = isBurgerActive ? "is-active" : "";
    const toggleBurger = () => setIsBurgerActive(!isBurgerActive);
    const handleLinkClick = () => { if (isBurgerActive) { setIsBurgerActive(false); } };

    return html`
        <nav class="navbar is-fixed-top has-shadow" role="navigation" aria-label="main navigation">
            <div class="container">
                <div class="navbar-brand">
                    <!-- Logo/Branding Section -->
                    <a class="navbar-item" href="#">
                        <img src="${dhbwLogoUrl}" alt="DHBW Logo" style="height: 2em; max-height: 2em;" />
                    </a>
                    
                    <!-- Burger Menu Icon for Mobile -->
                    <a  role="button"  className="navbar-burger ${burgerActiveClass}" 
                        aria-label="menu"  aria-expanded=${isBurgerActive}  onClick=${toggleBurger}
                    >
                        <span aria-hidden="true"></span>
                        <span aria-hidden="true"></span>
                        <span aria-hidden="true"></span>
                    </a>
                </div>

                <!-- Navbar Menu (Collapsible) -->
                <div className="navbar-menu ${burgerActiveClass}">
                    <!-- Navigation Links (Left side) -->
                    <div class="navbar-start">
                        
                        <${Link} href="/" className=${(active) => `navbar-item ${activeLinkClass(active)}`} onClick=${handleLinkClick}> 
                            Home 
                        <//>

                        <${Link} href="/dyndns/tokens" className=${(active) => `navbar-item ${activeLinkClass(active)}`} onClick=${handleLinkClick}>
                            API Tokens
                        <//>

                        <!-- Special Link for Zone Management (uses manual prefix check for sub-routes) -->
                        <${Link} href="/dyndns/zones" className=${`navbar-item ${getLinkClass("/dyndns/zones")}`} onClick=${handleLinkClick}>
                            Zone Management
                        <//>
                        
                        <${Link} href="/documentation" className=${(active) => `navbar-item ${activeLinkClass(active)}`} onClick=${handleLinkClick}>
                            Documentation
                        <//>
                    </div>

                    <!-- Login/Logout Button (Right side) -->
                    <div class="navbar-end">
                        <div class="navbar-item">
                            <${LoginLogoutButton} />
                        </div>
                    </div>
                </div>
            </div>
        </nav>
  `
}

export function Footer({ title, version }) {
    return html`
        <footer class="footer has-background-white-bis py-4 mt-5">
            <div class="content has-text-centered is-size-7 has-text-grey-dark">
                <!-- Top Line: Project Name and Version -->
                <p class="mb-1">
                    ${title} — Version ${version}
                </p>
                
                <p class="mb-0">
                    <a href="https://github.com/pfisterer/self-service-ui">Source Code</a> 
                    <span class="has-text-grey-dark mx-2">|</span>
                    <a href="https://dennis-pfisterer.de">© Dennis Pfisterer, DHBW</a>
                </p>
            </div>
        </footer>
    `;
}

function Main() {
    const { user, login } = useAuth()
    const header = html`<${Header}/>`
    const footer = html`<${Footer} title=${html`<b>dhbwCloud Self Service</b>`} version=${__APP_VERSION__} />`

    if (!user) {
        return html`
            ${header}
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
                ${header}   
                <main class="section mt-5">
                <${Switch}>
                    <${Route} path="/" component=${Home}/>
                    <${Route} path="/documentation" component=${Documentation} />
                    <${Route} path="/dyndns/zones" component=${ListZones} nest/>
                    <${Route} path="/dyndns/tokens" component=${ListTokens} />
                    <${Route} component=${NotFound} />
                <//>
                ${footer}
            <//>
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
