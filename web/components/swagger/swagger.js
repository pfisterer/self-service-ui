import { html } from 'htm/preact';
import { useEffect, useRef } from 'preact/hooks';

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
    return html`
        <!-- Hide the top information container added by Swagger UI -->
        <style>
            #swagger-container div.information-container {
                display: none !important;
            }
        </style>

        <section class="mt-5">
            <div class="container">
                <h1 class="title">API Documentation</h1>


                <div class="panel">
                    <div class="panel-heading">Dynamic Zones API</div>
                    
                    <div class="panel-block" style="gap: 10px; align-items: center;">
                        <div>
                            The API endpoint is available at <code>${baseUrl}</code>. 
                            
                            See <a href="${swaggerJsonUrl}">swagger.json</a> for full API specification. 
                            
                            JavaScript (<a href="${jsClientUrl}">Client</a> and <a href="${jsSdkUrl}">SDKs</a>) and ESM-Module (<a href="${mjsClientUrl}">Client</a> and <a href="${mjsSdkUrl}">SDKs</a>) clients are available for accessing the API.
                        </div>
                    </div>

                    <!-- Main panel for Swagger UI -->
                    <div class="panel-block" style="gap: 10px; align-items: center;">
                        <div id="swagger-container" ref=${uiRef} style="width: 100%;">
                        </div>
                    </div>
                    
                </div>

            </div>
        </section>
    `;
}