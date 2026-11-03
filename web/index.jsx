import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/dropzone/styles.css';
import './app.css';

import { createRoot } from 'react-dom/client';
import { lazy, Suspense } from 'react';
import { Redirect, Router, Route, Switch, useLocation } from 'wouter';

import { cloudProjectsEnabled, dnsZonesEnabled, groupsEnabled, llmEnabled } from '/features.js';
// Imported for its side effect: initialising i18next before the first render,
// so nothing flashes in one language and settles in another.
import '/i18n/index.js';
import { useTranslation } from 'react-i18next';
import { DatesProvider } from '@mantine/dates';
import { MantineProvider, AppShell, v8CssVariablesResolver } from '@mantine/core';
import { Container, Paper, Box, Center, Stack, Title, Text, Button, ThemeIcon } from '@mantine/core';
import { LogIn } from 'lucide-react';

import { DynDnsConfigProvider } from '/providers/dyndns-config.jsx';
import { CloudConfigProvider } from '/providers/cloud-config.jsx';
import { useAuth, AuthProvider } from '/providers/auth.jsx';
import { ActAsProvider } from '/providers/act-as.jsx';
import { ActAsBanner } from '/act-as-controls.jsx';
import { SessionProvider } from '/providers/session.jsx';
import { ErrorModalProvider } from '/providers/error-modal.jsx';
import { ConfirmProvider } from '/providers/confirm.jsx';
import { QueryProvider } from '/providers/query.jsx';

import { Header } from '/header.jsx';
import { HEADER_HEIGHT, NAV_BREAKPOINT, SUBNAV_HEIGHT, useNav } from '/nav.jsx';
import { Footer } from '/footer.jsx';
import { CloudStatusProvider } from './projects/cloud-status.jsx';
import { Home } from '/home/home.jsx';
import { Developer } from '/developer/developer.jsx';
import { Delayed } from '/helper/delayed.jsx';
import { ErrorBoundary } from '/helper/error-boundary.jsx';
import { SignInOutageBanner } from '/helper/sign-in-status.jsx';
import { ClientProvider } from './providers/client.jsx';

// Route-level code splitting: the projects and dyndns trees (swagger-ui lives
// inside the latter) load as separate chunks only when their route is visited.
const CloudSection = lazy(() =>
    import('./projects/projects.jsx').then(m => ({ default: m.CloudSection })));
const BudgetsSection = lazy(() =>
    import('./projects/projects.jsx').then(m => ({ default: m.BudgetsSection })));
const ProjectsStart = lazy(() =>
    import('./projects/projects.jsx').then(m => ({ default: m.ProjectsStart })));
const DynamicDnsManagement = lazy(() =>
    import('./dyndns/dyndns-routes.jsx').then(m => ({ default: m.DynamicDnsManagement })));
// Lazy for the same reason, and one reason more: this page touches BOTH section
// facades, so eagerly importing it would pull every operation of both SDKs into
// the main bundle.
const LlmManagement = lazy(() =>
    import('./llm/llm-routes.jsx').then(m => ({ default: m.LlmManagement })));
const GpuManagement = lazy(() =>
    import('./gpu/gpu-routes.jsx').then(m => ({ default: m.GpuManagement })));
const GroupsSection = lazy(() =>
    import('./groups/groups-routes.jsx').then(m => ({ default: m.GroupsSection })));

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
            <Localized>
                <App name="Dynamic Zones DNS API" />
            </Localized>
        </ErrorBoundary>
    </MantineProvider>
)

// Localized hands the chosen language to Mantine's calendars, which format
// their own month names and weekday headers.
//
// The `key` remounts the app when the language changes. Text inside components
// follows by itself (useTranslation subscribes), but dates do not: they are
// written by plain functions outside React — format-date.js and dayjs, called
// from helpers that no hook can reach — so a card showing a date would keep the
// old spelling until it next rendered for some other reason. Remounting on a
// deliberate, rare click is the cheap way to make the whole screen agree.
function Localized({ children }) {
    const { i18n } = useTranslation();
    return (
        <DatesProvider key={i18n.resolvedLanguage} settings={{ locale: i18n.resolvedLanguage }}>
            {children}
        </DatesProvider>
    );
}

