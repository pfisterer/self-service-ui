import { html } from 'htm/preact';

export function Documentation() {
    const base = window.appconfig.dynamicZonesBaseUrl
    const jsSdkUrl = new URL('../client/dist/sdk.gen.js', base).href;
    const jsClientUrl = new URL('../client/dist/client.gen.js', base).href;

    const mjsSdkUrl = new URL('../client/dist/sdk.gen.mjs', base).href;
    const mjsClientUrl = new URL('../client/dist/client.gen.mjs', base).href;

    const swaggerUrl = new URL('/swagger-index.html', base).href;

    return html`
        <section class="mt-5">
            <div class="container">
                <h1 class="title">Documentation</h1>

                <div class="panel">
                   <div class="panel-heading">Dynamic Zones API Access</div>

                   <div class="panel-block" style="gap: 10px; align-items: center;">
                       <div>
                            The API endpoint is available at <code>${window.appconfig.dynamicZonesBaseUrl}</code>. 

                            Please visit the <a href="${swaggerUrl}">Swagger UI</a> to view the API documentation.
                       </div>
                    </div>

                   <div class="panel-block" style="gap: 10px; align-items: center;">
                       <div>
                            JavaScript (<a href="${jsClientUrl}">Client</a> and <a href="${jsSdkUrl}">SDKs</a>) and ESM-Module (<a href="${mjsClientUrl}">Client</a> and <a href="${mjsSdkUrl}">SDKs</a>) clients are available for accessing the API.
                       </div>
                    </div>

                </div>
            </div>
        </section>
    `
}
