import { html } from 'htm/preact';

export function Documentation() {

    return html`
        <section class="mt-5">
            <div class="container">
                <h1 class="title">Documentation</h1>
                <div class="card">
                    <header class="card-header">
                        <p class="card-header-title">API Access</p>
                    </header>
                    <div class="card-content">
                        <div class="content">
                            The API endpoint for version 1 of the API is available at <a href="${window.appconfig.dynamicZonesBaseUrl}">${window.appconfig.dynamicZonesBaseUrl}</a>. Please visit the <a href="${window.appconfig.dynamicZonesBaseUrl}/swagger-index.html">Swagger UI</a> to view the API documentation.
                
                        </div>
                        <div class="content">
                            Use can use <a href="../client/dist/sdk.gen.js">this JS client</a> or the <a href="../client/dist/sdk.gen.mjs">module variant</a> to access the API.
            
                        </div>
                    </div>
                </div>

            </div>
        </section>
    `
}
