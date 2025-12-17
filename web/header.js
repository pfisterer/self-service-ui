import { useState } from 'preact/hooks';
import { useSignal, signal } from '@preact/signals';
import { html } from 'htm/preact';
import { Link, useLocation } from 'wouter-preact';
import { useAuth } from './providers/auth.js';
import { User } from "lucide-preact";

import dhbwLogoUrl from '/img/DHBW-Logo.svg';

export function Header() {
    // Replaced useState with useSignal for all component state
    const isBurgerActive = useSignal(false);
    const isDyndnsDropdownActive = useSignal(false);
    const hoverTimeout = useSignal(null); // Replaces the global let hoverTimeout;
    const [currentPath] = useLocation();

    // Helper functions
    const getLinkClass = href => currentPath.startsWith(href) ? "is-active has-text-white has-background-grey" : "";
    const activeLinkClass = isActive => isActive ? "is-active has-text-white has-background-grey" : "";
    const isDyndnsActive = currentPath.startsWith('/dyndns/');

    // Handlers
    const burgerActiveClass = isBurgerActive.value ? "is-active" : "";
    const toggleBurger = () => isBurgerActive.value = !isBurgerActive.value;

    // Uses Debounce/Timeout
    const handleMouseEnter = () => {
        clearTimeout(hoverTimeout.value);
        isBurgerActive.value = true;
    };

    const handleMouseLeave = () => {
        hoverTimeout.value = setTimeout(() => {
            isBurgerActive.value = false;
        }, 200);
    };

    // Dropdown hover logic
    const handleDyndnsEnter = () => isDyndnsDropdownActive.value = true;
    const handleDyndnsLeave = () => isDyndnsDropdownActive.value = false;

    // Handler to close all menus on link click
    const handleLinkClick = () => {
        clearTimeout(hoverTimeout.value);
        isBurgerActive.value = false;
        isDyndnsDropdownActive.value = false;
    };

    return html`
        <nav class="navbar is-fixed-top has-shadow" role="navigation" aria-label="main navigation"
        onMouseEnter=${handleMouseEnter} onMouseLeave=${handleMouseLeave}>
            <div class="container">
                <div class="navbar-brand">
                    <a class="navbar-item" href="#">
                        <img src="${dhbwLogoUrl}" alt="DHBW Logo" style="height: 2em; max-height: 2em;" />
                    </a>

                    <a role="button" className="navbar-burger ${burgerActiveClass}"
                        aria-label="menu" aria-expanded=${isBurgerActive.value} onClick=${toggleBurger}>
                        <span aria-hidden="true"></span>
                        <span aria-hidden="true"></span>
                        <span aria-hidden="true"></span>
                    </a>
                </div>

                <div className="navbar-menu ${burgerActiveClass}">
                    <div class="navbar-start">
                        
                        <${Link} href="/" className=${(active) => `navbar-item ${activeLinkClass(active)}`} onClick=${handleLinkClick}>
                            Home
                        <//>

                        <div class="navbar-item has-dropdown ${isDyndnsDropdownActive.value ? 'is-active' : ''}" 
                             onMouseEnter=${handleDyndnsEnter}
                             onMouseLeave=${handleDyndnsLeave}>
                            
                            <a class="navbar-link ${isDyndnsActive ? 'is-active has-text-white has-background-grey' : ''}" href="#">
                                DNS Zones
                            </a>

                            <div class="navbar-dropdown">
                                <${Link} href="/dyndns/zones" className=${`navbar-item ${getLinkClass("/dyndns/zones")}`} onClick=${handleLinkClick}>
                                    Zone Management
                                <//>
                                <${Link} href="/dyndns/tokens" className=${`navbar-item ${getLinkClass("/dyndns/tokens")}`} onClick=${handleLinkClick}>
                                    API Tokens
                                <//>
                                <${Link} href="/dyndns/api-doc" className=${`navbar-item ${getLinkClass("/dyndns/api-doc")}`} onClick=${handleLinkClick}>
                                    API Documentation
                                <//>
                            </div>
                        </div>
                        
                        <${Link} href="/dns-policy" className=${(active) => `navbar-item ${activeLinkClass(active)}`} onClick=${handleLinkClick}>
                            DNS Policy
                        <//>

                        <${Link} href="/documentation" className=${(active) => `navbar-item ${activeLinkClass(active)}`} onClick=${handleLinkClick}>
                            Documentation
                        <//>
                    </div>

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

function LoginLogoutButton() {
    const { user, login, logout } = useAuth()
    const [isDropdownActive, setIsDropdownActive] = useState(false);
    const handleMouseEnter = () => setIsDropdownActive(true);
    const handleMouseLeave = () => setIsDropdownActive(false);

    if (!user) {
        return html`<button class="button" onClick=${login}>Login</button>`
    }

    return html`
        <div class="dropdown is-right ${isDropdownActive ? 'is-active' : ''}" onMouseEnter=${handleMouseEnter} onMouseLeave=${handleMouseLeave}>
                <div class="dropdown-trigger">
                    <button class="button is-ghost" aria-haspopup="true" aria-controls="dropdown-menu">
                        <${User} />
                    </button>
                </div>
                
                <div class="dropdown-menu" id="dropdown-menu" role="menu">
                    <div class="dropdown-content">
                        <div class="dropdown-item has-text-weight-bold">
                            Hello, ${user.profile.name}!
                        </div>
                        
                        <div class="dropdown-item">
                            <button class="button is-danger is-fullwidth" onClick=${logout}>Logout</button>
                        </div>
                        
                    </div>
            </div>
        </div>
    `;
}
