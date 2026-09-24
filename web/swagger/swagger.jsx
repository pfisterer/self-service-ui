import { useEffect, useRef } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { ExternalLink } from '/helper/external-link.jsx';
import { Container, Title, Paper, Text, Code, Stack, Box } from '@mantine/core';

import SwaggerUIBundle from 'swagger-ui-dist/swagger-ui-bundle.js';
import SwaggerUIStandalonePreset from 'swagger-ui-dist/swagger-ui-standalone-preset.js';
import 'swagger-ui-dist/swagger-ui.css';

// Both APIs of this UI serve the same three things at their base — /swagger.json,
// /client/*, and the endpoints themselves (see api_static.go on either side) — so
// one component documents either of them. The two exports below name which.
export function DynamicZonesApiSwagger() {
    return <ApiDocumentation baseUrl={window.appconfig.dynamicZonesBaseUrl} title="Dynamic Zones API"
        npmPackage="@dhbw-cloud/dynamic-zones-client" />;
}

export function CloudProjectsApiSwagger() {
    return <ApiDocumentation baseUrl={window.appconfig.cloudResourcesBaseUrl} title="Cloud Projects API"
        npmPackage="@dhbw-cloud/os-mgt-client" />;
}

function ApiDocumentation({ baseUrl, title, npmPackage }) {
    const { t } = useTranslation();
    // All resolved RELATIVE to baseUrl (which has a trailing slash). In BFF mode
    // baseUrl is "https://<ui>/api/dyndns/", so these become
    // ".../api/dyndns/client/..." and ".../api/dyndns/swagger.json" — same origin,
    // through Caddy to the API. A LEADING SLASH ("/swagger.json") or "../client/"
    // would escape the /api/dyndns/ path and hit the UI root (404 -> index.html ->
    // "not a valid version field").
    //
    // These are a DOWNLOAD offer for third-party API consumers, not how this
    // app loads its own client — that is an npm dependency now (see d6). They
    // break the day the services stop embedding client-dist, so that step has
    // to replace them (with the package name and version, presumably).
    const swaggerJsonUrl = new URL('swagger.json', baseUrl).href;
    // The generated client used to be downloadable from this service under
    // /client. It is published to npm instead, versioned with the API that
    // produced it, so a consumer pins a version rather than fetching whatever
    // the server happens to serve — including this UI (see d6).
    const npmUrl = `https://www.npmjs.com/package/${npmPackage}`;

    // Use a ref to target the DOM element where Swagger UI will render
    const uiRef = useRef(null);

    // Run initialization only once after component mounts
    useEffect(() => {
        if (uiRef.current) {
            // Build the Swagger UI system
            SwaggerUIBundle({
                url: swaggerJsonUrl,
                domNode: uiRef.current,
                deepLinking: true,
                presets: [
                    SwaggerUIBundle.presets.apis,
                    SwaggerUIStandalonePreset
                ],
                plugins: [
                    SwaggerUIBundle.plugins.DownloadUrl
                ],
                layout: "BaseLayout",
                displayOperationId: false
            });
        }
        // Mount-only on purpose: SwaggerUIBundle takes over the container DOM
        // node itself, so re-running this would build a second UI inside it.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Render container div
    return (
        <>
            {/* Hide the top information container added by Swagger UI */}
            <style>{`
                #swagger-container div.information-container {
                    display: none !important;
                }
            `}</style>

            <Container size="xl" py="md">
                <Stack gap="lg">
                    <Title order={2}>{t('swagger.title')}</Title>

                    <Paper shadow="sm" radius="md" withBorder>
                        <Stack gap="md">
                            <Paper p="md" withBorder style={{ backgroundColor: '#f8f9fa' }}>
                                <Title order={4}>{title}</Title>
                            </Paper>

                            <Box p="md">
                                {/* The base URL, the package name and the install
                                    command go in as values: they are addresses and
                                    a command, and nothing about them is translated. */}
                                <Text>
                                    <Trans i18nKey="swagger.endpoint" values={{ baseUrl }}
                                        components={{ 1: <Code /> }} />
                                    {' '}
                                    <Trans i18nKey="swagger.specification"
                                        components={{ 1: <ExternalLink href={swaggerJsonUrl} /> }} />
                                    {' '}
                                    <Trans i18nKey="swagger.client"
                                        values={{ package: npmPackage, install: `npm install ${npmPackage}` }}
                                        components={{ 1: <ExternalLink href={npmUrl} />, 2: <Code />, 3: <Code /> }} />
                                </Text>
                            </Box>

                            {/* Main panel for Swagger UI */}
                            <Box p="md">
                                <div id="swagger-container" ref={uiRef} style={{ width: '100%' }}></div>
                            </Box>
                        </Stack>
                    </Paper>
                </Stack>
            </Container>
        </>
    );
}