function App() {
    return (
        <QueryProvider>
            <ErrorModalProvider>
                <ConfirmProvider>
                    <DynDnsConfigProvider>
                        <CloudConfigProvider>
                            <AuthProvider>
                                {/* Above the clients, because their 401 interceptor
                                    reports an expired session to it. */}
                                <SessionProvider>
                                    <Main />
                                </SessionProvider>
                            </AuthProvider>
                        </CloudConfigProvider>
                    </DynDnsConfigProvider>
                </ConfirmProvider>
            </ErrorModalProvider>
        </QueryProvider>
    );
}

function AppRoutes() {
    const [location] = useLocation();

    // Whether the Cloud Projects section exists at all. This used to be implied
    // by "did the API client finish loading" — with the client bundled at build
    // time that side effect is gone, so the gate has to be stated. Getting it
    // wrong would open the section on an environment that deliberately hides it
    // (production sets no cloudResourcesBaseUrl). nav.jsx reads the same thing.
    // (see /features.js — the same flag nav.jsx and the projects API read)

    // Reset the error boundary only when switching between top-level sections
    // (/, /dyndns, /projects) — NOT on every sub-navigation. Keying on the full
    // location remounted the entire route subtree on each tab/zone switch, which
    // refetched everything (zone list + zone + tokens) and made the page collapse
    // and the footer jump. The first path segment is stable across sub-routes.
    const section = '/' + (location.split('/')[1] || '');

    return (
        <Suspense fallback={<Loading />}>
            <ErrorBoundary key={section}>
                <Switch>
                    <Route path="/" component={Home} />
                    {dnsZonesEnabled && <Route path="/dyndns" component={DynamicDnsManagement} nest />}
                    {cloudProjectsEnabled && <Route path="/cloud" component={CloudSection} nest />}
                    {cloudProjectsEnabled && <Route path="/budgets" component={BudgetsSection} nest />}
                    {/* The start page for a project of an area (/projects/start?for=…). */}
                    {cloudProjectsEnabled && <Route path="/projects" component={ProjectsStart} nest />}
                    {llmEnabled && <Route path="/llm" component={LlmManagement} nest />}
                    {llmEnabled && <Route path="/workspaces" component={GpuManagement} nest />}
                    {groupsEnabled && <Route path="/groups" component={GroupsSection} nest />}
                    <Route path="/developer" component={Developer} />
                    <Route component={NotFound} />
                </Switch>
            </ErrorBoundary>
        </Suspense>
    );
}

function Main() {
    const { t } = useTranslation();
    const { user, login } = useAuth()
    const footer = <Footer title={<b>dhbwCloud Self Service</b>} version={__APP_VERSION__} />

    // Router and clients wrap the WHOLE shell, not just the routes: the header
    // menu needs the cloud status (root admin? open requests?), and that comes
    // from the same API the section below uses.
    return (
        <Router>
        <ClientProvider>
        <CloudStatusProvider>
        {/* Above the header, which offers acting on behalf of somebody, and the
            banner below it, which says so on every page. */}
        <ActAsProvider>
        <Shell footer={footer}>
                    {/* Above the sign-in prompt as well: that is where a person
                        lands who is about to try a login that cannot work. */}
                    <SignInOutageBanner />
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
                                        <Title order={2}>{t('app.signInTitle')}</Title>
                                        <Text c="dimmed" size="lg">
                                            {t('app.signInMessage')}
                                        </Text>
                                        <Button size="lg" onClick={login} leftSection={<LogIn size={20} />}>
                                            {t('app.logIn')}
                                        </Button>
                                    </Stack>
                                </Paper>
                            </Center>
                        </Delayed>
                    ) : (
                        <AppRoutes />
                    )}
        </Shell>
        </ActAsProvider>
        </CloudStatusProvider>
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
                <Box style={{ flexGrow: 1 }}>
                    <ActAsBanner />
                    {children}
                </Box>
                {footer}
            </AppShell.Main>
        </AppShell>
    );
}

// Shown while a section's chunk is still loading — see AppRoutes.
function Loading() {
    const { t } = useTranslation();
    return <Container size="md" py="xl">{t('app.loading')}</Container>;
}

function NotFound() {
    const { t } = useTranslation();
    return (
        <Container size="md">
            <Paper p="lg" withBorder>{t('app.notFound')}</Paper>
        </Container>
    );
}
