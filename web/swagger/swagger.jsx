import { useEffect, useRef } from 'react';
import { Container, Title, Paper, Text, Anchor, Code, Stack, Box } from '@mantine/core';

import SwaggerUIBundle from 'swagger-ui-dist/swagger-ui-bundle.js';
import SwaggerUIStandalonePreset from 'swagger-ui-dist/swagger-ui-standalone-preset.js';
import 'swagger-ui-dist/swagger-ui.css';

export function DynamicZonesApiSwagger() {
    const baseUrl = window.appconfig.dynamicZonesBaseUrl
    const jsSdkUrl = new URL('../client/sdk.gen.js', baseUrl).href;
    const jsClientUrl = new URL('../client/client.gen.js', baseUrl).href;
    const mjsSdkUrl = new URL('../client/sdk.gen.mjs', baseUrl).href;
    const mjsClientUrl = new URL('../client/client.gen.mjs', baseUrl).href;
    const swaggerJsonUrl = new URL('/swagger.json', baseUrl).href;

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
                    <Title order={2}>API Documentation</Title>

                    <Paper shadow="sm" radius="md" withBorder>
                        <Stack gap="md">
                            <Paper p="md" withBorder style={{ backgroundColor: '#f8f9fa' }}>
                                <Title order={4}>Dynamic Zones API</Title>
                            </Paper>

                            <Box p="md">
                                <Text>
                                    The API endpoint is available at <Code>{baseUrl}</Code>.

                                    See <Anchor href={swaggerJsonUrl} target="_blank">swagger.json</Anchor> for full API specification.

                                    JavaScript (<Anchor href={jsClientUrl} target="_blank">Client</Anchor> and <Anchor href={jsSdkUrl} target="_blank">SDKs</Anchor>) and ESM-Module (<Anchor href={mjsClientUrl} target="_blank">Client</Anchor> and <Anchor href={mjsSdkUrl} target="_blank">SDKs</Anchor>) clients are available for accessing the API.
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
