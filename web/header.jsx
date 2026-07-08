import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '/providers/auth.jsx';
import { User, ChevronDown } from "lucide-react";
import { Burger, Group, Button, Menu, Image, Container, Box } from '@mantine/core';

import dhbwLogoUrl from '/img/DHBW-Logo.svg';

export function Header() {
    const [opened, setOpened] = useState(false);
    const [currentPath] = useLocation();
    const { user, login, logout } = useAuth();

    const isDyndnsActive = currentPath.startsWith('/dyndns/');
    const isActive = (path) => currentPath === path || currentPath.startsWith(path + '/');

    // Only offer Cloud Projects where the backend is wired up (cloudResourcesBaseUrl
    // set). Without it the /projects route isn't registered, so the link would 404
    // (e.g. on prod, where it's intentionally disabled until it's ready).
    const cloudProjectsEnabled = Boolean(window?.appconfig?.cloudResourcesBaseUrl);

    const handleLinkClick = () => {
        setOpened(false);
    };

    return (
        <Box component="header" style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            backgroundColor: 'white',
            borderBottom: '1px solid #dee2e6',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
            <Container size="xl">
                <Group h={60} px="md" justify="space-between">
                    <Group>
                        <Burger opened={opened} onClick={() => setOpened(!opened)} hiddenFrom="sm" size="sm" />
                        <Link href="/" onClick={handleLinkClick}>
                            <Image src={dhbwLogoUrl} alt="DHBW Logo" h={28} w="auto" fit="contain" />
                        </Link>
                    </Group>

                    <Group gap="xs" visibleFrom="sm">
                        <Link href="/" onClick={handleLinkClick}>
                            <Button variant={isActive('/') && !isDyndnsActive && !isActive('/projects') ? 'filled' : 'subtle'} size="sm">
                                Home
                            </Button>
                        </Link>

                        <Menu trigger="hover" openDelay={100} closeDelay={200}>
                            <Menu.Target>
                                <Button variant={isDyndnsActive ? 'filled' : 'subtle'} size="sm" rightSection={<ChevronDown size="16" />}>
                                    DNS Zones
                                </Button>
                            </Menu.Target>
                            <Menu.Dropdown>
                                <Link href="/dyndns/zones" onClick={handleLinkClick}>
                                    <Menu.Item>Zone Management</Menu.Item>
                                </Link>
                                <Link href="/dyndns/tokens" onClick={handleLinkClick}>
                                    <Menu.Item>API Tokens</Menu.Item>
                                </Link>
                                <Link href="/dyndns/policy" onClick={handleLinkClick}>
                                    <Menu.Item>DNS Policy</Menu.Item>
                                </Link>
                                <Link href="/dyndns/api-doc" onClick={handleLinkClick}>
                                    <Menu.Item>API Documentation</Menu.Item>
                                </Link>
                            </Menu.Dropdown>
                        </Menu>

                        {cloudProjectsEnabled && (
                            <Link href="/projects" onClick={handleLinkClick}>
                                <Button variant={isActive('/projects') ? 'filled' : 'subtle'} size="sm">
                                    Cloud Projects
                                </Button>
                            </Link>
                        )}
                    </Group>

                    <Group>
                        {user ? (
                            <Menu trigger="hover" openDelay={100} closeDelay={200}>
                                <Menu.Target>
                                    <Button variant="subtle" size="sm" leftSection={<User size="16" />}>
                                        {user.profile.name}
                                    </Button>
                                </Menu.Target>
                                <Menu.Dropdown>
                                    <Menu.Label>Hello, {user.profile.name}!</Menu.Label>
                                    <Menu.Divider />
                                    <Menu.Item color="red" onClick={logout}>Logout</Menu.Item>
                                </Menu.Dropdown>
                            </Menu>
                        ) : (
                            <Button onClick={login} size="sm">Login</Button>
                        )}
                    </Group>
                </Group>

                {opened && (
                    <Box pb="md" hiddenFrom="sm">
                        <Group direction="column" gap="xs" align="stretch">
                            <Link href="/" onClick={handleLinkClick}>
                                <Button variant={isActive('/') ? 'filled' : 'subtle'} size="sm" fullWidth>
                                    Home
                                </Button>
                            </Link>

                            <Menu trigger="click">
                                <Menu.Target>
                                    <Button variant={isDyndnsActive ? 'filled' : 'subtle'} size="sm" fullWidth rightSection={<ChevronDown size="16" />}>
                                        DNS Zones
                                    </Button>
                                </Menu.Target>
                                <Menu.Dropdown>
                                    <Link href="/dyndns/zones" onClick={handleLinkClick}>
                                        <Menu.Item>Zone Management</Menu.Item>
                                    </Link>
                                    <Link href="/dyndns/tokens" onClick={handleLinkClick}>
                                        <Menu.Item>API Tokens</Menu.Item>
                                    </Link>
                                    <Link href="/dyndns/policy" onClick={handleLinkClick}>
                                        <Menu.Item>DNS Policy</Menu.Item>
                                    </Link>
                                    <Link href="/dyndns/api-doc" onClick={handleLinkClick}>
                                        <Menu.Item>API Documentation</Menu.Item>
                                    </Link>
                                </Menu.Dropdown>
                            </Menu>

                            {cloudProjectsEnabled && (
                                <Link href="/projects" onClick={handleLinkClick}>
                                    <Button variant={isActive('/projects') ? 'filled' : 'subtle'} size="sm" fullWidth>
                                        Cloud Projects
                                    </Button>
                                </Link>
                            )}
                        </Group>
                    </Box>
                )}
            </Container>
        </Box>
    );
}
