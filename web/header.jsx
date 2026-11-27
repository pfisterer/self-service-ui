import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '/providers/auth.jsx';
import { useConfirm } from '/providers/confirm.jsx';
import { Bell, Code2, Languages, LogOut, User } from "lucide-react";
import { notificationsEnabled } from '/features.js';
import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '/i18n/index.js';
import { HEADER_HEIGHT, NAV_BREAKPOINT, SUBNAV_HEIGHT, useNav } from '/nav.jsx';
import { ActAsButton } from '/act-as-controls.jsx';
import { actingAsAtLoad } from '/providers/acting-as.js';
import { NotificationBell } from '/notifications/bell.jsx';
import { bellEnabled } from '/notifications/bell.js';
import { subNavRuns } from '/nav-v2.js';
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

// LanguageMenu switches the language of everything on the screen, including how
// dates are written (see i18n/index.js). It sits beside the account because it
// is a setting of the person, not of the page they are on. The current language
// is named in its own words — "Deutsch", not "German".
function LanguageMenu() {
    const { t, i18n } = useTranslation();
    const current = LANGUAGES.find(l => l.code === i18n.resolvedLanguage) ?? LANGUAGES[0];
    return (
        <Menu trigger="hover" openDelay={100} closeDelay={200} position="bottom-end">
            <Menu.Target>
                <Button variant="subtle" size="sm" color="gray" aria-label={t('language.change')}
                    leftSection={<Languages size="16" />}>
                    <Text size="sm">{current.label}</Text>
                </Button>
            </Menu.Target>
            <Menu.Dropdown>
                <Menu.Label>{t('language.label')}</Menu.Label>
                {LANGUAGES.map(l => (
                    <Menu.Item key={l.code} onClick={() => i18n.changeLanguage(l.code)}
                        fw={l.code === current.code ? 600 : 400}>
                        {l.label}
                    </Menu.Item>
                ))}
            </Menu.Dropdown>
        </Menu>
    );
}

// "Something is waiting for you" — no number, see nav.jsx.
function PendingDot({ ml = 0 }) {
    const { t } = useTranslation();
    return (
        <Box component="span" ml={ml} w={7} h={7} aria-label={t('nav.pendingDot')}
            style={{ borderRadius: '50%', background: 'var(--mantine-color-orange-6)', display: 'inline-block' }} />
    );
}

