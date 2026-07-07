import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import './app.css';

import { createRoot } from 'react-dom/client';
import { lazy, Suspense } from 'react';
import { Router, Route, Switch, useLocation } from 'wouter';
import { MantineProvider, AppShell, v8CssVariablesResolver } from '@mantine/core';
import { Container, Paper, Anchor } from '@mantine/core';

import { DynDnsConfigProvider } from '/providers/dyndns-config.jsx';
import { CloudConfigProvider } from '/providers/cloud-config.jsx';
import { useAuth, AuthProvider } from '/providers/auth.jsx';
import { ErrorModalProvider } from '/providers/error-modal.jsx';

import { Header } from '/header.jsx';
import { Footer } from '/footer.jsx';
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
    }}>
        <ErrorBoundary>
            <App name="Dynamic Zones DNS API" />
        </ErrorBoundary>
    </MantineProvider>
)

function App() {
    return (
        <ErrorModalProvider>
            <DynDnsConfigProvider>
                <CloudConfigProvider>
                    <AuthProvider>
                        <Main />
                    </AuthProvider>
                </CloudConfigProvider>
            </DynDnsConfigProvider>
        </ErrorModalProvider>
    );
}

function AppRoutes() {
    const { client: projectClient } = useClient('projects');
    const [location] = useLocation();

    return (
        <Suspense fallback={<Container size="md" py="xl">Lädt…</Container>}>
            <ErrorBoundary key={location}>
                <Switch>
                    <Route path="/" component={Home}/>
                    <Route path="/dyndns" component={DynamicDnsManagement} nest/>
                    {projectClient && <Route path="/projects" component={CloudProjectManagement} nest/>}
                    <Route component={NotFound} />
                </Switch>
            </ErrorBoundary>
        </Suspense>
    );
}

function Main() {
    const { user, login } = useAuth()
    const footer = <Footer title={<b>dhbwCloud Self Service</b>} version={__APP_VERSION__} />

    return (
        <AppShell header={{ height: 60 }} padding="md">
            <AppShell.Header>
                <Header/>
            </AppShell.Header>
            <AppShell.Main>

                {!user ? (
                    <Delayed waitMs={200}>
                        <Container size="md" py="xl">
                            <Paper p="lg" withBorder>
                                Please <Anchor onClick={login} style={{ cursor: 'pointer' }}>log in</Anchor> to access your data.
                            </Paper>
                        </Container>
                    </Delayed>
                ) : (
                    <Router>
                        <ClientProvider name="dyndns" baseURL={window?.appconfig?.dynamicZonesBaseUrl}>
                            <ClientProvider name="projects" baseURL={window?.appconfig?.cloudResourcesBaseUrl}>
                                <AppRoutes />
                            </ClientProvider>
                        </ClientProvider>
                    </Router>
                )}
                {footer}
            </AppShell.Main>
        </AppShell>
    );
}

function NotFound() {
    return (
        <Container size="md">
            <Paper p="lg" withBorder>404: Page not found</Paper>
        </Container>
    );
}
