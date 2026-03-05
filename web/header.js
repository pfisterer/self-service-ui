import { useState } from 'preact/hooks';
import { html } from 'htm/preact';
import { Link, useLocation } from 'wouter-preact';
import { useAuth } from '/providers/auth.js';
import { User, ChevronDown } from "lucide-preact";
import { Burger, Group, Button, Menu, Image, Container, Box } from '@mantine/core';

import dhbwLogoUrl from '/img/DHBW-Logo.svg';

export function Header() {
    const [opened, setOpened] = useState(false);
    const [currentPath] = useLocation();
    const { user, login, logout } = useAuth();

    const isDyndnsActive = currentPath.startsWith('/dyndns/');
    const isActive = (path) => currentPath === path || currentPath.startsWith(path + '/');

    const handleLinkClick = () => {
        setOpened(false);
    };

    return html`
        <${Box} component="header" style=${{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            backgroundColor: 'white',
            borderBottom: '1px solid #dee2e6',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
            <${Container} size="xl">
                <${Group} h=${60} px="md" justify="space-between">
                    <${Group}>
                        <${Burger} opened=${opened} onClick=${() => setOpened(!opened)} hiddenFrom="sm" size="sm" />
                        <${Link} href="/" onClick=${handleLinkClick}>
                            <${Image} src=${dhbwLogoUrl} alt="DHBW Logo" h=${28} w="auto" fit="contain" />
                        <//>
                    <//>

                    <${Group} gap="xs" visibleFrom="sm">
                        <${Link} href="/" onClick=${handleLinkClick}>
                            <${Button} variant=${isActive('/') && !isDyndnsActive && !isActive('/cloudresources') && !isActive('/documentation') ? 'filled' : 'subtle'} size="sm">
                                Home
                            <//>
                        <//>

                        <${Menu} trigger="hover" openDelay=${100} closeDelay=${200}>
                            <${Menu.Target}>
                                <${Button} variant=${isDyndnsActive ? 'filled' : 'subtle'} size="sm" rightSection=${html`<${ChevronDown} size="16" />`}>
                                    DNS Zones
                                <//>
                            <//>
                            <${Menu.Dropdown}>
                                <${Link} href="/dyndns/zones" onClick=${handleLinkClick}>
                                    <${Menu.Item}>Zone Management<//>
                                <//>
                                <${Link} href="/dyndns/tokens" onClick=${handleLinkClick}>
                                    <${Menu.Item}>API Tokens<//>
                                <//>
                                <${Link} href="/dyndns/policy" onClick=${handleLinkClick}>
                                    <${Menu.Item}>DNS Policy<//>
                                <//>
                                <${Link} href="/dyndns/api-doc" onClick=${handleLinkClick}>
                                    <${Menu.Item}>API Documentation<//>
                                <//>
                            <//>
                        <//>

                        <${Link} href="/cloudresources" onClick=${handleLinkClick}>
                            <${Button} variant=${isActive('/cloudresources') ? 'filled' : 'subtle'} size="sm">
                                Cloud Resources
                            <//>
                        <//>

                        <${Link} href="/documentation" onClick=${handleLinkClick}>
                            <${Button} variant=${isActive('/documentation') ? 'filled' : 'subtle'} size="sm">
                                Documentation
                            <//>
                        <//>
                    <//>

                    <${Group}>
                        ${user ? html`
                            <${Menu} trigger="hover" openDelay=${100} closeDelay=${200}>
                                <${Menu.Target}>
                                    <${Button} variant="subtle" size="sm" leftSection=${html`<${User} size="16" />`}>
                                        ${user.profile.name}
                                    <//>
                                <//>
                                <${Menu.Dropdown}>
                                    <${Menu.Label}>Hello, ${user.profile.name}!<//>
                                    <${Menu.Divider} />
                                    <${Menu.Item} color="red" onClick=${logout}>Logout<//>
                                <//>
                            <//>
                        ` : html`
                            <${Button} onClick=${login} size="sm">Login<//>
                        `}
                    <//>
                <//>

                ${opened && html`
                    <${Box} pb="md" hiddenFrom="sm">
                        <${Group} direction="column" gap="xs" align="stretch">
                            <${Link} href="/" onClick=${handleLinkClick}>
                                <${Button} variant=${isActive('/') ? 'filled' : 'subtle'} size="sm" fullWidth>
                                    Home
                                <//>
                            <//>

                            <${Menu} trigger="click">
                                <${Menu.Target}>
                                    <${Button} variant=${isDyndnsActive ? 'filled' : 'subtle'} size="sm" fullWidth rightSection=${html`<${ChevronDown} size="16" />`}>
                                        DNS Zones
                                    <//>
                                <//>
                                <${Menu.Dropdown}>
                                    <${Link} href="/dyndns/zones" onClick=${handleLinkClick}>
                                        <${Menu.Item}>Zone Management<//>
                                    <//>
                                    <${Link} href="/dyndns/tokens" onClick=${handleLinkClick}>
                                        <${Menu.Item}>API Tokens<//>
                                    <//>
                                    <${Link} href="/dyndns/policy" onClick=${handleLinkClick}>
                                        <${Menu.Item}>DNS Policy<//>
                                    <//>
                                    <${Link} href="/dyndns/api-doc" onClick=${handleLinkClick}>
                                        <${Menu.Item}>API Documentation<//>
                                    <//>
                                <//>
                            <//>

                            <${Link} href="/cloudresources" onClick=${handleLinkClick}>
                                <${Button} variant=${isActive('/cloudresources') ? 'filled' : 'subtle'} size="sm" fullWidth>
                                    Cloud Resources
                                <//>
                            <//>

                            <${Link} href="/documentation" onClick=${handleLinkClick}>
                                <${Button} variant=${isActive('/documentation') ? 'filled' : 'subtle'} size="sm" fullWidth>
                                    Documentation
                                <//>
                            <//>
                        <//>
                    <//>
                `}
            <//>
        <//>
    `;
}
