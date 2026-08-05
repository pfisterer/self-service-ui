import { useState } from 'react';
import { Link } from 'wouter';
import { useAuth } from '/providers/auth.jsx';
import { User } from "lucide-react";
import { HEADER_HEIGHT, NAV_BREAKPOINT, SUBNAV_HEIGHT, useNav } from '/nav.jsx';
import { Burger, Group, Button, Menu, Image, Box, Divider, Stack, Text } from '@mantine/core';

import dhbwLogoUrl from '/img/DHBW-Logo.svg';

// The shape of this header follows what products with the same two-level
// navigation converged on (GitHub, Stripe, Vercel):
//
//   row 1   logo · categories (left) ............ account (right)
//   row 2   the current category's pages, as underlined tabs
//
// The bar itself spans the window (the page content below keeps its width cap),
// both navigation rows share one left edge, and the active tab's underline sits
// ON the header's bottom border — that shared edge is what ties the two levels
// together, not the distance between them. The parent level sits directly above
// the child level, which is what lets a reader tell them apart at a glance.

// "Something is waiting for you" — no number, see nav.jsx.
function PendingDot({ ml = 0 }) {
    return (
        <Box component="span" ml={ml} w={7} h={7} aria-label="Requests are waiting for your decision"
            style={{ borderRadius: '50%', background: 'var(--mantine-color-orange-6)', display: 'inline-block' }} />
    );
}

// One second-level item: an underlined tab, the established indicator for "you
// are here" at this level. Its two ends are load-bearing — the underline marks
// the page, the missing fill keeps it subordinate to the buttons above.
// A vertical list gets the same marker turned 90°: an accent on the leading
// edge. A full-width underline down there would read as a divider between
// items, not as "this is the one you are on".
function SubNavItem({ item, active, onClick, vertical = false }) {
    const accent = `2px solid ${active ? 'var(--mantine-color-dhbw-6)' : 'transparent'}`;
    return (
        <Link href={item.href} onClick={onClick} style={vertical ? { width: '100%' } : undefined}>
            <Box py={vertical ? '6' : 0} style={{
                // Exactly the horizontal padding of a size="sm" Button
                // (Mantine's --button-padding-x-sm, scoped to the button itself,
                // so its definition is repeated rather than referenced). This is
                // what puts a tab label on the same x as the category above it.
                paddingInline: 'calc(1.125rem * var(--mantine-scale))',
                display: 'flex',
                alignItems: 'center',
                height: vertical ? undefined : '100%',
                ...(vertical ? { borderLeft: accent } : { borderBottom: accent }),
                color: active ? 'var(--mantine-color-dhbw-7)' : 'var(--mantine-color-gray-7)',
                fontWeight: active ? 600 : 400,
                fontSize: 'var(--mantine-font-size-sm)',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
            }}>
                {item.label}
                {item.dot && <PendingDot ml="6" />}
            </Box>
        </Link>
    );
}

