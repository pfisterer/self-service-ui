import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import './app.css';

import { createRoot } from 'react-dom/client';
import { lazy, Suspense, useState } from 'react';
import { Router, Route, Switch, useLocation } from 'wouter';
import { MantineProvider, AppShell, v8CssVariablesResolver } from '@mantine/core';
import { Container, Paper, Box, Center, Stack, Title, Text, Button, ThemeIcon, TextInput, Anchor, Group } from '@mantine/core';
import { LogIn } from 'lucide-react';

import { DynDnsConfigProvider } from '/providers/dyndns-config.jsx';
import { CloudConfigProvider } from '/providers/cloud-config.jsx';
import { useAuth, AuthProvider } from '/providers/auth.jsx';
import { ErrorModalProvider } from '/providers/error-modal.jsx';
import { ConfirmProvider } from '/providers/confirm.jsx';

import { Header } from '/header.jsx';
import { HEADER_HEIGHT, NAV_BREAKPOINT, SUBNAV_HEIGHT, useNav } from '/nav.jsx';
import { Footer } from '/footer.jsx';
import { CloudStatusProvider } from './projects/cloud-status.jsx';
import { Home } from '/home/home.jsx';
import { Delayed } from '/helper/delayed.jsx';
import { ErrorBoundary } from '/helper/error-boundary.jsx';
import { ClientProvider, useClient } from './providers/client.jsx';

// Route-level code splitting: the projects and dyndns trees (swagger-ui lives
// inside the latter) load as separate chunks only when their route is visited.
const CloudProjectManagement = lazy(() =>
    import('./projects/projects.jsx').then(m => ({ default: m.CloudProjectManagement })));
const DynamicDnsManagement = lazy(() =>
    import('./dyndns/dyndns-routes.jsx').then(m => ({ default: m.DynamicDnsManagement })));

createRoot(document.getElementById('app')).render(
    <MantineProvider
        defaultColorScheme="light"
        cssVariablesResolver={v8CssVariablesResolver}
        theme={{
            primaryColor: 'dhbw',
            // Mantine 9 changed the default radius sm(4px)->md(8px); keep the old
            // look. v8CssVariablesResolver above keeps the v8 light-variant colors.
            defaultRadius: 'sm',
            colors: {
                dhbw: ['#F5D8D8', '#E69C9A', '#DD6462', '#D52C2A', '#CF2C29', '#B32421', '#991B1A', '#7D1312', '#600B0B', '#400404'],
                neutral: ['#F0F1F1', '#D9DBDC', '#BFC3C5', '#A5A9AB', '#8B8F91', '#788187', '#5F6466', '#474C4E', '#303537', '#1A1E20'],
            },
            fontFamily: 'Arial, sans-serif',
            components: {
                // Every page wraps itself in a Container, which Mantine centres
                // by default. Left-aligned instead, because the header spans the
                // window: centred content would start at a different x than the
                // logo and the tabs above it, and the eye follows that edge.
                // The width cap stays — only the leftover space moves to the
                // right-hand side.
                Container: Container.extend({
                    styles: { root: { marginInlineStart: 0 } },
                }),
            },
        }}>
        <ErrorBoundary>
            <App name="Dynamic Zones DNS API" />
        </ErrorBoundary>
    </MantineProvider>
)

function App() {
    return (
        <ErrorModalProvider>
            <ConfirmProvider>
                <DynDnsConfigProvider>
                    <CloudConfigProvider>
                        <AuthProvider>
                            <Main />
                        </AuthProvider>
                    </CloudConfigProvider>
                </DynDnsConfigProvider>
            </ConfirmProvider>
        </ErrorModalProvider>
    );
}

function AppRoutes() {
    const { client: projectClient, error: projectClientError } = useClient('projects');
    const [location] = useLocation();

    // The /projects route only exists once its API client has been built, which
    // happens asynchronously (the generated SDK is imported at runtime). Until
    // then nothing matches /projects/... and the fall-through below would answer
    // a deep link with "404: Page not found" for a moment — visible on every
    // reload of a bookmarked budget page. So while the client is still on its
    // way, an unmatched path is "not yet", not "not there".
    const cloudConfigured = Boolean(window?.appconfig?.cloudResourcesBaseUrl);
    const cloudPending = cloudConfigured && !projectClient && !projectClientError;

    // Reset the error boundary only when switching between top-level sections
    // (/, /dyndns, /projects) — NOT on every sub-navigation. Keying on the full
    // location remounted the entire route subtree on each tab/zone switch, which
    // refetched everything (zone list + zone + tokens) and made the page collapse
    // and the footer jump. The first path segment is stable across sub-routes.
    const section = '/' + (location.split('/')[1] || '');

    return (
        <Suspense fallback={<Container size="md" py="xl">Lädt…</Container>}>
            <ErrorBoundary key={section}>
                <Switch>
                    <Route path="/" component={Home} />
                    <Route path="/dyndns" component={DynamicDnsManagement} nest />
                    {projectClient && <Route path="/projects" component={CloudProjectManagement} nest />}
                    <Route component={cloudPending ? Loading : NotFound} />
                </Switch>
            </ErrorBoundary>
        </Suspense>
    );
}