// One second-level item: an underlined tab, the established indicator for "you
// are here" at this level. Its two ends are load-bearing — the underline marks
// the page, the missing fill keeps it subordinate to the buttons above.
// A vertical list gets the same marker turned 90°: an accent on the leading
// edge. A full-width underline down there would read as a divider between
// items, not as "this is the one you are on".
// tight: a filter inside a group, closer to its neighbours, so nearness alone shows that they belong together.
export function SubNavItem({ item, active, onClick, vertical = false, tight = false }) {
    const accent = `2px solid ${active ? 'var(--mantine-color-dhbw-6)' : 'transparent'}`;
    return (
        <Link href={item.href} onClick={onClick} style={vertical ? { width: '100%' } : undefined}>
            <Box py={vertical ? '6' : 0} style={{
                // Exactly the horizontal padding of a size="sm" Button
                // (Mantine's --button-padding-x-sm, scoped to the button itself,
                // so its definition is repeated rather than referenced). This is
                // what puts a tab label on the same x as the category above it.
                paddingInline: tight ? 'calc(0.375rem * var(--mantine-scale))' : 'calc(1.125rem * var(--mantine-scale))',
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
                {/* The label takes the width of its bold form from the start (an invisible bold copy in the same grid cell), so marking another item as active does not shift its neighbours. */}
                <span style={{ display: 'inline-grid' }}>
                    <span style={{ gridArea: '1 / 1' }}>{item.label}</span>
                    <span aria-hidden="true" style={{ gridArea: '1 / 1', fontWeight: 600, visibility: 'hidden' }}>{item.label}</span>
                </span>
                {item.dot && <PendingDot ml="6" />}
            </Box>
        </Link>
    );
}

// SubNavItems draws a section's items. A group (the projects page and its kinds) reads as its first item with the others in brackets after it, close together and dotted apart — "All [Cloud · Workspaces · LLM]" —, in the vertical menu indented under it instead. An item apart from the rest ("Meine Ressourcen") follows a divider.
function SubNavItems({ items, activeItem, onClick, vertical = false }) {
    const link = (item, tight) => <SubNavItem key={item.href} item={item} onClick={onClick} vertical={vertical} tight={tight} active={activeItem?.href === item.href} />;
    const mark = (key, text) => <Text key={key} span size="sm" c="dimmed" aria-hidden="true" style={{ alignSelf: 'center' }}>{text}</Text>;
    return subNavRuns(items).map(run => {
        const first = run.items[0];
        const divider = run.apart && (vertical
            ? <Divider key={`d-${first.href}`} my="6" />
            : <Divider key={`d-${first.href}`} orientation="vertical" mx="10" my="10" />);
        if (!run.group || run.items.length === 1) return [divider, ...run.items.map(i => link(i, false))];
        const rest = run.items.slice(1);
        if (vertical) {
            return [divider, link(first, false), <Box key={`g-${first.href}`} pl="md">{rest.map(i => link(i, false))}</Box>];
        }
        const inner = rest.flatMap((item, i) => (i === 0 ? [link(item, true)] : [mark(`dot-${item.href}`, '·'), link(item, true)]));
        return [divider, (
            <Box key={`g-${first.href}`} style={{ display: 'flex', alignItems: 'stretch', height: '100%' }}>
                {link(first, false)}
                {mark(`open-${first.href}`, '[')}
                {inner}
                {mark(`close-${first.href}`, ']')}
            </Box>
        )];
    });
}

export function Header() {
    const { t } = useTranslation();
    const [opened, setOpened] = useState(false);
    const { user, login, logout, useDummyAuth } = useAuth();
    const confirm = useConfirm();
    const { sections, activeSection, activeItem, subNavItems } = useNav();

    // Signing out ends the DHBW Cloud session (proxy cookie + Keycloak) but the
    // upstream bwIDM / home-IdP single sign-on survives it — and since the whole
    // UI sits behind the auth proxy, the post-logout redirect lands straight on
    // the sign-in mask, so there is no page to explain that AFTERWARDS. The
    // honest explanation therefore lives here, before the chain starts.
    // Dev/dummy mode has no SSO chain, so no dialog there.
    const [, navigate] = useLocation();
    const confirmLogout = async () => {
        if (useDummyAuth) return logout();
        const ok = await confirm({
            title: t('account.signOutTitle'),
            message: t('account.signOutMessage'),
            confirmLabel: t('account.signOut'),
            icon: <LogOut size="16" />,
        });
        if (ok) logout();
    };

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
                                <SubNavItems items={subNavItems} activeItem={activeItem} onClick={close} />
                            </Group>
                        )}
                    </Box>

                    {/* The right-hand column: language, acting on behalf and the
                        account, on the first row. */}
                    <Box style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <Box h={HEADER_HEIGHT} style={{ display: 'flex', alignItems: 'center' }}>
                        <LanguageMenu />
                        {/* Right before the account it acts for: one click to act
                            on behalf of somebody, and back (admins only). */}
                        {user && <ActAsButton />}
                        {/* The bell sits in this one header, which both layouts share (classic and ui-v2 differ in their navigation only). */}
                        {bellEnabled({ enabled: notificationsEnabled, user, actingAs: actingAsAtLoad }) && <NotificationBell person={user.profile?.email} />}
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
                                    <Menu.Label>{t('account.greeting', { name: user.profile.name })}</Menu.Label>
                                    <Menu.Divider />
                                    {/* API tokens and documentation: for scripts, out of the areas' navigation. */}
                                    <Menu.Item leftSection={<Code2 size={14} />} onClick={() => navigate('/developer')}>{t('account.developer')}</Menu.Item>
                                    {notificationsEnabled && <Menu.Item leftSection={<Bell size={14} />} onClick={() => navigate('/settings/notifications')}>{t('account.notifications')}</Menu.Item>}
                                    <Menu.Divider />
                                    <Menu.Item color="red" onClick={confirmLogout}>{t('account.signOut')}</Menu.Item>
                                </Menu.Dropdown>
                            </Menu>
                        ) : (
                            <Button onClick={login} size="sm">{t('account.signIn')}</Button>
                        )}
                    </Box>
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
                                        <SubNavItems items={section.items} activeItem={activeItem} onClick={close} vertical />
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