export function Header() {
    const [opened, setOpened] = useState(false);
    const { user, login, logout } = useAuth();
    const { sections, activeSection, activeItem, subNavItems } = useNav();

    const close = () => setOpened(false);
    const hasSubNav = subNavItems.length > 0;

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
            {/* No width cap here, unlike the page below: a header that stops short
                of the window edges leaves the logo floating in from the left and
                the account floating in from the right, which is what looks odd on
                a wide screen. The bar spans the window, the content underneath
                stays capped. */}
            <Box>
                {/* wrap="nowrap": the row must never break. A wrapped header drops
                    the account button onto the navigation below it — below
                    NAV_BREAKPOINT the burger takes over instead.

                    align="stretch" gives the navigation column the full header
                    height, which is what lets its second row end exactly on the
                    header's bottom border. Logo and account keep the height of
                    the first row and centre in it, so they do not drift downwards
                    when the second row appears. */}
                {/* The height has to be as responsive as the second row itself:
                    below the breakpoint that row is hidden, so reserving space
                    for it would make the bar taller than what the shell offsets
                    the content by — and the header would cover the top of the
                    page. Same source of truth as the shell (see index.jsx).

                    px="xl" (32px) is not a taste decision: it is what the page
                    content below is inset by (AppShell padding md + Container
                    padding md), and that is what puts the logo, the tabs, the
                    page heading and the footer on one vertical line. */}
                <Group h={{ base: HEADER_HEIGHT, [NAV_BREAKPOINT]: hasSubNav ? HEADER_HEIGHT + SUBNAV_HEIGHT : HEADER_HEIGHT }}
                    px="xl" gap="lg" wrap="nowrap" align="stretch">
                    <Group gap="sm" wrap="nowrap" h={HEADER_HEIGHT}>
                        <Burger opened={opened} onClick={() => setOpened(!opened)}
                            hiddenFrom={NAV_BREAKPOINT} size="sm" />
                        <Link href="/" onClick={close}>
                            <Image src={dhbwLogoUrl} alt="DHBW Logo" h={28} w="auto" fit="contain" />
                        </Link>
                    </Group>

                    {/* Both levels in one column, sharing a left edge: the child row
                        starts under the labels of the row above, which is what makes
                        the two read as one navigation instead of two strips. */}
                    <Box visibleFrom={NAV_BREAKPOINT} style={{ display: 'flex', flexDirection: 'column' }}>
                        {/* The active category is tinted, not filled: the underline
                            below already carries a strong marker, and two loud signals
                            above each other compete instead of guiding. */}
                        <Group gap="4" wrap="nowrap" h={HEADER_HEIGHT}>
                            {sections.map(section => {
                                const active = activeSection?.id === section.id;
                                return (
                                    <Link key={section.id} href={section.href} onClick={close}>
                                        <Button size="sm" variant={active ? 'light' : 'subtle'}
                                            color={active ? undefined : 'gray'}
                                            fw={active ? 600 : 500}>
                                            {section.label}
                                            {section.dot && <PendingDot ml="6" />}
                                        </Button>
                                    </Link>
                                );
                            })}
                        </Group>

                        {hasSubNav && (
                            // No padding of its own: the tabs carry the same inset as
                            // the buttons above, so both rows start on one line.
                            // mb -1 lets the active underline sit on the header's own
                            // bottom border, so the tab is attached to the header
                            // instead of floating above the page.
                            <Group gap="0" wrap="nowrap" h={SUBNAV_HEIGHT}
                                style={{ marginBottom: -1 }}>
                                {subNavItems.map(item => (
                                    <SubNavItem key={item.href} item={item} onClick={close}
                                        active={activeItem?.href === item.href} />
                                ))}
                            </Group>
                        )}
                    </Box>

                    <Box h={HEADER_HEIGHT} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                        {user ? (
                            <Menu trigger="hover" openDelay={100} closeDelay={200}>
                                <Menu.Target>
                                    <Button variant="subtle" size="sm" color="gray"
                                        leftSection={<User size="16" />}>
                                        {/* Truncation is a safety net for unusually long
                                            names, not the normal case — an address like
                                            firstname.lastname@dhbw.de fits. */}
                                        <Text size="sm" truncate maw={260}>{user.profile.name}</Text>
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
                    </Box>
                </Group>
            </Box>

            {/* ── Burger: the whole tree, not just the active branch ─────── */}
            {opened && (
                <Box pb="md" px="xl" hiddenFrom={NAV_BREAKPOINT} style={{ backgroundColor: 'white' }}>
                    <Stack gap="xs">
                        {sections.map((section, index) => (
                            <Box key={section.id}>
                                {index > 0 && <Divider mb="xs" />}
                                <Link href={section.href} onClick={close}>
                                    <Button size="sm" fullWidth justify="flex-start"
                                        variant={activeSection?.id === section.id ? 'light' : 'subtle'}
                                        color={activeSection?.id === section.id ? undefined : 'gray'}
                                        fw={600}>
                                        {section.label}
                                        {section.dot && <PendingDot ml="6" />}
                                    </Button>
                                </Link>
                                {/* Indented under their category: the whole navigation
                                    is open at once here, and the offset is what keeps
                                    the two levels apart. */}
                                {section.items.length > 0 && (
                                    <Stack gap="0" pl="lg" mt="4">
                                        {section.items.map(item => (
                                            <SubNavItem key={item.href} item={item} onClick={close} vertical
                                                active={activeItem?.href === item.href} />
                                        ))}
                                    </Stack>
                                )}
                            </Box>
                        ))}
                    </Stack>
                </Box>
            )}
        </Box>
    );
}