function Main() {
    const { user, login, useDummyAuth, dev_user } = useAuth()
    // Dev-only: the email to sign in as (dummy auth lets you be ANY user).
    const [devEmail, setDevEmail] = useState(dev_user || 'dennis.pfisterer@dhbw.de')
    const footer = <Footer title={<b>dhbwCloud Self Service</b>} version={__APP_VERSION__} />

    // Router and clients wrap the WHOLE shell, not just the routes: the header
    // menu needs the cloud status (root admin? open requests?), and that comes
    // from the same API the section below uses.
    return (
        <Router>
        <ClientProvider name="dyndns" baseURL={window?.appconfig?.dynamicZonesBaseUrl}>
        <ClientProvider name="projects" baseURL={window?.appconfig?.cloudResourcesBaseUrl}>
        <CloudStatusProvider>
        <Shell footer={footer}>
                    {!user ? (
                        <Delayed waitMs={200}>
                            {/* Prominent, space-filling sign-in prompt: a large card
                                centered in the main viewport area so users clearly see
                                they need to log in. */}
                            <Center mih="calc(100dvh - 160px)" p="md">
                                <Paper p={40} radius="md" withBorder shadow="md" maw={480} w="100%" ta="center">
                                    <Stack align="center" gap="lg">
                                        <ThemeIcon size={72} radius="xl" variant="light">
                                            <LogIn size={38} />
                                        </ThemeIcon>
                                        <Title order={2}>Sign in required</Title>
                                        <Text c="dimmed" size="lg">
                                            Please sign in to access and manage your DNS zones and cloud resources.
                                        </Text>
                                        {useDummyAuth ? (
                                            // Dev/dummy auth: sign in as any user by typing an email.
                                            <Stack gap="sm" w="100%" maw={320}>
                                                <TextInput
                                                    label="Dev login — sign in as any user"
                                                    placeholder="user@dhbw.de"
                                                    value={devEmail}
                                                    onChange={(e) => setDevEmail(e.currentTarget.value)}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') login(devEmail); }}
                                                    data-autofocus
                                                />
                                                <Button size="lg" onClick={() => login(devEmail)} disabled={!devEmail.trim()} leftSection={<LogIn size={20} />}>
                                                    Log in
                                                </Button>
                                                {/* One-click sign-in as common dev users. */}
                                                <Stack gap={4} align="center" mt="xs">
                                                    <Text size="xs" c="dimmed">Quick sign-in:</Text>
                                                    {['dennis.pfisterer@dhbw.de', 'clemens.martin@dhbw.de'].map(e => (
                                                        <Anchor key={e} size="sm" onClick={() => login(e)} style={{ cursor: 'pointer' }}>{e}</Anchor>
                                                    ))}
                                                </Stack>
                                            </Stack>
                                        ) : (
                                            <Button size="lg" onClick={login} leftSection={<LogIn size={20} />}>
                                                Log in
                                            </Button>
                                        )}
                                    </Stack>
                                </Paper>
                            </Center>
                        </Delayed>
                    ) : (
                        <AppRoutes />
                    )}
        </Shell>
        </CloudStatusProvider>
        </ClientProvider>
        </ClientProvider>
        </Router>
    );
}

// The shell around every page. It lives below the Router because the header's
// height is not fixed: a section with a second navigation bar is taller, and
// AppShell derives the content offset from exactly this number — get it wrong
// and the page slides under the header.
function Shell({ children, footer }) {
    const { subNavItems } = useNav();
    const tall = HEADER_HEIGHT + SUBNAV_HEIGHT;

    return (
        // base: the second row is never shown below the breakpoint (the burger
        // holds the whole tree instead), so the header stays one row tall there.
        <AppShell padding="md"
            header={{ height: { base: HEADER_HEIGHT, [NAV_BREAKPOINT]: subNavItems.length > 0 ? tall : HEADER_HEIGHT } }}>
            <AppShell.Header>
                <Header />
            </AppShell.Header>
            {/* Flex column + full-viewport min-height makes the footer sticky: the
                content wrapper grows to fill the viewport, so the footer stays at
                the bottom even when content is short or briefly loading, instead of
                jumping up and back. The wrapper is a full-width block on purpose —
                the routed content sits in a Mantine Container, and as a DIRECT flex
                child its margins would shrink it to its content width and change
                its size between tabs (Manage 1223px vs others 1320px). Wrapping
                restores normal block sizing (always max-width). */}
            <AppShell.Main style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
                <Box style={{ flexGrow: 1 }}>{children}</Box>
                {footer}
            </AppShell.Main>
        </AppShell>
    );
}

// Shown while a section's client is still being built — see AppRoutes.
function Loading() {
    return <Container size="md" py="xl">Lädt…</Container>;
}

function NotFound() {
    return (
        <Container size="md">
            <Paper p="lg" withBorder>404: Page not found</Paper>
        </Container>
    );
}
